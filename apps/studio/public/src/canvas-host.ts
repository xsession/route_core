import {
  DEFAULT_DARK_THEME,
  DEFAULT_LIGHT_THEME,
  EditorInteractionController,
  HarnessEditorEngine,
  ViewportController,
  contentBoundsFromSvgContext,
  formatNumber,
  renderEditorSvg,
  roundedOrthogonalPath,
  viewportWorldRect,
  type EditorDocument,
  type DrawingElement,
  type EditorPointerEvent,
  type HitResult,
  type Point,
  type RenderOptions,
  type SelectionRef,
  type SvgInteractionOverlay,
  type ViewportState,
  type WireEdge,
} from '../vendor/editor-core/index.js';
import { clamp, isTextEntryTarget } from './dom.js';
import type { EditorCallbacks, EditorTool } from './types.js';

const EMPTY_OVERLAY: SvgInteractionOverlay = {};

function escapeXmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cursorForTool(tool: EditorTool): string {
  const cursors: Record<EditorTool, string> = {
    select: 'default',
    pan: 'grab',
    wire: 'crosshair',
    label: 'text',
    component: 'copy',
  };
  return cursors[tool];
}

function completeViewport(value: Partial<ViewportState> | undefined, width: number, height: number): ViewportState {
  const zoom = Number(value?.zoom);
  const panX = Number(value?.pan?.x);
  const panY = Number(value?.pan?.y);
  return {
    pan: {
      x: Number.isFinite(panX) ? panX : 0,
      y: Number.isFinite(panY) ? panY : 0,
    },
    zoom: Number.isFinite(zoom) && zoom > 0 ? clamp(zoom, 0.05, 16) : 1,
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

export class CanvasHost {
  private readonly shell: HTMLElement;
  private readonly canvas: HTMLElement;
  private readonly emptyState: HTMLElement;
  private readonly coordinates: HTMLElement;
  private readonly connectionHint: HTMLElement;
  private readonly callbacks: EditorCallbacks;
  private engineValue: HarnessEditorEngine;
  private interaction: EditorInteractionController;
  private viewportValue: ViewportController;
  private overlay: SvgInteractionOverlay = EMPTY_OVERLAY;
  private drawingElements: DrawingElement[] = [];
  private harnessViewValue = false;
  private toolValue: EditorTool = 'select';
  private dark = true;
  private pointerCapture: number | null = null;
  private spaceDown = false;
  private inputEnabled = true;
  private showRouteHandles = true;
  private showDiagnostics = true;
  private lastScreenPoint: Point = { x: 0, y: 0 };
  private suppressNextClick = false;
  private readonly resizeObserver: ResizeObserver;

  public constructor(
    shell: HTMLElement,
    canvas: HTMLElement,
    emptyState: HTMLElement,
    coordinates: HTMLElement,
    connectionHint: HTMLElement,
    initialDocument: EditorDocument,
    viewport: Partial<ViewportState> | undefined,
    callbacks: EditorCallbacks,
  ) {
    this.shell = shell;
    this.canvas = canvas;
    this.emptyState = emptyState;
    this.coordinates = coordinates;
    this.connectionHint = connectionHint;
    this.callbacks = callbacks;
    const bounds = shell.getBoundingClientRect();
    this.viewportValue = new ViewportController(completeViewport(viewport, bounds.width, bounds.height));
    this.engineValue = new HarnessEditorEngine(initialDocument, { autoRoute: true, validateOnChange: true, historyLimit: 300 });
    this.interaction = this.createInteraction();
    this.bindDomEvents();
    this.bindEngineEvents();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(shell);
    this.resize();
  }

  public get engine(): HarnessEditorEngine {
    return this.engineValue;
  }

  public get viewport(): Readonly<ViewportState> {
    return this.viewportValue.state;
  }

  public get zoomPercent(): number {
    return Math.round(this.viewportValue.state.zoom * 100);
  }

  public get tool(): EditorTool {
    return this.toolValue;
  }

  public setInputEnabled(enabled: boolean): void {
    if (this.inputEnabled === enabled) return;
    this.inputEnabled = enabled;
    if (!enabled) {
      if (this.pointerCapture !== null) {
        this.interaction.pointerCancel(this.pointerCapture);
        if (this.shell.hasPointerCapture(this.pointerCapture)) this.shell.releasePointerCapture(this.pointerCapture);
        this.pointerCapture = null;
      }
      this.spaceDown = false;
    }
    this.shell.style.cursor = enabled ? cursorForTool(this.toolValue) : 'default';
  }

  public load(document: EditorDocument, viewport?: Partial<ViewportState>): void {
    if (this.engineValue.isPreviewActive) this.engineValue.cancelPreview();
    const bounds = this.shell.getBoundingClientRect();
    this.viewportValue = new ViewportController(completeViewport(viewport, bounds.width, bounds.height));
    this.engineValue = new HarnessEditorEngine(document, { autoRoute: true, validateOnChange: true, historyLimit: 300 });
    this.interaction = this.createInteraction();
    this.bindEngineEvents();
    this.overlay = {};
    this.render();
    this.callbacks.onSelectionChanged(this.engineValue.selection);
    this.callbacks.onValidationChanged();
    this.callbacks.onViewportChanged(this.viewportValue.state as ViewportState);
  }

  public setTheme(dark: boolean): void {
    this.dark = dark;
    this.render();
  }

  public setTool(tool: EditorTool): void {
    if (this.engineValue.isPreviewActive) this.engineValue.cancelPreview();
    this.toolValue = tool;
    this.shell.style.cursor = this.inputEnabled ? cursorForTool(tool) : 'default';
    const message: Record<EditorTool, string> = {
      select: 'Select and manipulate entities.',
      pan: 'Drag to pan the drawing.',
      wire: 'Drag from one port to another to create a wire.',
      label: 'Click the canvas to place an annotation.',
      component: 'Click the canvas to place the selected library component.',
    };
    this.callbacks.onStatus(message[tool]);
  }

  public setShowRouteHandles(value: boolean): void {
    this.showRouteHandles = value;
    this.render();
  }

  public setShowDiagnostics(value: boolean): void {
    this.showDiagnostics = value;
    this.render();
  }

  public setDrawingElements(elements: readonly DrawingElement[] = []): void {
    this.drawingElements = elements.map((element) => structuredClone(element));
    this.render();
  }

  public toggleGrid(): boolean {
    this.engineValue.execute('Toggle grid', (draft) => {
      draft.settings.grid.visible = !draft.settings.grid.visible;
    });
    return this.engineValue.document.settings.grid.visible;
  }

  public toggleSnap(): boolean {
    this.engineValue.execute('Toggle snapping', (draft) => {
      draft.settings.grid.snap = !draft.settings.grid.snap;
    });
    return this.engineValue.document.settings.grid.snap;
  }

  public undo(): void {
    this.engineValue.undo();
  }

  public redo(): void {
    this.engineValue.redo();
  }

  public cancelWirePreview(): void {
    if (this.engineValue.isPreviewActive) this.engineValue.cancelPreview();
  }

  public autoRouteSelection(): void {
    const wireIds = this.engineValue.selection.items.filter((item) => item.kind === 'wire').map((item) => item.id);
    this.engineValue.autoRoute(wireIds.length ? wireIds : undefined);
  }

  public rotateSelection(clockwise = true): void {
    const ids = this.engineValue.selection.items.filter((item) => item.kind === 'component').map((item) => item.id);
    if (!ids.length) {
      this.callbacks.onStatus('Select one or more components to rotate.', 'warning');
      return;
    }
    this.engineValue.rotateComponents(ids, clockwise);
  }

  public deleteSelection(detachConnected = true): void {
    const items = [...this.engineValue.selection.items];
    for (const item of items) {
      try {
        if (item.kind === 'wire') this.engineValue.removeWire(item.id);
        else if (item.kind === 'label') this.engineValue.removeLabel(item.id);
        else if (item.kind === 'component') this.engineValue.removeComponent(item.id, detachConnected ? 'detach' : 'prevent');
      } catch (error) {
        this.callbacks.onStatus(error instanceof Error ? error.message : String(error), 'error');
      }
    }
    this.engineValue.clearSelection();
  }

  public fit(): void {
    const document = this.engineValue.document as EditorDocument;
    if (!document.componentOrder.length && !document.wireOrder.length && !document.labelOrder.length) {
      this.viewportValue = new ViewportController(completeViewport(undefined, this.shell.clientWidth, this.shell.clientHeight));
      this.render();
      this.emitViewport();
      return;
    }
    const bounds = contentBoundsFromSvgContext(document, {
      geometries: this.engineValue.geometries as Record<string, never>,
      labelPlacements: [...this.engineValue.labelPlacements],
      selection: this.engineValue.selection,
      theme: this.dark ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME,
      options: { showGrid: document.settings.grid.visible },
    });
    this.viewportValue.fit(bounds, 58);
    this.render();
    this.emitViewport();
  }

  public zoomAtCenter(factor: number): void {
    this.viewportValue.zoomAt({ x: this.shell.clientWidth / 2, y: this.shell.clientHeight / 2 }, factor);
    this.render();
    this.emitViewport();
  }

  public resetZoom(): void {
    const state = this.viewportValue.state;
    const center = this.viewportValue.screenToWorld({ x: state.width / 2, y: state.height / 2 });
    const next = completeViewport({
      zoom: 1,
      pan: {
        x: state.width / 2 - center.x,
        y: state.height / 2 - center.y,
      },
    }, state.width, state.height);
    this.viewportValue = new ViewportController(next);
    this.render();
    this.emitViewport();
  }

  public centerOnSelection(): void {
    const primary = this.engineValue.selection.primary;
    if (!primary) return;
    if (primary.kind === 'component') {
      const geometry = this.engineValue.geometries[primary.id];
      if (geometry) {
        this.viewportValue.fit(geometry.worldBounds, 120);
        this.render();
        this.emitViewport();
      }
      return;
    }
    if (primary.kind === 'wire') {
      const points = this.engineValue.document.wires[primary.id]?.route?.points || [];
      if (points.length) {
        const minX = Math.min(...points.map((point) => point.x));
        const minY = Math.min(...points.map((point) => point.y));
        const maxX = Math.max(...points.map((point) => point.x));
        const maxY = Math.max(...points.map((point) => point.y));
        this.viewportValue.fit({ x: minX, y: minY, width: Math.max(10, maxX - minX), height: Math.max(10, maxY - minY) }, 120);
        this.render();
        this.emitViewport();
      }
    }
  }

  public select(items: SelectionRef[]): void {
    this.engineValue.select(items, items[0]);
  }

  /** Harness (loom) view: draws a cable sheath over every cable group in the schematic. */
  public get harnessView(): boolean { return this.harnessViewValue; }
  public setHarnessView(value: boolean): void {
    this.harnessViewValue = value;
    this.render();
  }

  public render(): void {
    const document = this.engineValue.document as EditorDocument;
    const options: Partial<RenderOptions> = {
      viewport: viewportWorldRect(this.viewportValue.state),
      showGrid: document.settings.grid.visible,
      showPorts: true,
      showLabels: true,
      showRouteHandles: this.showRouteHandles,
      showSelection: true,
      showDiagnostics: this.showDiagnostics,
      includeAccessibility: true,
    };
    this.canvas.innerHTML = renderEditorSvg(document, {
      geometries: this.engineValue.geometries as Record<string, never>,
      labelPlacements: [...this.engineValue.labelPlacements],
      selection: this.engineValue.selection,
      theme: this.dark ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME,
      options,
      overlay: this.overlay,
      drawingElements: this.drawingElements,
    });
    this.applyLoomLayer(document);
    this.shell.style.background = this.dark ? DEFAULT_DARK_THEME.background : DEFAULT_LIGHT_THEME.background;
    this.emptyState.hidden = document.componentOrder.length > 0 || document.wireOrder.length > 0 || document.labelOrder.length > 0;
  }

  /**
   * Harness (loom) overlay: groups the schematic's conductors by cable
   * (metadata.cableDefinitionId) and, for every group of 2+ cores, paints a
   * thick translucent sheath under the wires so the harness reads as a bundle
   * — the standard loom grouping used in harness schematics. Rendered after
   * the core SVG into a dedicated layer so hit-testing is unaffected.
   */
  private applyLoomLayer(doc: EditorDocument): void {
    const svg = this.canvas.querySelector<SVGSVGElement>('svg');
    const existing = svg?.querySelector<SVGGElement>('#routecore-loom-layer');
    if (existing) existing.remove();
    if (!svg || !this.harnessViewValue) return;
    const groups = new Map<string, { name: string; wires: WireEdge[] }>();
    for (const wire of doc.wireOrder.map((id) => doc.wires[id]).filter((wire): wire is WireEdge => Boolean(wire))) {
      const groupKey = typeof wire.metadata?.cableDefinitionId === 'string' ? `def:${wire.metadata.cableDefinitionId}` :
        typeof wire.metadata?.cableName === 'string' ? `name:${wire.metadata.cableName}` :
          (wire.kind === 'cable-core' || wire.kind === 'bundle') ? 'unassigned' : null;
      if (!groupKey) continue;
      const group = groups.get(groupKey) || { name: typeof wire.metadata?.cableName === 'string' ? wire.metadata.cableName as string : 'Harness', wires: [] };
      group.wires.push(wire);
      groups.set(groupKey, group);
    }
    const layers: string[] = [];
    let index = 0;
    for (const [groupKey, group] of groups) {
      const paths: string[] = [];
      let maxOutline = 1;
      for (const wire of group.wires) {
        if (!wire.route?.points?.length || wire.hidden) continue;
        paths.push(roundedOrthogonalPath(wire.route.points, wire.routing.requestedRadius).path);
        maxOutline = Math.max(maxOutline, wire.style.outlineWidth);
      }
      if (paths.length < 2) continue;
      const sheathWidth = Math.max(5, (maxOutline + 3) * paths.length * 0.72);
      index += 1;
      layers.push(`<g id="routecore-loom-${index}" data-loom="${escapeXmlAttr(groupKey)}" pointer-events="none"><title>${escapeXmlAttr(group.name)} — ${paths.length} cores</title>${paths.map((path) => `<path d="${path}" fill="none" stroke="${this.dark ? '#64748b' : '#475569'}" stroke-width="${formatNumber(sheathWidth)}" stroke-opacity="${this.dark ? 0.34 : 0.4}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><path d="${path}" fill="none" stroke="${this.dark ? '#94a3b8' : '#1e293b'}" stroke-opacity="0.25" stroke-width="${formatNumber(sheathWidth + 1.5)}" stroke-dasharray="10 6" vector-effect="non-scaling-stroke"/>`).join('')}</g>`);
    }
    if (!layers.length) return;
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.id = 'routecore-loom-layer';
    const wireLayer = svg.querySelector('#editor-core-wire-layer');
    const fragment = document.createRange().createContextualFragment(`<g id="routecore-loom-inner">${layers.join('')}</g>`);
    layer.append(fragment);
    if (wireLayer?.parentNode) svg.insertBefore(layer, wireLayer);
    else svg.append(layer);
  }

  private createInteraction(): EditorInteractionController {
    const interaction = new EditorInteractionController(this.engineValue, {
      zoom: () => this.viewportValue.state.zoom,
      enableTouchPan: true,
    });
    interaction.on('snapGuidesChanged', ({ guides }) => {
      this.overlay = { ...this.overlay, snapGuides: guides };
      this.render();
    });
    interaction.on('marqueeChanged', (value) => {
      this.overlay = { ...this.overlay, marquee: value.bounds && value.mode ? { bounds: value.bounds, mode: value.mode } : undefined };
      this.render();
    });
    interaction.on('connectionPreview', (value) => {
      this.overlay = {
        ...this.overlay,
        connection: value.source && value.point
          ? { source: value.source, target: value.target, point: value.point, valid: Boolean(value.valid), reason: value.reason }
          : undefined,
      };
      this.connectionHint.hidden = !value.source;
      this.connectionHint.textContent = value.reason || (value.valid ? 'Release to connect.' : 'Choose a target port.');
      this.connectionHint.className = `connection-hint${value.valid ? ' valid' : value.source ? ' invalid' : ''}`;
      this.render();
    });
    interaction.on('panRequested', ({ delta }) => {
      this.viewportValue.pan({ x: delta.x * this.viewportValue.state.zoom, y: delta.y * this.viewportValue.state.zoom });
      this.suppressNextClick = true;
      this.render();
      this.emitViewport();
    });
    interaction.on('cursorRequested', ({ cursor }) => {
      if (this.toolValue === 'select' || this.toolValue === 'wire') this.shell.style.cursor = cursor;
    });
    interaction.on('contextMenuRequested', ({ point, hit }) => {
      const screenPoint = this.viewportValue.worldToScreen(point);
      this.callbacks.onContextMenu(screenPoint, point, hit);
    });
    return interaction;
  }

  private bindEngineEvents(): void {
    this.engineValue.on('documentChanged', ({ document, reason }) => {
      this.render();
      this.callbacks.onDocumentChanged(document, reason);
    });
    this.engineValue.on('selectionChanged', ({ selection }) => {
      this.render();
      this.callbacks.onSelectionChanged(selection);
    });
    this.engineValue.on('validationChanged', () => {
      this.callbacks.onValidationChanged();
    });
    this.engineValue.on('feedback', (feedback) => {
      this.callbacks.onStatus(feedback.message, feedback.kind === 'error' ? 'error' : feedback.kind === 'warning' ? 'warning' : 'info');
    });
    this.engineValue.on('historyChanged', () => {
      this.callbacks.onSelectionChanged(this.engineValue.selection);
    });
  }

  private bindDomEvents(): void {
    this.shell.addEventListener('pointerdown', (event) => {
      if (!this.inputEnabled) return;
      // Right-click cancels an in-progress wire preview before the gesture
      // reaches the interaction controller (it would otherwise open a menu).
      if (event.button === 2 && this.toolValue === 'wire' && this.engineValue.isPreviewActive) {
        this.engineValue.cancelPreview();
        this.callbacks.onStatus('Cancelled wire drawing — press W to try again.');
        return;
      }
      this.shell.focus();
      this.lastScreenPoint = this.eventScreenPoint(event);
      const pointerEvent = this.pointerEvent(event);
      if (event.button === 0 && this.toolValue === 'component') {
        event.preventDefault();
        this.callbacks.onPlaceRequested(pointerEvent.point);
        return;
      }
      if (event.button === 0 && this.toolValue === 'label') {
        event.preventDefault();
        this.callbacks.onLabelRequested(pointerEvent.point);
        return;
      }
      if (this.toolValue === 'pan') pointerEvent.modifiers.space = true;
      this.pointerCapture = event.pointerId;
      this.shell.setPointerCapture(event.pointerId);
      this.interaction.pointerDown(pointerEvent);
    });
    this.shell.addEventListener('pointermove', (event) => {
      if (!this.inputEnabled) return;
      this.lastScreenPoint = this.eventScreenPoint(event);
      const pointer = this.pointerEvent(event);
      this.coordinates.textContent = `X ${pointer.point.x.toFixed(1)}   Y ${pointer.point.y.toFixed(1)}`;
      this.callbacks.onCoordinates(pointer.point);
      if (this.toolValue === 'pan') pointer.modifiers.space = true;
      this.interaction.pointerMove(pointer);
    });
    this.shell.addEventListener('pointerup', (event) => {
      if (!this.inputEnabled) return;
      const pointer = this.pointerEvent(event);
      if (this.toolValue === 'pan') pointer.modifiers.space = true;
      this.interaction.pointerUp(pointer);
      if (this.pointerCapture === event.pointerId && this.shell.hasPointerCapture(event.pointerId)) this.shell.releasePointerCapture(event.pointerId);
      this.pointerCapture = null;
      this.suppressNextClick = false;
    });
    this.shell.addEventListener('pointercancel', (event) => {
      if (!this.inputEnabled) return;
      this.interaction.pointerCancel(event.pointerId);
      this.pointerCapture = null;
    });
    this.shell.addEventListener('contextmenu', (event) => {
      if (this.inputEnabled) event.preventDefault();
    });
    this.shell.addEventListener('wheel', (event) => {
      if (!this.inputEnabled) return;
      event.preventDefault();
      const bounds = this.shell.getBoundingClientRect();
      this.viewportValue.zoomAt({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, Math.exp(-event.deltaY * 0.0014));
      this.render();
      this.emitViewport();
    }, { passive: false });
    this.shell.addEventListener('dblclick', (event) => {
      if (!this.inputEnabled) return;
      if (this.suppressNextClick) return;
      const target = event.target as Element | null;
      const component = target?.closest<SVGGElement>('[data-component-id]')?.dataset.componentId;
      const wire = target?.closest<SVGGElement>('[data-wire-id]')?.dataset.wireId;
      const label = target?.closest<SVGGElement>('[data-label-id]')?.dataset.labelId;
      if (component) this.engineValue.select([{ kind: 'component', id: component }]);
      else if (wire) this.engineValue.select([{ kind: 'wire', id: wire }]);
      else if (label) this.engineValue.select([{ kind: 'label', id: label }]);
      this.callbacks.onStatus('Use the Properties panel to edit the selected entity.');
    });
    window.addEventListener('keydown', (event) => {
      if (!this.inputEnabled) return;
      if (event.code === 'Space' && !isTextEntryTarget(event.target)) {
        this.spaceDown = true;
        if (!event.repeat) this.shell.style.cursor = 'grab';
      }
      if (isTextEntryTarget(event.target)) return;
      const handled = this.interaction.keyDown(event.key, {
        shift: event.shiftKey,
        alt: event.altKey,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        space: this.spaceDown,
      });
      if (handled) event.preventDefault();
    });
    window.addEventListener('keyup', (event) => {
      if (!this.inputEnabled) return;
      if (event.code === 'Space') {
        this.spaceDown = false;
        this.shell.style.cursor = cursorForTool(this.toolValue);
      }
    });
  }

  private pointerEvent(event: PointerEvent): EditorPointerEvent {
    const screenPoint = this.eventScreenPoint(event);
    return {
      pointerId: event.pointerId,
      point: this.viewportValue.screenToWorld(screenPoint),
      screenPoint,
      button: (event.button === 1 ? 1 : event.button === 2 ? 2 : 0),
      buttons: event.buttons,
      pointerType: event.pointerType === 'pen' || event.pointerType === 'touch' ? event.pointerType : 'mouse',
      pressure: event.pressure,
      modifiers: {
        shift: event.shiftKey,
        alt: event.altKey,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        space: this.spaceDown,
      },
      timestamp: event.timeStamp,
    };
  }

  private eventScreenPoint(event: PointerEvent): Point {
    const bounds = this.shell.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  private resize(): void {
    const bounds = this.shell.getBoundingClientRect();
    this.viewportValue.resize(Math.max(1, bounds.width), Math.max(1, bounds.height));
    this.render();
    this.emitViewport();
  }

  private emitViewport(): void {
    this.callbacks.onViewportChanged(this.viewportValue.state as ViewportState);
  }
}
