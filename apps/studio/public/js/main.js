import { DEFAULT_DARK_THEME, DEFAULT_LIGHT_THEME, HarnessEditorEngine, contrastingText, createEmptyDocument, renderEditorSvg, } from '../vendor/editor-core/index.js';
import { StudioApi } from './api.js';
import { CanvasHost } from './canvas-host.js';
import { buildCustomLibraryComponent, createFreeLabel, duplicateComponent, instantiateLibraryComponent, } from './component-factory.js';
import { byId, checked, clamp, createId, debounce, escapeAttribute, escapeHtml, fieldRow, formatDate, formatNumber, isTextEntryTarget, query, queryOptional, selectControl, selected, textControl, } from './dom.js';
import { ModalManager, toast } from './modal.js';
const APPLICATION_NAME = 'RouteCore Offline Studio';
const PROJECT_EXTENSION = '.routecore';
const STORAGE_NAMESPACE = 'routecore';
const LEGACY_STORAGE_NAMESPACE = 'ohcad';
function readLocalSetting(name) {
    const key = `${STORAGE_NAMESPACE}.${name}`;
    const current = localStorage.getItem(key);
    if (current !== null)
        return current;
    const legacy = localStorage.getItem(`${LEGACY_STORAGE_NAMESPACE}.${name}`);
    if (legacy !== null)
        localStorage.setItem(key, legacy);
    return legacy;
}
function writeLocalSetting(name, value) {
    localStorage.setItem(`${STORAGE_NAMESPACE}.${name}`, value);
}
const ROUTE_PATTERNS = [
    'direct',
    'orthogonal',
    'horizontal-first',
    'vertical-first',
    'dogleg-horizontal',
    'dogleg-vertical',
    'trunk-horizontal',
    'trunk-vertical',
    'manual',
];
const ELECTRICAL_CLASSES = [
    'unknown',
    'passive',
    'power-input',
    'power-output',
    'signal-input',
    'signal-output',
    'bidirectional',
    'ground',
    'shield',
];
const SIDES = ['west', 'east', 'north', 'south'];
const COMPONENT_KINDS = ['connector', 'device', 'inline-device', 'passive', 'branch-point', 'termination', 'terminal-point', 'custom'];
const WIRE_KINDS = ['discrete', 'cable-core', 'shield', 'drain', 'bundle', 'mate', 'annotation'];
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function primaryPatternColor(pattern) {
    switch (pattern.kind) {
        case 'solid': return pattern.color;
        case 'stripe': return pattern.base;
        case 'tracer': return pattern.base;
        case 'dual': return pattern.primary;
        case 'shield': return pattern.core || pattern.sheath;
        case 'custom': return pattern.layers[0]?.color || '#64748b';
    }
}
function secondaryPatternColor(pattern) {
    switch (pattern.kind) {
        case 'stripe': return pattern.stripe;
        case 'tracer': return pattern.tracer;
        case 'dual': return pattern.secondary;
        case 'shield': return pattern.sheath;
        case 'custom': return pattern.layers[1]?.color || '#ffffff';
        default: return '#ffffff';
    }
}
function makePattern(kind, primary, secondary) {
    switch (kind) {
        case 'solid': return { kind, color: primary };
        case 'stripe': return { kind, base: primary, stripe: secondary, stripeWidth: 1.4, repeat: 14 };
        case 'tracer': return { kind, base: primary, tracer: secondary, repeat: 16, tracerLength: 5 };
        case 'dual': return { kind, primary, secondary, ratio: 0.55 };
        case 'shield': return { kind, sheath: secondary, core: primary };
        case 'custom': return { kind, layers: [{ color: primary, width: 4 }, { color: secondary, width: 1.4, dash: [5, 8] }] };
    }
}
function endpointLabel(wire, end, document) {
    const endpoint = wire[end];
    if (endpoint.kind === 'port') {
        const component = document.components[endpoint.componentId];
        const port = component?.ports.find((value) => value.id === endpoint.portId);
        return `${component?.designator || endpoint.componentId}.${port?.label || endpoint.portId}`;
    }
    if (endpoint.kind === 'off-page')
        return `OFFPAGE:${endpoint.reference}`;
    if (endpoint.kind === 'junction')
        return `JUNCTION:${endpoint.junctionId}`;
    return `FREE(${formatNumber(endpoint.point.x)}, ${formatNumber(endpoint.point.y)})`;
}
function entityRefForId(document, id) {
    if (document.components[id])
        return { kind: 'component', id };
    if (document.wires[id])
        return { kind: 'wire', id };
    if (document.labels[id])
        return { kind: 'label', id };
    for (const componentId of document.componentOrder) {
        if (document.components[componentId]?.ports.some((port) => port.id === id))
            return { kind: 'port', id: componentId, subId: id };
    }
    return undefined;
}
function selectionDescription(selection) {
    if (!selection.items.length)
        return 'No selection';
    const counts = new Map();
    for (const item of selection.items)
        counts.set(item.kind, (counts.get(item.kind) || 0) + 1);
    return [...counts].map(([kind, count]) => `${count} ${kind}${count === 1 ? '' : 's'}`).join(', ');
}
function pageForView(workspace, modelId, viewKind) {
    return workspace.pages.find((page) => page.modelId === modelId && page.viewKind === viewKind)
        || workspace.pages.find((page) => page.modelId === modelId);
}
class StudioApplication {
    api = new StudioApi();
    modal = new ModalManager();
    bootstrap;
    workspace;
    components = [];
    cables = [];
    host;
    activeLeftTab = 'explorer';
    activeRightTab = 'properties';
    activeBottomTab = 'problems';
    bottomOpen = true;
    theme = 'dark';
    libraryQuery = '';
    pendingPlacementId = null;
    commandLog = [];
    exports = [];
    outputLines = [];
    saveRevision = 0;
    savedRevision = 0;
    saveChain = Promise.resolve();
    lastSaveReason = 'loaded';
    currentViewport;
    menuOpen = null;
    splitDrag = null;
    queueSave = debounce(() => void this.saveNow(), 420);
    async start() {
        try {
            this.setStatus('Opening local project database…');
            this.bootstrap = await this.api.get('/api/bootstrap');
            this.workspace = this.bootstrap.workspace;
            this.components = this.bootstrap.library.components;
            this.cables = this.bootstrap.library.cables;
            this.theme = this.resolveTheme(this.bootstrap.settings.theme);
            this.applyTheme();
            this.applyPanelSettings();
            this.host = new CanvasHost(byId('canvas-shell'), byId('canvas'), byId('canvas-empty'), byId('canvas-coordinates'), byId('connection-hint'), this.workspace.editor.document, this.workspace.workspace.viewportState, {
                onDocumentChanged: (document, reason) => this.onDocumentChanged(document, reason),
                onSelectionChanged: (selection) => this.onSelectionChanged(selection),
                onValidationChanged: () => this.onValidationChanged(),
                onStatus: (message, kind) => this.setStatus(message, kind),
                onViewportChanged: (viewport) => this.onViewportChanged(viewport),
                onCoordinates: () => undefined,
                onContextMenu: (screen, world, hit) => this.openContextMenu(screen, world, hit),
                onPlaceRequested: (point) => this.placePendingComponent(point),
                onLabelRequested: (point) => this.placeLabel(point),
            });
            this.host.setTheme(this.theme === 'dark');
            this.currentViewport = this.host.viewport;
            this.bindStaticUi();
            this.renderAll();
            if (!Number(this.workspace.workspace.viewportState.zoom))
                requestAnimationFrame(() => this.host.fit());
            this.exports = await this.api.get('/api/exports');
            this.log('success', `Opened ${this.workspace.meta.name} from ${this.workspace.path}`);
            this.setStatus('Ready. All project data is stored locally.', 'success');
            document.title = `${this.workspace.meta.name} — ${APPLICATION_NAME}`;
        }
        catch (error) {
            this.renderFatal(errorMessage(error));
        }
    }
    resolveTheme(value) {
        const local = readLocalSetting('theme');
        if (local === 'dark' || local === 'light')
            return local;
        if (value === 'dark' || value === 'light')
            return value;
        return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    applyTheme() {
        byId('app').dataset.theme = this.theme;
        writeLocalSetting('theme', this.theme);
        this.host?.setTheme(this.theme === 'dark');
    }
    applyPanelSettings() {
        const left = Number(this.bootstrap.settings.leftPanelWidth || readLocalSetting('left-width'));
        const right = Number(this.bootstrap.settings.rightPanelWidth || readLocalSetting('right-width'));
        const bottom = Number(this.bootstrap.settings.bottomPanelHeight || readLocalSetting('bottom-height'));
        if (Number.isFinite(left) && left >= 180)
            document.documentElement.style.setProperty('--left-width', `${left}px`);
        if (Number.isFinite(right) && right >= 230)
            document.documentElement.style.setProperty('--right-width', `${right}px`);
        if (Number.isFinite(bottom) && bottom >= 90)
            document.documentElement.style.setProperty('--bottom-height', `${bottom}px`);
    }
    bindStaticUi() {
        byId('new-project').addEventListener('click', () => void this.newProjectDialog());
        byId('open-project').addEventListener('click', () => void this.openProjectDialog());
        byId('checkpoint-project').addEventListener('click', () => void this.checkpoint());
        byId('undo').addEventListener('click', () => this.host.undo());
        byId('redo').addEventListener('click', () => this.host.redo());
        byId('add-component').addEventListener('click', () => this.activateLibraryPlacement());
        byId('empty-add-component').addEventListener('click', () => this.activateLibraryPlacement());
        byId('component-creator').addEventListener('click', () => void this.componentCreatorDialog());
        byId('add-label').addEventListener('click', () => this.setTool('label'));
        byId('cable-creator').addEventListener('click', () => void this.cableCreatorDialog());
        byId('auto-route').addEventListener('click', () => this.host.autoRouteSelection());
        byId('rotate-selection').addEventListener('click', () => this.host.rotateSelection());
        byId('generate-assembly').addEventListener('click', () => void this.generateAssemblyDialog());
        byId('zoom-out').addEventListener('click', () => this.host.zoomAtCenter(1 / 1.2));
        byId('zoom-in').addEventListener('click', () => this.host.zoomAtCenter(1.2));
        byId('zoom-readout').addEventListener('click', () => this.host.resetZoom());
        byId('fit-view').addEventListener('click', () => this.host.fit());
        byId('toggle-theme').addEventListener('click', () => void this.toggleTheme());
        byId('toggle-grid').addEventListener('click', () => {
            const value = this.host.toggleGrid();
            byId('toggle-grid').classList.toggle('active', value);
        });
        byId('toggle-snap').addEventListener('click', () => {
            const value = this.host.toggleSnap();
            byId('toggle-snap').classList.toggle('active', value);
        });
        byId('toggle-bottom').addEventListener('click', () => this.setBottomOpen(!this.bottomOpen));
        byId('close-bottom').addEventListener('click', () => this.setBottomOpen(false));
        byId('tool-route').addEventListener('click', () => this.host.autoRouteSelection());
        byId('tool-delete').addEventListener('click', () => this.host.deleteSelection(true));
        byId('tool-rail').addEventListener('click', (event) => {
            const button = event.target.closest('[data-tool]');
            if (button)
                this.setTool(button.dataset.tool);
        });
        document.querySelectorAll('[data-left-tab]').forEach((button) => button.addEventListener('click', () => {
            this.activeLeftTab = button.dataset.leftTab || 'explorer';
            this.updateTabButtons('[data-left-tab]', this.activeLeftTab, 'leftTab');
            this.renderLeftPanel();
        }));
        document.querySelectorAll('[data-right-tab]').forEach((button) => button.addEventListener('click', () => {
            this.activeRightTab = button.dataset.rightTab || 'properties';
            this.updateTabButtons('[data-right-tab]', this.activeRightTab, 'rightTab');
            this.renderInspector();
        }));
        document.querySelectorAll('[data-bottom-tab]').forEach((button) => button.addEventListener('click', () => {
            this.activeBottomTab = button.dataset.bottomTab || 'problems';
            this.updateTabButtons('[data-bottom-tab]', this.activeBottomTab, 'bottomTab');
            this.setBottomOpen(true);
            void this.renderBottomPanel();
        }));
        byId('model-tabs').addEventListener('click', (event) => {
            const button = event.target.closest('[data-model-id]');
            if (button)
                void this.switchModel(button.dataset.modelId);
        });
        byId('view-tabs').addEventListener('click', (event) => {
            const button = event.target.closest('[data-page-id]');
            if (button)
                void this.switchView(button.dataset.modelId, button.dataset.pageId, button.dataset.viewKind);
        });
        byId('left-content').addEventListener('click', (event) => this.handleLeftPanelClick(event));
        byId('left-content').addEventListener('input', (event) => {
            const input = event.target;
            if (input.id === 'library-search') {
                this.libraryQuery = input.value;
                this.renderLibraryResults();
            }
        });
        byId('right-content').addEventListener('change', (event) => this.handleInspectorChange(event));
        byId('right-content').addEventListener('click', (event) => void this.handleInspectorClick(event));
        byId('bottom-content').addEventListener('click', (event) => void this.handleBottomClick(event));
        byId('main-menu').addEventListener('click', (event) => {
            const trigger = event.target.closest('[data-menu]');
            if (trigger)
                this.toggleMenu(trigger.dataset.menu, trigger);
        });
        document.addEventListener('pointerdown', (event) => {
            if (!event.target.closest('.menu-popup, .menu-trigger'))
                this.closeMenus();
            if (!event.target.closest('.context-menu'))
                byId('context-menu-root').replaceChildren();
        });
        document.addEventListener('keydown', (event) => this.handleGlobalKeyDown(event), true);
        window.addEventListener('beforeunload', (event) => {
            if (this.saveRevision !== this.savedRevision)
                event.preventDefault();
        });
        document.querySelectorAll('[data-splitter]').forEach((splitter) => {
            splitter.addEventListener('pointerdown', (event) => this.beginSplitDrag(event, splitter.dataset.splitter));
        });
        window.addEventListener('pointermove', (event) => this.continueSplitDrag(event));
        window.addEventListener('pointerup', () => this.endSplitDrag());
    }
    updateTabButtons(selector, active, datasetKey) {
        document.querySelectorAll(selector).forEach((button) => {
            const value = button.dataset[datasetKey];
            button.classList.toggle('active', value === active);
        });
    }
    onDocumentChanged(document, reason) {
        this.workspace.editor.document = document;
        this.lastSaveReason = reason;
        if (!reason.startsWith('preview:') && !reason.startsWith('cancel:')) {
            this.saveRevision += 1;
            this.setSaveIndicator('dirty');
            this.queueSave();
            this.renderExplorer();
            this.renderInspector();
            void this.renderBottomPanel();
            this.updateCommandStates();
        }
        this.updateDocumentStatus();
    }
    onSelectionChanged(selection) {
        byId('selection-status').textContent = selectionDescription(selection);
        this.renderExplorer();
        this.renderInspector();
        this.updateCommandStates();
    }
    onValidationChanged() {
        const count = this.host.engine.validationIssues.length;
        const badge = byId('problem-count');
        badge.textContent = String(count);
        badge.classList.toggle('error', this.host.engine.validationIssues.some((issue) => issue.severity === 'error'));
        byId('route-status').textContent = count ? `${count} issue${count === 1 ? '' : 's'}` : 'Router ready';
        if (this.activeBottomTab === 'problems')
            void this.renderBottomPanel();
    }
    onViewportChanged(viewport) {
        this.currentViewport = { pan: { ...viewport.pan }, zoom: viewport.zoom, width: viewport.width, height: viewport.height };
        byId('zoom-readout').textContent = `${Math.round(viewport.zoom * 100)}%`;
    }
    renderAll() {
        this.renderModelTabs();
        this.renderViewTabs();
        this.renderBreadcrumb();
        this.renderLeftPanel();
        this.renderInspector();
        void this.renderBottomPanel();
        this.updateDocumentStatus();
        this.updateCommandStates();
        byId('toggle-grid').classList.toggle('active', this.workspace.editor.document.settings.grid.visible);
        byId('toggle-snap').classList.toggle('active', this.workspace.editor.document.settings.grid.snap);
        this.setBottomOpen(this.bottomOpen);
    }
    renderModelTabs() {
        const root = byId('model-tabs');
        root.innerHTML = this.workspace.models.map((model) => `
      <button class="model-tab${model.id === this.workspace.workspace.activeModelId ? ' active' : ''}" data-model-id="${escapeAttribute(model.id)}" title="${escapeAttribute(model.description || model.name)}">
        <span class="model-tab-kind">${escapeHtml(model.kind === 'assembly' ? 'ASM' : 'PLAN')}</span>
        <span class="model-tab-name">${escapeHtml(model.name)}</span>
      </button>`).join('');
    }
    renderViewTabs() {
        const root = byId('view-tabs');
        const pages = this.workspace.pages.filter((page) => page.modelId === this.workspace.workspace.activeModelId);
        root.innerHTML = pages.map((page) => `
      <button class="view-tab${page.id === this.workspace.workspace.activePageId && page.viewKind === this.workspace.workspace.activeViewKind ? ' active' : ''}"
        data-model-id="${escapeAttribute(page.modelId)}" data-page-id="${escapeAttribute(page.id)}" data-view-kind="${escapeAttribute(page.viewKind)}">
        ${page.viewKind === 'schematic' ? 'Schematic' : page.viewKind === 'layout' ? 'Layout' : escapeHtml(page.name)}
      </button>`).join('');
    }
    renderBreadcrumb() {
        const model = this.workspace.models.find((value) => value.id === this.workspace.workspace.activeModelId);
        const page = this.workspace.pages.find((value) => value.id === this.workspace.workspace.activePageId);
        byId('breadcrumb').innerHTML = `<strong>${escapeHtml(this.workspace.meta.name)}</strong> / ${escapeHtml(model?.name || 'Model')} / ${escapeHtml(page?.name || this.workspace.workspace.activeViewKind)}`;
    }
    renderLeftPanel() {
        if (this.activeLeftTab === 'explorer')
            this.renderExplorer();
        else if (this.activeLeftTab === 'library')
            this.renderLibrary();
        else
            this.renderBom();
    }
    renderExplorer() {
        if (this.activeLeftTab !== 'explorer')
            return;
        const document = this.host?.engine.document || this.workspace.editor.document;
        const selection = this.host?.engine.selection || { items: [] };
        const selectedKey = new Set(selection.items.map((item) => `${item.kind}:${item.id}:${item.subId ?? ''}`));
        const modelRows = this.workspace.models.map((model) => `
      <div class="tree-row${model.id === this.workspace.workspace.activeModelId ? ' selected' : ''}" data-tree-model="${escapeAttribute(model.id)}">
        <span class="tree-indent"></span><span class="tree-icon">${model.kind === 'assembly' ? '◇' : '◆'}</span><span class="tree-label">${escapeHtml(model.name)}</span><span class="tree-meta">${escapeHtml(model.kind)}</span>
      </div>`).join('');
        const componentRows = document.componentOrder.map((id) => {
            const component = document.components[id];
            return `<div class="tree-row${selectedKey.has(`component:${id}:`) ? ' selected' : ''}" data-tree-kind="component" data-tree-id="${escapeAttribute(id)}">
        <span class="tree-indent"></span><span class="tree-icon">▣</span><span class="tree-label">${escapeHtml(component.designator)} · ${escapeHtml(component.labels.subtitle || component.kind)}</span><span class="tree-meta">${component.ports.length}P</span>
      </div>`;
        }).join('');
        const wireRows = document.wireOrder.map((id) => {
            const wire = document.wires[id];
            return `<div class="tree-row${selectedKey.has(`wire:${id}:`) ? ' selected' : ''}" data-tree-kind="wire" data-tree-id="${escapeAttribute(id)}">
        <span class="tree-indent"></span><span class="wire-swatch" style="background:${escapeAttribute(primaryPatternColor(wire.style.pattern))}"></span><span class="tree-label">${escapeHtml(wire.label || wire.signal || id)}</span><span class="tree-meta">${formatNumber(wire.route?.length || 0)} lu</span>
      </div>`;
        }).join('');
        const labelRows = document.labelOrder.map((id) => {
            const label = document.labels[id];
            return `<div class="tree-row${selectedKey.has(`label:${id}:`) ? ' selected' : ''}" data-tree-kind="label" data-tree-id="${escapeAttribute(id)}">
        <span class="tree-indent"></span><span class="tree-icon">T</span><span class="tree-label">${escapeHtml(label.text)}</span><span class="tree-meta">${escapeHtml(label.mode)}</span>
      </div>`;
        }).join('');
        byId('left-content').innerHTML = `
      <section class="panel-section"><div class="panel-section-header">Models <span class="count">${this.workspace.models.length}</span></div><div class="tree">${modelRows}</div></section>
      <section class="panel-section"><div class="panel-section-header">Components <span class="count">${document.componentOrder.length}</span></div><div class="tree">${componentRows || '<div class="panel-empty">No components.</div>'}</div></section>
      <section class="panel-section"><div class="panel-section-header">Conductors <span class="count">${document.wireOrder.length}</span></div><div class="tree">${wireRows || '<div class="panel-empty">No wires.</div>'}</div></section>
      <section class="panel-section"><div class="panel-section-header">Annotations <span class="count">${document.labelOrder.length}</span></div><div class="tree">${labelRows || '<div class="panel-empty">No labels.</div>'}</div></section>`;
    }
    renderLibrary() {
        if (this.activeLeftTab !== 'library')
            return;
        byId('left-content').innerHTML = `
      <div class="search-box"><input id="library-search" class="search-input" type="search" placeholder="Search local component and cable library" value="${escapeAttribute(this.libraryQuery)}" /></div>
      <div id="library-results"></div>`;
        this.renderLibraryResults();
    }
    renderLibraryResults() {
        const root = queryOptional('#library-results', byId('left-content'));
        if (!root)
            return;
        const q = this.libraryQuery.trim().toLowerCase();
        const components = this.components.filter((item) => !q || `${item.name} ${item.category} ${item.partNumber} ${item.tags.join(' ')}`.toLowerCase().includes(q));
        const cables = this.cables.filter((item) => !q || `${item.name} ${item.partNumber} ${item.tags.join(' ')}`.toLowerCase().includes(q));
        root.innerHTML = `
      <section class="panel-section">
        <div class="panel-section-header">Components <span class="count">${components.length}</span></div>
        <div class="library-grid">${components.map((item) => `
          <article class="library-card${this.pendingPlacementId === item.id ? ' selected-card' : ''}" data-library-component="${escapeAttribute(item.id)}" tabindex="0">
            <div class="library-card-title"><span class="type">${escapeHtml(item.category)}</span><span>${escapeHtml(item.name)}</span></div>
            <div class="library-card-meta">${escapeHtml(item.manufacturer || 'Local')} ${item.partNumber ? `· ${escapeHtml(item.partNumber)}` : ''} · ${item.component.ports.length} ports</div>
            <div class="tag-list">${item.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>
          </article>`).join('') || '<div class="panel-empty">No matching components.</div>'}</div>
      </section>
      <section class="panel-section">
        <div class="panel-section-header">Cables <span class="count">${cables.length}</span></div>
        <div class="library-grid">${cables.map((item) => `
          <article class="library-card" data-library-cable="${escapeAttribute(item.id)}" tabindex="0">
            <div class="library-card-title"><span class="type">Cable</span><span>${escapeHtml(item.name)}</span></div>
            <div class="library-card-meta">${escapeHtml(item.partNumber || item.definition.kind)} · ${item.definition.cores.length} core${item.definition.cores.length === 1 ? '' : 's'}</div>
            <div class="core-swatches">${item.definition.cores.map((core) => `<span title="${escapeAttribute(core.label)}" style="background:${escapeAttribute(core.color)}"></span>`).join('')}</div>
          </article>`).join('') || '<div class="panel-empty">No matching cables.</div>'}</div>
      </section>`;
    }
    renderBom() {
        if (this.activeLeftTab !== 'bom')
            return;
        const rows = this.workspace.bom.map((item) => `
      <tr data-bom-id="${escapeAttribute(item.id)}"><td>${escapeHtml(item.entityKind)}</td><td class="mono">${escapeHtml(item.entityId)}</td><td>${escapeHtml(item.partNumber || '—')}</td><td>${formatNumber(item.quantity, 2)} ${escapeHtml(item.unit)}</td></tr>`).join('');
        byId('left-content').innerHTML = `
      <div class="panel-toolbar"><button class="primary-button" data-bom-add>Add for selection</button><button class="secondary-button" data-bom-export>Export CSV</button></div>
      <table class="data-table"><thead><tr><th>Type</th><th>Entity</th><th>Part</th><th>Qty</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="panel-empty">No BOM assignments yet.</td></tr>'}</tbody></table>`;
    }
    renderInspector() {
        const root = byId('right-content');
        const primary = this.host?.engine.selection.primary;
        if (!primary) {
            this.renderDocumentInspector(root);
            return;
        }
        if (primary.kind === 'component')
            this.renderComponentInspector(root, this.host.engine.document.components[primary.id]);
        else if (primary.kind === 'wire')
            this.renderWireInspector(root, this.host.engine.document.wires[primary.id]);
        else if (primary.kind === 'label')
            this.renderLabelInspector(root, this.host.engine.document.labels[primary.id]);
        else if (primary.kind === 'port' && typeof primary.subId === 'string') {
            const component = this.host.engine.document.components[primary.id];
            this.renderPortInspector(root, component, component?.ports.find((port) => port.id === primary.subId));
        }
        else
            root.innerHTML = '<div class="inspector-empty">The selected handle has no editable properties.</div>';
    }
    renderDocumentInspector(root) {
        const document = this.host?.engine.document || this.workspace.editor.document;
        const model = this.workspace.models.find((value) => value.id === this.workspace.workspace.activeModelId);
        if (this.activeRightTab === 'properties') {
            root.innerHTML = `
        <div class="inspector-title"><div class="inspector-title-row"><span class="inspector-entity-icon">◆</span><div class="inspector-name"><strong>${escapeHtml(model?.name || this.workspace.meta.name)}</strong><span>${escapeHtml(model?.kind || 'project model')}</span></div></div></div>
        <section class="panel-section"><div class="panel-section-header">Project</div><div class="panel-section-body form-grid">
          ${fieldRow('Name', textControl('project-name-inline', this.workspace.meta.name))}
          ${fieldRow('Organization', textControl('project-org-inline', this.workspace.meta.organization || ''))}
          ${fieldRow('File', `<div class="readout path-field">${escapeHtml(this.workspace.path)}</div>`, { stacked: true })}
          <div class="button-row"><button class="secondary-button" data-action="project-properties">Project properties</button><button class="secondary-button" data-action="integrity-check">Check database</button></div>
        </div></section>
        <section class="panel-section"><div class="panel-section-header">Document summary</div><div class="panel-section-body metrics-grid">
          <div><strong>${document.componentOrder.length}</strong><span>Components</span></div><div><strong>${document.wireOrder.length}</strong><span>Wires</span></div><div><strong>${document.labelOrder.length}</strong><span>Labels</span></div><div><strong>${this.host?.engine.validationIssues.length || 0}</strong><span>Issues</span></div>
        </div></section>`;
        }
        else if (this.activeRightTab === 'style') {
            root.innerHTML = `
        <section class="panel-section"><div class="panel-section-header">Canvas appearance</div><div class="panel-section-body form-grid">
          ${fieldRow('Grid visible', `<input id="document-grid-visible" class="form-control" type="checkbox"${checked(document.settings.grid.visible)} />`)}
          ${fieldRow('Grid spacing', textControl('document-grid-spacing', document.settings.grid.spacing, { type: 'number', min: 1, step: 1 }))}
          ${fieldRow('Major every', textControl('document-grid-major', document.settings.grid.majorEvery, { type: 'number', min: 1, step: 1 }))}
          ${fieldRow('Grid opacity', textControl('document-grid-opacity', document.settings.grid.opacity, { type: 'number', min: 0, max: 1, step: 0.05 }))}
          ${fieldRow('Theme', selectControl('document-theme', this.theme, ['dark', 'light']))}
        </div></section>`;
        }
        else {
            const routing = document.settings.defaultRouting;
            root.innerHTML = `
        <section class="panel-section"><div class="panel-section-header">Default routing rules</div><div class="panel-section-body form-grid">
          ${fieldRow('Pattern', selectControl('document-route-pattern', routing.pattern, ROUTE_PATTERNS))}
          ${fieldRow('Clearance', textControl('document-route-clearance', routing.clearance, { type: 'number', min: 0, step: 1 }))}
          ${fieldRow('Lead-in', textControl('document-route-leadin', routing.leadIn, { type: 'number', min: 0, step: 1 }))}
          ${fieldRow('Bend radius', textControl('document-route-radius', routing.requestedRadius, { type: 'number', min: 0, step: 1 }))}
          ${fieldRow('Min. segment', textControl('document-route-min-segment', routing.minimumSegment, { type: 'number', min: 0, step: 1 }))}
          ${fieldRow('Crossings', `<input id="document-route-crossings" class="form-control" type="checkbox"${checked(routing.allowCrossings)} />`)}
          <div class="button-row"><button class="primary-button" data-action="route-all">Route complete view</button></div>
        </div></section>`;
        }
    }
    renderComponentInspector(root, component) {
        if (!component) {
            root.innerHTML = '<div class="inspector-empty">Component no longer exists.</div>';
            return;
        }
        if (this.activeRightTab === 'properties') {
            root.innerHTML = `
        ${this.inspectorHeader('▣', component.designator, `${component.kind} · ${component.ports.length} ports`)}
        <section class="panel-section"><div class="panel-section-header">Identity</div><div class="panel-section-body form-grid">
          ${fieldRow('Designator', textControl('component-designator', component.designator))}
          ${fieldRow('Title', textControl('component-title', component.labels.title))}
          ${fieldRow('Subtitle', textControl('component-subtitle', component.labels.subtitle || ''))}
          ${fieldRow('Manufacturer', textControl('component-manufacturer', component.labels.manufacturer || ''))}
          ${fieldRow('Part number', textControl('component-part-number', component.labels.partNumber || ''))}
          ${fieldRow('Description', `<textarea id="component-description" class="form-textarea">${escapeHtml(component.labels.description || '')}</textarea>`, { stacked: true })}
        </div></section>
        <section class="panel-section"><div class="panel-section-header">Transform</div><div class="panel-section-body form-grid">
          <div class="inline-fields">${fieldRow('X', textControl('component-x', component.position.x, { type: 'number', step: 1 }))}${fieldRow('Y', textControl('component-y', component.position.y, { type: 'number', step: 1 }))}</div>
          ${fieldRow('Rotation', selectControl('component-rotation', String(component.rotation), ['0', '90', '180', '270']))}
          ${fieldRow('Locked', `<input id="component-locked" class="form-control" type="checkbox"${checked(component.locked)} />`)}
          ${fieldRow('Hidden', `<input id="component-hidden" class="form-control" type="checkbox"${checked(component.hidden)} />`)}
          <div class="button-row"><button class="secondary-button" data-action="component-rotate">Rotate 90°</button><button class="secondary-button" data-action="component-duplicate">Duplicate</button><button class="danger-button" data-action="component-delete">Delete</button></div>
        </div></section>
        <section class="panel-section"><div class="panel-section-header">Pins <span class="count">${component.ports.length}</span></div><div class="panel-section-body compact-table-wrap">
          <table class="data-table pin-list"><thead><tr><th>Pin</th><th>Function</th><th>Side</th></tr></thead><tbody>${component.ports.map((port) => `<tr data-action="select-port" data-port-id="${escapeAttribute(port.id)}"><td>${escapeHtml(port.label)}</td><td>${escapeHtml(port.function || '—')}</td><td>${escapeHtml(port.side)}</td></tr>`).join('')}</tbody></table>
          <div class="button-row"><button class="secondary-button" data-action="component-add-pin">Add pin</button><button class="secondary-button" data-action="component-edit-definition">Edit pin matrix</button></div>
        </div></section>`;
        }
        else if (this.activeRightTab === 'style') {
            const style = component.style || {};
            root.innerHTML = `
        ${this.inspectorHeader('▣', component.designator, 'Component appearance')}
        <section class="panel-section"><div class="panel-section-header">Body and rows</div><div class="panel-section-body form-grid">
          ${fieldRow('Body fill', textControl('component-body-fill', style.bodyFill || '#ffffff', { type: 'color' }))}
          ${fieldRow('Body stroke', textControl('component-body-stroke', style.bodyStroke || '#4b5563', { type: 'color' }))}
          ${fieldRow('Stroke width', textControl('component-body-stroke-width', style.bodyStrokeWidth ?? 1.5, { type: 'number', min: 0, step: 0.25 }))}
          ${fieldRow('Corner radius', textControl('component-body-radius', style.bodyRadius ?? 4, { type: 'number', min: 0, step: 1 }))}
          ${fieldRow('Header fill', textControl('component-header-fill', style.headerFill || '#f3f4f6', { type: 'color' }))}
          ${fieldRow('Row fill', textControl('component-row-fill', style.rowFill || '#ffffff', { type: 'color' }))}
          ${fieldRow('Alternate row', textControl('component-alt-row-fill', style.alternateRowFill || '#f9fafb', { type: 'color' }))}
          ${fieldRow('Pin dot', textControl('component-pin-fill', style.pinDotFill || '#111827', { type: 'color' }))}
        </div></section>
        <section class="panel-section"><div class="panel-section-header">Manual size</div><div class="panel-section-body form-grid">
          <div class="inline-fields">${fieldRow('Width', textControl('component-width', component.size?.width || component.layout.minimumSize.width, { type: 'number', min: 20 }))}${fieldRow('Height', textControl('component-height', component.size?.height || component.layout.minimumSize.height, { type: 'number', min: 20 }))}</div>
          ${fieldRow('Auto width', `<input id="component-auto-width" class="form-control" type="checkbox"${checked(component.layout.autoWidth)} />`)}
          ${fieldRow('Auto height', `<input id="component-auto-height" class="form-control" type="checkbox"${checked(component.layout.autoHeight)} />`)}
          <div class="button-row"><button class="secondary-button" data-action="component-fit-content">Fit to content</button></div>
        </div></section>`;
        }
        else {
            root.innerHTML = `
        ${this.inspectorHeader('▣', component.designator, 'Dynamic layout rules')}
        <section class="panel-section"><div class="panel-section-header">Geometry rules</div><div class="panel-section-body form-grid">
          ${fieldRow('Header height', textControl('component-header-height', component.layout.headerHeight, { type: 'number', min: 0, step: 1 }))}
          ${fieldRow('Row height', textControl('component-row-height', component.layout.rowHeight, { type: 'number', min: 8, step: 1 }))}
          ${fieldRow('Row gap', textControl('component-row-gap', component.layout.rowGap, { type: 'number', min: 0, step: 1 }))}
          ${fieldRow('Bank gap', textControl('component-bank-gap', component.layout.bankGap, { type: 'number', min: 0, step: 1 }))}
          ${fieldRow('Port lead-in', textControl('component-port-leadin', component.layout.portLeadIn, { type: 'number', min: 0, step: 1 }))}
          ${fieldRow('Obstacle padding', textControl('component-obstacle-padding', component.layout.obstaclePadding, { type: 'number', min: 0, step: 1 }))}
          ${fieldRow('Label gap', textControl('component-label-gap', component.layout.labelGap, { type: 'number', min: 0, step: 1 }))}
        </div></section>
        <section class="panel-section"><div class="panel-section-header">Pin banks <span class="count">${component.pinBanks.length}</span></div><div class="panel-section-body">${component.pinBanks.map((bank) => `
          <div class="bank-rule-card"><strong>${escapeHtml(bank.side)} bank</strong><span>${bank.portIds.length} pins · ${escapeHtml(bank.flow)}</span><label>Collapse empty <input type="checkbox" data-bank-collapse="${escapeAttribute(bank.id)}"${checked(bank.collapseEmpty)} /></label></div>`).join('') || '<div class="panel-empty">No explicit pin banks.</div>'}</div></section>`;
        }
    }
    renderPortInspector(root, component, port) {
        if (!component || !port) {
            root.innerHTML = '<div class="inspector-empty">Port no longer exists.</div>';
            return;
        }
        root.innerHTML = `
      ${this.inspectorHeader('●', `${component.designator}.${port.label}`, `${port.electricalClass} · ${port.side}`)}
      <section class="panel-section"><div class="panel-section-header">Port definition</div><div class="panel-section-body form-grid">
        ${fieldRow('Label', textControl('port-label', port.label))}
        ${fieldRow('Function', textControl('port-function', port.function || ''))}
        ${fieldRow('Detail', textControl('port-detail', port.detail || ''))}
        ${fieldRow('Side', selectControl('port-side', port.side, SIDES))}
        ${fieldRow('Electrical', selectControl('port-electrical', port.electricalClass, ELECTRICAL_CLASSES))}
        ${fieldRow('Max. connections', textControl('port-max-connections', port.connectionPolicy.maximumConnections, { type: 'number', min: 1, step: 1 }))}
        ${fieldRow('Visible', `<input id="port-visible" class="form-control" type="checkbox"${checked(port.visible)} />`)}
        ${fieldRow('Side fraction', textControl('port-side-fraction', port.sideFraction ?? '', { type: 'number', min: 0, max: 1, step: 0.05 }))}
        <div class="inline-fields">${fieldRow('Tangent offset', textControl('port-tangent-offset', port.tangentOffset || 0, { type: 'number', step: 1 }))}${fieldRow('Normal offset', textControl('port-normal-offset', port.normalOffset || 0, { type: 'number', step: 1 }))}</div>
        <div class="button-row"><button class="secondary-button" data-action="port-back">Back to component</button><button class="danger-button" data-action="port-delete">Delete pin</button></div>
      </div></section>`;
    }
    renderWireInspector(root, wire) {
        if (!wire) {
            root.innerHTML = '<div class="inspector-empty">Wire no longer exists.</div>';
            return;
        }
        if (this.activeRightTab === 'properties') {
            root.innerHTML = `
        ${this.inspectorHeader('⌁', wire.label || wire.id, `${wire.kind} · ${wire.route?.status || 'unrouted'}`)}
        <section class="panel-section"><div class="panel-section-header">Identity and endpoints</div><div class="panel-section-body form-grid">
          ${fieldRow('Label', textControl('wire-label', wire.label || ''))}
          ${fieldRow('Signal', textControl('wire-signal', wire.signal || ''))}
          ${fieldRow('Kind', selectControl('wire-kind', wire.kind, WIRE_KINDS))}
          ${fieldRow('Source', `<div class="readout">${escapeHtml(endpointLabel(wire, 'source', this.host.engine.document))}</div>`)}
          ${fieldRow('Target', `<div class="readout">${escapeHtml(endpointLabel(wire, 'target', this.host.engine.document))}</div>`)}
          ${fieldRow('Locked', `<input id="wire-locked" class="form-control" type="checkbox"${checked(wire.locked)} />`)}
          ${fieldRow('Hidden', `<input id="wire-hidden" class="form-control" type="checkbox"${checked(wire.hidden)} />`)}
        </div></section>
        <section class="panel-section"><div class="panel-section-header">Route</div><div class="panel-section-body form-grid">
          ${fieldRow('Pattern', selectControl('wire-route-pattern', wire.routing.pattern, ROUTE_PATTERNS))}
          ${fieldRow('Length', `<div class="readout">${formatNumber(wire.route?.length || 0)} logical units</div>`)}
          ${fieldRow('Bends', `<div class="readout">${wire.route?.bends ?? 0}</div>`)}
          ${fieldRow('Crossings', `<div class="readout">${wire.route?.crossings ?? 0}</div>`)}
          <div class="button-row"><button class="primary-button" data-action="wire-route">Route now</button><button class="secondary-button" data-action="wire-label-add">Add route label</button><button class="danger-button" data-action="wire-delete">Delete</button></div>
        </div></section>`;
        }
        else if (this.activeRightTab === 'style') {
            root.innerHTML = `
        ${this.inspectorHeader('⌁', wire.label || wire.id, 'Electrical color and visual pattern')}
        <section class="panel-section"><div class="panel-section-header">Wire paint</div><div class="panel-section-body form-grid">
          ${fieldRow('Pattern', selectControl('wire-color-pattern', wire.style.pattern.kind, ['solid', 'stripe', 'tracer', 'dual', 'shield', 'custom']))}
          ${fieldRow('Primary', textControl('wire-primary-color', primaryPatternColor(wire.style.pattern), { type: 'color' }))}
          ${fieldRow('Secondary', textControl('wire-secondary-color', secondaryPatternColor(wire.style.pattern), { type: 'color' }))}
          ${fieldRow('Width', textControl('wire-width', wire.style.width, { type: 'number', min: 0.5, step: 0.5 }))}
          ${fieldRow('Outline', textControl('wire-outline', wire.style.outlineWidth, { type: 'number', min: 0, step: 0.5 }))}
          ${fieldRow('Opacity', textControl('wire-opacity', wire.style.opacity, { type: 'number', min: 0.05, max: 1, step: 0.05 }))}
          ${fieldRow('Line cap', selectControl('wire-line-cap', wire.style.lineCap, ['round', 'butt', 'square']))}
          <div class="wire-preview"><span style="--wire-primary:${escapeAttribute(primaryPatternColor(wire.style.pattern))};--wire-secondary:${escapeAttribute(secondaryPatternColor(wire.style.pattern))}"></span><small>${escapeHtml(wire.style.pattern.kind)}</small></div>
        </div></section>`;
        }
        else {
            root.innerHTML = `
        ${this.inspectorHeader('⌁', wire.label || wire.id, 'Routing constraints and bend rules')}
        <section class="panel-section"><div class="panel-section-header">Geometry</div><div class="panel-section-body form-grid">
          ${fieldRow('Clearance', textControl('wire-clearance', wire.routing.clearance, { type: 'number', min: 0, step: 1 }))}
          ${fieldRow('Lead-in', textControl('wire-leadin', wire.routing.leadIn, { type: 'number', min: 0, step: 1 }))}
          ${fieldRow('Bend radius', textControl('wire-radius', wire.routing.requestedRadius, { type: 'number', min: 0, step: 1 }))}
          ${fieldRow('Minimum segment', textControl('wire-min-segment', wire.routing.minimumSegment, { type: 'number', min: 0, step: 1 }))}
          ${fieldRow('Routing grid', textControl('wire-routing-grid', wire.routing.grid, { type: 'number', min: 1, step: 1 }))}
          ${fieldRow('Allow crossings', `<input id="wire-allow-crossings" class="form-control" type="checkbox"${checked(wire.routing.allowCrossings)} />`)}
          ${fieldRow('Shared channels', `<input id="wire-shared-channels" class="form-control" type="checkbox"${checked(wire.routing.preferSharedChannels)} />`)}
          ${fieldRow('Constraints', `<div class="readout">${wire.routing.constraints.length}</div>`)}
          <div class="button-row"><button class="primary-button" data-action="wire-route">Rebuild route</button><button class="secondary-button" data-action="wire-clear-constraints">Clear constraints</button></div>
        </div></section>
        ${wire.route?.diagnostics?.length ? `<section class="panel-section"><div class="panel-section-header">Router diagnostics</div><div class="panel-section-body diagnostic-list">${wire.route.diagnostics.map((message) => `<div>${escapeHtml(message)}</div>`).join('')}</div></section>` : ''}`;
        }
    }
    renderLabelInspector(root, label) {
        if (!label) {
            root.innerHTML = '<div class="inspector-empty">Label no longer exists.</div>';
            return;
        }
        if (this.activeRightTab === 'properties') {
            root.innerHTML = `
        ${this.inspectorHeader('T', label.text, `${label.mode} · ${label.anchor.ownerKind}`)}
        <section class="panel-section"><div class="panel-section-header">Content and placement</div><div class="panel-section-body form-grid">
          ${fieldRow('Text', `<textarea id="label-text" class="form-textarea">${escapeHtml(label.text)}</textarea>`, { stacked: true })}
          ${fieldRow('Secondary', textControl('label-secondary', label.secondaryText || ''))}
          ${fieldRow('Mode', selectControl('label-mode', label.mode, ['auto', 'owner-relative', 'world-pinned']))}
          ${fieldRow('Orientation', selectControl('label-orientation', label.orientation, ['horizontal', 'follow-segment', 'vertical']))}
          ${fieldRow('Locked', `<input id="label-locked" class="form-control" type="checkbox"${checked(label.locked)} />`)}
          ${fieldRow('Visible', `<input id="label-visible" class="form-control" type="checkbox"${checked(label.visible)} />`)}
          <div class="button-row"><button class="secondary-button" data-action="label-reset">Auto-place</button><button class="danger-button" data-action="label-delete">Delete</button></div>
        </div></section>`;
        }
        else if (this.activeRightTab === 'style') {
            const editorTheme = this.theme === 'dark' ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME;
            const labelBackground = label.style.background ?? editorTheme.labelBackground;
            const labelFill = label.style.fill ?? contrastingText(labelBackground, '#111827', '#f8fafc');
            root.innerHTML = `
        ${this.inspectorHeader('T', label.text, 'Label typography')}
        <section class="panel-section"><div class="panel-section-header">Text style</div><div class="panel-section-body form-grid">
          ${fieldRow('Font size', textControl('label-font-size', label.style.fontSize ?? 11, { type: 'number', min: 5, step: 0.5 }))}
          ${fieldRow('Font weight', textControl('label-font-weight', label.style.fontWeight ?? 500, { type: 'number', min: 100, max: 900, step: 100 }))}
          ${fieldRow('Text color', textControl('label-fill', labelFill, { type: 'color' }))}
          ${fieldRow('Background', textControl('label-background', labelBackground, { type: 'color' }))}
          ${fieldRow('Border color', textControl('label-border-color', label.style.borderColor ?? editorTheme.labelBorder, { type: 'color' }))}
          ${fieldRow('Border width', textControl('label-border-width', label.style.borderWidth ?? 0, { type: 'number', min: 0, step: 0.5 }))}
          ${fieldRow('Padding X', textControl('label-padding-x', label.style.paddingX ?? 4, { type: 'number', min: 0, step: 1 }))}
          ${fieldRow('Padding Y', textControl('label-padding-y', label.style.paddingY ?? 2, { type: 'number', min: 0, step: 1 }))}
          <div class="button-row"><button type="button" class="secondary-button" data-action="label-auto-contrast">Use automatic contrast</button></div>
        </div></section>`;
        }
        else {
            root.innerHTML = `
        ${this.inspectorHeader('T', label.text, 'Collision and ownership rules')}
        <section class="panel-section"><div class="panel-section-header">Placement solver</div><div class="panel-section-body form-grid">
          ${fieldRow('Priority', textControl('label-priority', label.priority, { type: 'number', min: -100, max: 100, step: 1 }))}
          ${fieldRow('Avoid wires', `<input id="label-avoid-wires" class="form-control" type="checkbox"${checked(label.avoidWires)} />`)}
          ${fieldRow('Avoid components', `<input id="label-avoid-components" class="form-control" type="checkbox"${checked(label.avoidComponents)} />`)}
          ${fieldRow('Allow leader', `<input id="label-allow-leader" class="form-control" type="checkbox"${checked(label.allowLeader)} />`)}
          <div class="inline-fields">${fieldRow('Offset X', textControl('label-offset-x', label.offset.x, { type: 'number', step: 1 }))}${fieldRow('Offset Y', textControl('label-offset-y', label.offset.y, { type: 'number', step: 1 }))}</div>
          <div class="button-row"><button class="primary-button" data-action="label-reset">Run placement solver</button></div>
        </div></section>`;
        }
    }
    inspectorHeader(icon, name, meta) {
        return `<div class="inspector-title"><div class="inspector-title-row"><span class="inspector-entity-icon">${escapeHtml(icon)}</span><div class="inspector-name"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(meta)}</span></div></div></div>`;
    }
    async renderBottomPanel() {
        const root = byId('bottom-content');
        if (this.activeBottomTab === 'problems') {
            const issues = [...this.host.engine.validationIssues];
            root.innerHTML = issues.length ? `
        <table class="data-table"><thead><tr><th>Severity</th><th>Code</th><th>Message</th><th>Entities</th></tr></thead><tbody>${issues.map((issue) => `
          <tr class="problem-row" data-issue-id="${escapeAttribute(issue.id)}"><td class="severity-${escapeAttribute(issue.severity)}">${escapeHtml(issue.severity.toUpperCase())}</td><td class="mono">${escapeHtml(issue.code)}</td><td>${escapeHtml(issue.message)}</td><td class="mono">${escapeHtml(issue.entityIds.join(', '))}</td></tr>`).join('')}</tbody></table>`
                : '<div class="panel-empty success-panel">No validation issues. The current visual model is internally consistent.</div>';
            return;
        }
        if (this.activeBottomTab === 'nets') {
            const document = this.host.engine.document;
            const rows = document.wireOrder.map((id) => {
                const wire = document.wires[id];
                return `<tr data-net-wire="${escapeAttribute(id)}"><td><span class="wire-dot" style="background:${escapeAttribute(primaryPatternColor(wire.style.pattern))}"></span>${escapeHtml(wire.signal || wire.label || id)}</td><td>${escapeHtml(endpointLabel(wire, 'source', document))}</td><td>${escapeHtml(endpointLabel(wire, 'target', document))}</td><td>${formatNumber(wire.route?.length || 0)}</td><td>${escapeHtml(wire.route?.status || 'unrouted')}</td></tr>`;
            }).join('');
            root.innerHTML = `<table class="data-table"><thead><tr><th>Signal / net</th><th>Source</th><th>Target</th><th>Length</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="panel-empty">No connectivity exists yet.</td></tr>'}</tbody></table>`;
            return;
        }
        if (this.activeBottomTab === 'history') {
            try {
                const modelId = this.workspace.workspace.activeModelId || '';
                this.commandLog = await this.api.get(`/api/project/commands?limit=500&modelId=${encodeURIComponent(modelId)}`);
            }
            catch (error) {
                this.log('error', `Could not load command history: ${errorMessage(error)}`);
            }
            const rows = this.commandLog.map((entry) => {
                const stateLabel = entry.current ? 'Current' : entry.restorable ? 'Restorable' : 'Snapshot pruned';
                const stateClass = entry.current ? 'current' : entry.restorable ? 'available' : 'unavailable';
                const checkout = entry.current
                    ? '<span class="history-current-marker">Active</span>'
                    : entry.restorable
                        ? `<button type="button" class="history-checkout" data-checkout-command="${entry.sequence}" title="Restore the document state immediately after command #${entry.sequence}">↺ Checkout</button>`
                        : '<span class="history-unavailable" title="The rolling recovery snapshot for this older command is no longer retained.">Unavailable</span>';
                return `<tr class="history-row${entry.current ? ' current' : ''}" data-command-sequence="${entry.sequence}"><td class="mono">${entry.sequence}</td><td><span class="history-state ${stateClass}">${stateLabel}</span></td><td>${escapeHtml(entry.type)}</td><td>${escapeHtml(String(entry.payload.reason || ''))}</td><td>${escapeHtml(formatDate(entry.committedAt))}</td><td class="mono">${escapeHtml((entry.documentContentHash || entry.contentHash).slice(0, 12))}</td><td>${checkout}</td></tr>`;
            }).join('');
            root.innerHTML = `
        <div class="history-toolbar"><span><strong>Persisted command states</strong> · checkout saves the current document first and appends a new history entry.</span><span>${this.commandLog.filter((entry) => entry.restorable).length} snapshots retained</span></div>
        <table class="data-table history-table"><thead><tr><th>Seq.</th><th>State</th><th>Command</th><th>Reason</th><th>Committed</th><th>Document hash</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="panel-empty">No persisted commands yet.</td></tr>'}</tbody></table>`;
            return;
        }
        root.innerHTML = `<div class="output-log">${this.outputLines.map((line) => `<div class="output-line ${escapeAttribute(line.kind)}"><span>${escapeHtml(line.time)}</span><strong>${escapeHtml(line.kind.toUpperCase())}</strong><div>${escapeHtml(line.message)}</div></div>`).join('') || '<div class="panel-empty">Application output is empty.</div>'}</div>`;
        root.scrollTop = root.scrollHeight;
    }
    handleLeftPanelClick(event) {
        const target = event.target;
        const modelRow = target.closest('[data-tree-model]');
        if (modelRow) {
            void this.switchModel(modelRow.dataset.treeModel);
            return;
        }
        const entityRow = target.closest('[data-tree-kind]');
        if (entityRow) {
            this.host.select([{ kind: entityRow.dataset.treeKind, id: entityRow.dataset.treeId }]);
            return;
        }
        const componentCard = target.closest('[data-library-component]');
        if (componentCard) {
            this.pendingPlacementId = componentCard.dataset.libraryComponent;
            this.setTool('component');
            this.renderLibraryResults();
            const item = this.components.find((value) => value.id === this.pendingPlacementId);
            this.setStatus(`Click the canvas to place ${item?.name || 'the component'}.`);
            return;
        }
        const cableCard = target.closest('[data-library-cable]');
        if (cableCard) {
            const cable = this.cables.find((value) => value.id === cableCard.dataset.libraryCable);
            if (cable)
                void this.cableDetailsDialog(cable);
            return;
        }
        if (target.closest('[data-bom-add]')) {
            void this.bomDialog();
            return;
        }
        if (target.closest('[data-bom-export]')) {
            this.downloadExport('bom-csv');
            return;
        }
        const bomRow = target.closest('[data-bom-id]');
        if (bomRow) {
            const item = this.workspace.bom.find((value) => value.id === bomRow.dataset.bomId);
            if (item)
                void this.bomDialog(item);
        }
    }
    handleInspectorChange(event) {
        const input = event.target;
        const primary = this.host.engine.selection.primary;
        try {
            if (!primary) {
                this.handleDocumentInspectorChange(input);
                return;
            }
            if (primary.kind === 'component')
                this.handleComponentInspectorChange(primary.id, input);
            else if (primary.kind === 'wire')
                this.handleWireInspectorChange(primary.id, input);
            else if (primary.kind === 'label')
                this.handleLabelInspectorChange(primary.id, input);
            else if (primary.kind === 'port' && typeof primary.subId === 'string')
                this.handlePortInspectorChange(primary.id, primary.subId, input);
        }
        catch (error) {
            this.setStatus(errorMessage(error), 'error');
            toast('Edit was rejected', errorMessage(error), 'error');
            this.renderInspector();
        }
    }
    handleDocumentInspectorChange(input) {
        if (input.id === 'project-name-inline' || input.id === 'project-org-inline') {
            void this.updateProjectMeta({
                name: query('#project-name-inline', byId('right-content')).value,
                organization: query('#project-org-inline', byId('right-content')).value,
            });
            return;
        }
        if (input.id === 'document-theme') {
            this.theme = input.value === 'light' ? 'light' : 'dark';
            void this.persistTheme();
            return;
        }
        this.host.engine.execute('Edit document settings', (draft) => {
            if (input.id === 'document-grid-visible')
                draft.settings.grid.visible = input.checked;
            if (input.id === 'document-grid-spacing')
                draft.settings.grid.spacing = Math.max(1, Number(input.value));
            if (input.id === 'document-grid-major')
                draft.settings.grid.majorEvery = Math.max(1, Number(input.value));
            if (input.id === 'document-grid-opacity')
                draft.settings.grid.opacity = clamp(Number(input.value), 0, 1);
            if (input.id === 'document-route-pattern')
                draft.settings.defaultRouting.pattern = input.value;
            if (input.id === 'document-route-clearance')
                draft.settings.defaultRouting.clearance = Math.max(0, Number(input.value));
            if (input.id === 'document-route-leadin')
                draft.settings.defaultRouting.leadIn = Math.max(0, Number(input.value));
            if (input.id === 'document-route-radius')
                draft.settings.defaultRouting.requestedRadius = Math.max(0, Number(input.value));
            if (input.id === 'document-route-min-segment')
                draft.settings.defaultRouting.minimumSegment = Math.max(0, Number(input.value));
            if (input.id === 'document-route-crossings')
                draft.settings.defaultRouting.allowCrossings = input.checked;
        });
    }
    handleComponentInspectorChange(componentId, input) {
        if (input.dataset.bankCollapse) {
            this.host.engine.updateComponent(componentId, (component) => {
                const bank = component.pinBanks.find((value) => value.id === input.dataset.bankCollapse);
                if (bank)
                    bank.collapseEmpty = input.checked;
            }, { connectedPortRemoval: 'detach' });
            return;
        }
        this.host.engine.updateComponent(componentId, (component) => {
            switch (input.id) {
                case 'component-designator':
                    component.designator = input.value.trim() || component.designator;
                    break;
                case 'component-title':
                    component.labels.title = input.value;
                    break;
                case 'component-subtitle':
                    component.labels.subtitle = input.value;
                    break;
                case 'component-manufacturer':
                    component.labels.manufacturer = input.value;
                    break;
                case 'component-part-number':
                    component.labels.partNumber = input.value;
                    break;
                case 'component-description':
                    component.labels.description = input.value;
                    break;
                case 'component-x':
                    component.position.x = Number(input.value);
                    break;
                case 'component-y':
                    component.position.y = Number(input.value);
                    break;
                case 'component-rotation':
                    component.rotation = Number(input.value);
                    break;
                case 'component-locked':
                    component.locked = input.checked;
                    break;
                case 'component-hidden':
                    component.hidden = input.checked;
                    break;
                case 'component-body-fill':
                    component.style = { ...(component.style || {}), bodyFill: input.value };
                    break;
                case 'component-body-stroke':
                    component.style = { ...(component.style || {}), bodyStroke: input.value };
                    break;
                case 'component-body-stroke-width':
                    component.style = { ...(component.style || {}), bodyStrokeWidth: Math.max(0, Number(input.value)) };
                    break;
                case 'component-body-radius':
                    component.style = { ...(component.style || {}), bodyRadius: Math.max(0, Number(input.value)) };
                    break;
                case 'component-header-fill':
                    component.style = { ...(component.style || {}), headerFill: input.value };
                    break;
                case 'component-row-fill':
                    component.style = { ...(component.style || {}), rowFill: input.value };
                    break;
                case 'component-alt-row-fill':
                    component.style = { ...(component.style || {}), alternateRowFill: input.value };
                    break;
                case 'component-pin-fill':
                    component.style = { ...(component.style || {}), pinDotFill: input.value };
                    break;
                case 'component-width':
                    component.size = { width: Math.max(20, Number(input.value)), height: component.size?.height || component.layout.minimumSize.height };
                    component.layout.autoWidth = false;
                    break;
                case 'component-height':
                    component.size = { width: component.size?.width || component.layout.minimumSize.width, height: Math.max(20, Number(input.value)) };
                    component.layout.autoHeight = false;
                    break;
                case 'component-auto-width':
                    component.layout.autoWidth = input.checked;
                    break;
                case 'component-auto-height':
                    component.layout.autoHeight = input.checked;
                    break;
                case 'component-header-height':
                    component.layout.headerHeight = Math.max(0, Number(input.value));
                    break;
                case 'component-row-height':
                    component.layout.rowHeight = Math.max(8, Number(input.value));
                    break;
                case 'component-row-gap':
                    component.layout.rowGap = Math.max(0, Number(input.value));
                    break;
                case 'component-bank-gap':
                    component.layout.bankGap = Math.max(0, Number(input.value));
                    break;
                case 'component-port-leadin':
                    component.layout.portLeadIn = Math.max(0, Number(input.value));
                    break;
                case 'component-obstacle-padding':
                    component.layout.obstaclePadding = Math.max(0, Number(input.value));
                    break;
                case 'component-label-gap':
                    component.layout.labelGap = Math.max(0, Number(input.value));
                    break;
            }
        }, { connectedPortRemoval: 'detach' });
    }
    handlePortInspectorChange(componentId, portId, input) {
        this.host.engine.updateComponent(componentId, (component) => {
            const port = component.ports.find((value) => value.id === portId);
            if (!port)
                return;
            const oldSide = port.side;
            switch (input.id) {
                case 'port-label':
                    port.label = input.value;
                    break;
                case 'port-function':
                    port.function = input.value;
                    break;
                case 'port-detail':
                    port.detail = input.value;
                    break;
                case 'port-side':
                    port.side = input.value;
                    break;
                case 'port-electrical':
                    port.electricalClass = input.value;
                    break;
                case 'port-max-connections':
                    port.connectionPolicy.maximumConnections = Math.max(1, Number(input.value));
                    break;
                case 'port-visible':
                    port.visible = input.checked;
                    break;
                case 'port-side-fraction':
                    port.sideFraction = input.value === '' ? undefined : clamp(Number(input.value), 0, 1);
                    break;
                case 'port-tangent-offset':
                    port.tangentOffset = Number(input.value);
                    break;
                case 'port-normal-offset':
                    port.normalOffset = Number(input.value);
                    break;
            }
            if (port.side !== oldSide) {
                for (const bank of component.pinBanks)
                    bank.portIds = bank.portIds.filter((id) => id !== port.id);
                let bank = component.pinBanks.find((value) => value.side === port.side);
                if (!bank) {
                    bank = { id: `${component.id}:bank:${port.side}:${component.pinBanks.length + 1}`, side: port.side, portIds: [], flow: 'forward', rowGap: component.layout.rowGap, edgePadding: 12, collapseEmpty: false };
                    component.pinBanks.push(bank);
                }
                bank.portIds.push(port.id);
                port.bankId = bank.id;
                port.order = bank.portIds.length - 1;
            }
        }, { connectedPortRemoval: 'detach' });
    }
    handleWireInspectorChange(wireId, input) {
        this.host.engine.updateWire(wireId, (wire) => {
            switch (input.id) {
                case 'wire-label':
                    wire.label = input.value;
                    break;
                case 'wire-signal':
                    wire.signal = input.value;
                    break;
                case 'wire-kind':
                    wire.kind = input.value;
                    break;
                case 'wire-locked':
                    wire.locked = input.checked;
                    break;
                case 'wire-hidden':
                    wire.hidden = input.checked;
                    break;
                case 'wire-route-pattern':
                    wire.routing.pattern = input.value;
                    if (wire.routing.pattern !== 'manual')
                        wire.routing.constraints = [];
                    break;
                case 'wire-color-pattern':
                    wire.style.pattern = makePattern(input.value, primaryPatternColor(wire.style.pattern), secondaryPatternColor(wire.style.pattern));
                    break;
                case 'wire-primary-color':
                    wire.style.pattern = makePattern(wire.style.pattern.kind, input.value, secondaryPatternColor(wire.style.pattern));
                    break;
                case 'wire-secondary-color':
                    wire.style.pattern = makePattern(wire.style.pattern.kind, primaryPatternColor(wire.style.pattern), input.value);
                    break;
                case 'wire-width':
                    wire.style.width = Math.max(0.5, Number(input.value));
                    break;
                case 'wire-outline':
                    wire.style.outlineWidth = Math.max(0, Number(input.value));
                    break;
                case 'wire-opacity':
                    wire.style.opacity = clamp(Number(input.value), 0.05, 1);
                    break;
                case 'wire-line-cap':
                    wire.style.lineCap = input.value;
                    break;
                case 'wire-clearance':
                    wire.routing.clearance = Math.max(0, Number(input.value));
                    break;
                case 'wire-leadin':
                    wire.routing.leadIn = Math.max(0, Number(input.value));
                    break;
                case 'wire-radius':
                    wire.routing.requestedRadius = Math.max(0, Number(input.value));
                    break;
                case 'wire-min-segment':
                    wire.routing.minimumSegment = Math.max(0, Number(input.value));
                    break;
                case 'wire-routing-grid':
                    wire.routing.grid = Math.max(1, Number(input.value));
                    break;
                case 'wire-allow-crossings':
                    wire.routing.allowCrossings = input.checked;
                    break;
                case 'wire-shared-channels':
                    wire.routing.preferSharedChannels = input.checked;
                    break;
            }
        });
    }
    handleLabelInspectorChange(labelId, input) {
        this.host.engine.updateLabel(labelId, (label) => {
            switch (input.id) {
                case 'label-text':
                    label.text = input.value;
                    break;
                case 'label-secondary':
                    label.secondaryText = input.value;
                    break;
                case 'label-mode':
                    label.mode = input.value;
                    break;
                case 'label-orientation':
                    label.orientation = input.value;
                    break;
                case 'label-locked':
                    label.locked = input.checked;
                    break;
                case 'label-visible':
                    label.visible = input.checked;
                    break;
                case 'label-font-size':
                    label.style.fontSize = Math.max(5, Number(input.value));
                    break;
                case 'label-font-weight':
                    label.style.fontWeight = Number(input.value);
                    break;
                case 'label-fill':
                    label.style.fill = input.value;
                    break;
                case 'label-background':
                    label.style.background = input.value;
                    break;
                case 'label-border-color':
                    label.style.borderColor = input.value;
                    break;
                case 'label-border-width':
                    label.style.borderWidth = Math.max(0, Number(input.value));
                    break;
                case 'label-padding-x':
                    label.style.paddingX = Math.max(0, Number(input.value));
                    break;
                case 'label-padding-y':
                    label.style.paddingY = Math.max(0, Number(input.value));
                    break;
                case 'label-priority':
                    label.priority = Number(input.value);
                    break;
                case 'label-avoid-wires':
                    label.avoidWires = input.checked;
                    break;
                case 'label-avoid-components':
                    label.avoidComponents = input.checked;
                    break;
                case 'label-allow-leader':
                    label.allowLeader = input.checked;
                    break;
                case 'label-offset-x':
                    label.offset.x = Number(input.value);
                    break;
                case 'label-offset-y':
                    label.offset.y = Number(input.value);
                    break;
            }
        });
    }
    async handleInspectorClick(event) {
        const target = event.target;
        const action = target.closest('[data-action]')?.dataset.action;
        if (!action)
            return;
        const primary = this.host.engine.selection.primary;
        try {
            switch (action) {
                case 'project-properties':
                    await this.projectPropertiesDialog();
                    break;
                case 'integrity-check':
                    await this.integrityDialog();
                    break;
                case 'route-all':
                    this.host.engine.autoRoute();
                    break;
                case 'component-rotate':
                    this.host.rotateSelection();
                    break;
                case 'component-duplicate': {
                    if (primary?.kind !== 'component')
                        break;
                    const component = this.host.engine.document.components[primary.id];
                    if (component) {
                        const copy = duplicateComponent(component, this.host.engine.document);
                        this.host.engine.addComponent(copy);
                        this.host.select([{ kind: 'component', id: copy.id }]);
                    }
                    break;
                }
                case 'component-delete':
                    this.host.deleteSelection(true);
                    break;
                case 'component-add-pin': {
                    if (primary?.kind !== 'component')
                        break;
                    this.host.engine.updateComponent(primary.id, (component) => {
                        let bank = component.pinBanks.find((value) => value.side === 'east') || component.pinBanks[0];
                        if (!bank) {
                            bank = { id: `${component.id}:bank:east`, side: 'east', portIds: [], flow: 'forward', rowGap: 2, edgePadding: 12, collapseEmpty: false };
                            component.pinBanks.push(bank);
                        }
                        const portId = `${component.id}:port:${createId('pin')}`;
                        const port = {
                            id: portId,
                            label: String(component.ports.length + 1),
                            function: '',
                            side: bank.side,
                            order: bank.portIds.length,
                            bankId: bank.id,
                            visible: true,
                            electricalClass: 'unknown',
                            connectionPolicy: { maximumConnections: 1, allowSelfConnection: false },
                        };
                        component.ports.push(port);
                        bank.portIds.push(portId);
                    }, { connectedPortRemoval: 'detach' });
                    break;
                }
                case 'component-edit-definition': {
                    if (primary?.kind === 'component')
                        await this.editComponentPinsDialog(primary.id);
                    break;
                }
                case 'component-fit-content': {
                    if (primary?.kind !== 'component')
                        break;
                    this.host.engine.updateComponent(primary.id, (component) => {
                        component.size = undefined;
                        component.layout.autoWidth = true;
                        component.layout.autoHeight = true;
                    });
                    break;
                }
                case 'select-port': {
                    if (primary?.kind !== 'component')
                        break;
                    const portId = target.closest('[data-port-id]')?.dataset.portId;
                    if (portId)
                        this.host.select([{ kind: 'port', id: primary.id, subId: portId }]);
                    break;
                }
                case 'port-back': {
                    if (primary?.kind === 'port')
                        this.host.select([{ kind: 'component', id: primary.id }]);
                    break;
                }
                case 'port-delete': {
                    if (primary?.kind !== 'port' || typeof primary.subId !== 'string')
                        break;
                    const portId = primary.subId;
                    this.host.engine.updateComponent(primary.id, (component) => {
                        component.ports = component.ports.filter((port) => port.id !== portId);
                        for (const bank of component.pinBanks)
                            bank.portIds = bank.portIds.filter((id) => id !== portId);
                    }, { connectedPortRemoval: 'detach' });
                    this.host.select([{ kind: 'component', id: primary.id }]);
                    break;
                }
                case 'wire-route': {
                    if (primary?.kind === 'wire')
                        this.host.engine.autoRoute([primary.id]);
                    break;
                }
                case 'wire-label-add': {
                    if (primary?.kind !== 'wire')
                        break;
                    const wire = this.host.engine.document.wires[primary.id];
                    const label = {
                        id: createId('label'),
                        text: wire.label || wire.signal || 'WIRE',
                        anchor: { ownerKind: 'wire', ownerId: wire.id, wireFraction: 0.5 },
                        mode: 'auto',
                        orientation: 'follow-segment',
                        offset: { x: 0, y: -8 },
                        priority: 20,
                        avoidWires: false,
                        avoidComponents: true,
                        allowLeader: true,
                        visible: true,
                        locked: false,
                        style: { fontSize: 10, fontWeight: 600 },
                    };
                    this.host.engine.addLabel(label);
                    this.host.select([{ kind: 'label', id: label.id }]);
                    break;
                }
                case 'wire-delete':
                    this.host.deleteSelection(true);
                    break;
                case 'wire-clear-constraints': {
                    if (primary?.kind === 'wire')
                        this.host.engine.updateWire(primary.id, (wire) => {
                            wire.routing.constraints = [];
                            if (wire.routing.pattern === 'manual')
                                wire.routing.pattern = 'orthogonal';
                        });
                    break;
                }
                case 'label-reset': {
                    if (primary?.kind === 'label')
                        this.host.engine.resetLabel(primary.id);
                    break;
                }
                case 'label-auto-contrast': {
                    if (primary?.kind === 'label')
                        this.host.engine.updateLabel(primary.id, (label) => {
                            delete label.style.fill;
                        });
                    break;
                }
                case 'label-delete':
                    this.host.deleteSelection(true);
                    break;
            }
        }
        catch (error) {
            this.setStatus(errorMessage(error), 'error');
            toast('Command failed', errorMessage(error), 'error');
        }
    }
    async handleBottomClick(event) {
        const target = event.target;
        const checkoutButton = target.closest('[data-checkout-command]');
        if (checkoutButton) {
            const sequence = Number(checkoutButton.dataset.checkoutCommand);
            const entry = this.commandLog.find((candidate) => candidate.sequence === sequence);
            if (!entry?.restorable || entry.current) {
                toast(entry?.current ? 'Already active' : 'Snapshot unavailable', entry?.current ? `Command #${sequence} is already the active document state.` : `Command #${sequence} is outside the retained recovery window.`, 'warning');
                return;
            }
            const confirmed = await this.modal.open({
                title: `Checkout state after command #${sequence}?`,
                subtitle: String(entry.payload.reason || entry.type),
                body: `<div class="callout warning"><strong>This is a non-destructive checkout.</strong> Current edits are saved first. The selected historical document becomes the active state and is stored as a new command, while later history remains available.</div><div class="history-checkout-summary"><span>Document hash</span><code>${escapeHtml((entry.documentContentHash || entry.contentHash).slice(0, 16))}</code></div>`,
                confirmLabel: 'Checkout state',
                onConfirm: () => true,
            });
            if (!confirmed)
                return;
            try {
                checkoutButton.disabled = true;
                await this.saveNow(true);
                const response = await this.api.post(`/api/project/commands/${sequence}/restore`);
                this.activeBottomTab = 'history';
                await this.adoptWorkspace(response.workspace, `Checked out command #${sequence}.`);
                this.setBottomOpen(true);
            }
            catch (error) {
                checkoutButton.disabled = false;
                toast('Checkout failed', errorMessage(error), 'error');
                this.setStatus(`Checkout failed: ${errorMessage(error)}`, 'error');
            }
            return;
        }
        const issueRow = target.closest('[data-issue-id]');
        if (issueRow) {
            const issue = this.host.engine.validationIssues.find((value) => value.id === issueRow.dataset.issueId);
            if (issue) {
                const refs = issue.entityIds.map((id) => entityRefForId(this.host.engine.document, id)).filter((value) => Boolean(value));
                if (refs.length) {
                    this.host.select(refs);
                    this.host.centerOnSelection();
                }
            }
            return;
        }
        const wireRow = target.closest('[data-net-wire]');
        if (wireRow) {
            this.host.select([{ kind: 'wire', id: wireRow.dataset.netWire }]);
            this.host.centerOnSelection();
        }
    }
    async switchModel(modelId) {
        if (modelId === this.workspace.workspace.activeModelId)
            return;
        const preferred = pageForView(this.workspace, modelId, this.workspace.workspace.activeViewKind);
        if (!preferred)
            return;
        await this.switchView(modelId, preferred.id, preferred.viewKind);
    }
    async switchView(modelId, pageId, viewKind) {
        if (modelId === this.workspace.workspace.activeModelId && pageId === this.workspace.workspace.activePageId && viewKind === this.workspace.workspace.activeViewKind)
            return;
        await this.saveNow(true);
        this.setStatus('Switching editor projection…');
        const result = await this.api.post('/api/project/select-view', {
            modelId,
            pageId,
            viewKind,
            viewportState: {},
        });
        this.workspace.workspace = result.workspace;
        this.workspace.editor = result.editor;
        const [bom, revisions] = await Promise.all([
            this.api.get(`/api/project/bom?modelId=${encodeURIComponent(modelId)}`),
            this.api.get(`/api/project/revisions?modelId=${encodeURIComponent(modelId)}`),
        ]);
        this.workspace.bom = bom;
        this.workspace.revisions = revisions;
        this.saveRevision = 0;
        this.savedRevision = 0;
        this.host.load(result.editor.document, result.workspace.viewportState);
        this.host.setTheme(this.theme === 'dark');
        this.renderAll();
        document.title = `${this.workspace.meta.name} — ${APPLICATION_NAME}`;
        this.log('info', `Opened ${viewKind} view for ${modelId}.`);
        this.setStatus(`Opened ${viewKind} view.`, 'success');
    }
    setTool(tool) {
        if (tool === 'component' && !this.pendingPlacementId) {
            this.activateLibraryPlacement();
            return;
        }
        this.host.setTool(tool);
        document.querySelectorAll('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === tool));
    }
    activateLibraryPlacement() {
        this.activeLeftTab = 'library';
        this.updateTabButtons('[data-left-tab]', 'library', 'leftTab');
        if (!this.pendingPlacementId)
            this.pendingPlacementId = this.components[0]?.id || null;
        this.renderLeftPanel();
        if (!this.pendingPlacementId) {
            toast('Library is empty', 'Create a component definition first.', 'warning');
            void this.componentCreatorDialog();
            return;
        }
        this.setTool('component');
    }
    placePendingComponent(point) {
        const definition = this.components.find((item) => item.id === this.pendingPlacementId);
        if (!definition) {
            this.setStatus('Choose a component from the local library.', 'warning');
            this.activateLibraryPlacement();
            return;
        }
        const component = instantiateLibraryComponent(definition, point, this.host.engine.document);
        this.host.engine.addComponent(component);
        this.host.select([{ kind: 'component', id: component.id }]);
        this.setStatus(`${component.designator} placed. Click again to place another or press V to return to Select.`, 'success');
    }
    placeLabel(point) {
        const label = createFreeLabel(point);
        this.host.engine.addLabel(label);
        this.host.select([{ kind: 'label', id: label.id }]);
        this.setTool('select');
    }
    updateCommandStates() {
        const primary = this.host?.engine.selection.primary;
        byId('undo').disabled = !this.host?.engine.canUndo;
        byId('redo').disabled = !this.host?.engine.canRedo;
        byId('rotate-selection').disabled = !this.host?.engine.selection.items.some((item) => item.kind === 'component');
        byId('tool-delete').disabled = !primary;
        byId('auto-route').disabled = Boolean(primary) && !this.host?.engine.selection.items.some((item) => item.kind === 'wire');
    }
    updateDocumentStatus() {
        const revision = this.host?.engine.document.revision ?? this.workspace.editor.document.revision;
        byId('document-status').textContent = `Revision ${revision}`;
        if (this.host)
            byId('zoom-readout').textContent = `${this.host.zoomPercent}%`;
    }
    setBottomOpen(open) {
        this.bottomOpen = open;
        query('.editor-column').classList.toggle('bottom-closed', !open);
        byId('toggle-bottom').classList.toggle('active', open);
        if (open)
            void this.renderBottomPanel();
    }
    setStatus(message, kind = 'info') {
        const element = byId('status-message');
        element.textContent = message;
        element.dataset.kind = kind;
        if (kind === 'error')
            this.log('error', message);
    }
    log(kind, message) {
        this.outputLines.push({ time: new Date().toLocaleTimeString(), kind, message });
        if (this.outputLines.length > 500)
            this.outputLines.splice(0, this.outputLines.length - 500);
        if (this.activeBottomTab === 'output' && this.bottomOpen)
            void this.renderBottomPanel();
    }
    setSaveIndicator(state) {
        const indicator = byId('save-indicator');
        indicator.dataset.state = state === 'dirty' ? 'saving' : state;
        const label = query('.save-label', indicator);
        label.textContent = state === 'saved' ? 'Saved locally' : state === 'saving' ? 'Saving locally…' : state === 'dirty' ? 'Unsaved local changes' : 'Save failed';
    }
    saveNow(force = false) {
        const run = async () => {
            if (!this.host)
                return;
            if (!force && this.saveRevision === this.savedRevision)
                return;
            this.setSaveIndicator('saving');
            const targetRevision = this.saveRevision;
            try {
                const selection = this.host.engine.selection.items;
                const result = await this.api.put('/api/project/document', {
                    modelId: this.workspace.workspace.activeModelId,
                    pageId: this.workspace.workspace.activePageId,
                    viewKind: this.workspace.workspace.activeViewKind,
                    document: this.host.engine.document,
                    viewportState: this.currentViewport,
                    selectedEntities: selection,
                    panelState: {
                        leftTab: this.activeLeftTab,
                        rightTab: this.activeRightTab,
                        bottomTab: this.activeBottomTab,
                        bottomOpen: this.bottomOpen,
                    },
                    reason: this.lastSaveReason,
                });
                this.workspace.editor.contentHash = result.contentHash;
                this.workspace.editor.updatedAt = result.savedAt;
                this.savedRevision = Math.max(this.savedRevision, targetRevision);
                this.setSaveIndicator(this.savedRevision === this.saveRevision ? 'saved' : 'dirty');
                if (result.changed)
                    this.log('info', `Saved document revision ${result.revision} to SQLite.`);
            }
            catch (error) {
                this.setSaveIndicator('error');
                toast('Local save failed', errorMessage(error), 'error', 7000);
                this.log('error', `Save failed: ${errorMessage(error)}`);
                throw error;
            }
        };
        // Serialize saves so destructive or state-switching operations that await
        // saveNow(true) cannot overtake an autosave already in flight.
        const scheduled = this.saveChain.then(run, run);
        this.saveChain = scheduled.catch(() => undefined);
        return scheduled;
    }
    async checkpoint() {
        await this.saveNow(true);
        const result = await this.api.post('/api/project/checkpoint');
        if (result.integrity.ok) {
            toast('Checkpoint completed', 'SQLite WAL was flushed and database integrity is valid.', 'success');
            this.log('success', 'Project checkpoint and SQLite integrity check completed.');
            this.setStatus('Checkpoint completed.', 'success');
        }
        else {
            toast('Checkpoint warning', 'The database integrity check reported a problem.', 'warning');
        }
    }
    async newProjectDialog() {
        const defaultPath = this.workspace.path.replace(/[^/\\]+$/u, `New Harness${PROJECT_EXTENSION}`);
        const body = `
      <div class="form-grid">
        ${fieldRow('Project name', textControl('new-project-name', 'New Harness Project'))}
        ${fieldRow('File path', textControl('new-project-path', defaultPath, { className: 'form-control path-field' }), { stacked: true })}
        ${fieldRow('Organization', textControl('new-project-organization', this.workspace.meta.organization || ''))}
        ${fieldRow('Template', selectControl('new-project-template', 'starter', [
            { value: 'blank', label: 'Blank project' },
            { value: 'starter', label: 'Two connectors starter' },
            { value: 'sample', label: 'Demonstration harness' },
        ]))}
        ${fieldRow('Description', '<textarea id="new-project-description" class="form-textarea" placeholder="Project purpose and scope"></textarea>', { stacked: true })}
        <div class="callout">The project is a single local SQLite <strong>${PROJECT_EXTENSION}</strong> file. No account or cloud connection is created.</div>
      </div>`;
        const result = await this.modal.open({
            title: 'Create offline project',
            subtitle: 'Local SQLite project file',
            body,
            confirmLabel: 'Create project',
            onConfirm: async ({ body: root }) => {
                const name = query('#new-project-name', root).value.trim();
                const path = query('#new-project-path', root).value.trim();
                if (!name)
                    throw new Error('Project name is required.');
                if (!path)
                    throw new Error('A local file path is required.');
                await this.saveNow(true);
                return this.api.post('/api/projects/new', {
                    name,
                    path,
                    organization: query('#new-project-organization', root).value.trim(),
                    description: query('#new-project-description', root).value.trim(),
                    template: query('#new-project-template', root).value,
                });
            },
        });
        if (result)
            await this.adoptWorkspace(result, 'Created new project.');
    }
    async openProjectDialog() {
        const recentRows = this.bootstrap.recentProjects.map((project) => `
      <button class="recent-project-row${project.missing ? ' missing' : ''}" data-recent-path="${escapeAttribute(project.path)}"${project.missing ? ' disabled' : ''}>
        <span class="recent-project-icon">${project.pinned ? '★' : '◇'}</span><span><strong>${escapeHtml(project.name)}</strong><small>${escapeHtml(project.path)}</small></span><time>${escapeHtml(formatDate(project.last_opened_at))}</time>
      </button>`).join('');
        const body = `
      <div class="form-grid">
        ${fieldRow('Project file', textControl('open-project-path', '', { placeholder: `/path/to/project${PROJECT_EXTENSION}`, className: 'form-control path-field' }), { stacked: true })}
        <div class="recent-project-list">${recentRows || '<div class="panel-empty">No recent projects.</div>'}</div>
        <div class="callout warning">The server can only open files accessible to the local operating-system account running RouteCore.</div>
      </div>`;
        const result = await this.modal.open({
            title: 'Open local project',
            subtitle: 'Select a recent project or enter an absolute path',
            body,
            confirmLabel: 'Open project',
            onMount: ({ body: root }) => {
                root.querySelectorAll('[data-recent-path]').forEach((button) => button.addEventListener('click', () => {
                    query('#open-project-path', root).value = button.dataset.recentPath || '';
                    root.querySelectorAll('.recent-project-row').forEach((row) => row.classList.remove('selected'));
                    button.classList.add('selected');
                }));
            },
            onConfirm: async ({ body: root }) => {
                const path = query('#open-project-path', root).value.trim();
                if (!path)
                    throw new Error('Choose or enter a project file path.');
                await this.saveNow(true);
                return this.api.post('/api/projects/open', { path });
            },
        });
        if (result)
            await this.adoptWorkspace(result, 'Project opened.');
    }
    async adoptWorkspace(workspace, message) {
        this.workspace = workspace;
        const refresh = await this.api.get('/api/bootstrap');
        this.bootstrap = refresh;
        this.components = refresh.library.components;
        this.cables = refresh.library.cables;
        this.workspace = refresh.workspace;
        this.saveRevision = 0;
        this.savedRevision = 0;
        this.pendingPlacementId = null;
        this.commandLog = [];
        this.host.load(this.workspace.editor.document, this.workspace.workspace.viewportState);
        this.host.setTheme(this.theme === 'dark');
        this.renderAll();
        document.title = `${this.workspace.meta.name} — ${APPLICATION_NAME}`;
        this.setSaveIndicator('saved');
        this.setStatus(message, 'success');
        this.log('success', `${message} ${this.workspace.path}`);
        toast(message, this.workspace.meta.name, 'success');
    }
    async projectPropertiesDialog() {
        const meta = this.workspace.meta;
        const body = `
      <div class="form-grid">
        ${fieldRow('Name', textControl('project-prop-name', String(meta.name || '')))}
        ${fieldRow('Organization', textControl('project-prop-org', String(meta.organization || '')))}
        ${fieldRow('Status', selectControl('project-prop-status', String(meta.status || 'active'), ['active', 'on-hold', 'released', 'archived']))}
        ${fieldRow('Length unit', selectControl('project-prop-length-unit', String(meta.defaultLengthUnit || 'mm'), ['mm', 'cm', 'm', 'in']))}
        ${fieldRow('Wire unit', selectControl('project-prop-wire-unit', String(meta.defaultWireUnit || 'mm'), ['mm', 'm', 'in', 'ft']))}
        ${fieldRow('Description', `<textarea id="project-prop-description" class="form-textarea">${escapeHtml(String(meta.description || ''))}</textarea>`, { stacked: true })}
        ${fieldRow('Project UUID', `<div class="readout path-field">${escapeHtml(String(meta.project_uuid || ''))}</div>`, { stacked: true })}
        ${fieldRow('File', `<div class="readout path-field">${escapeHtml(this.workspace.path)}</div>`, { stacked: true })}
      </div>`;
        const updated = await this.modal.open({
            title: 'Project properties',
            subtitle: 'Stored in the local project database',
            body,
            confirmLabel: 'Save properties',
            onConfirm: async ({ body: root }) => this.api.patch('/api/project/meta', {
                name: query('#project-prop-name', root).value.trim(),
                organization: query('#project-prop-org', root).value.trim(),
                status: query('#project-prop-status', root).value,
                defaultLengthUnit: query('#project-prop-length-unit', root).value,
                defaultWireUnit: query('#project-prop-wire-unit', root).value,
                description: query('#project-prop-description', root).value.trim(),
            }),
        });
        if (updated) {
            this.workspace.meta = updated;
            this.renderAll();
            document.title = `${String(updated.name)} — ${APPLICATION_NAME}`;
            toast('Project properties saved', '', 'success');
        }
    }
    async updateProjectMeta(values) {
        try {
            const updated = await this.api.patch('/api/project/meta', values);
            this.workspace.meta = updated;
            this.renderModelTabs();
            this.renderBreadcrumb();
            document.title = `${String(updated.name)} — ${APPLICATION_NAME}`;
            this.setStatus('Project metadata saved.', 'success');
        }
        catch (error) {
            toast('Metadata save failed', errorMessage(error), 'error');
        }
    }
    componentPinRow(index, data = {}) {
        return `<tr data-pin-row>
      <td><input class="pin-label" value="${escapeAttribute(data.label ?? String(index + 1))}" /></td>
      <td><input class="pin-function" value="${escapeAttribute(data.function ?? '')}" /></td>
      <td><select class="pin-side">${SIDES.map((side) => `<option${selected(data.side ?? (index % 2 ? 'east' : 'west'), side)}>${side}</option>`).join('')}</select></td>
      <td><select class="pin-electrical">${ELECTRICAL_CLASSES.map((value) => `<option${selected(data.electricalClass ?? 'unknown', value)}>${value}</option>`).join('')}</select></td>
      <td><input class="pin-max" type="number" min="1" value="${escapeAttribute(data.maximumConnections ?? 1)}" /></td>
      <td><button type="button" class="row-delete" data-pin-delete title="Remove pin">×</button></td>
    </tr>`;
    }
    collectCustomComponentInput(root) {
        const ports = [...root.querySelectorAll('[data-pin-row]')].map((row) => ({
            label: query('.pin-label', row).value.trim(),
            function: query('.pin-function', row).value.trim(),
            side: query('.pin-side', row).value,
            electricalClass: query('.pin-electrical', row).value,
            maximumConnections: Math.max(1, Number(query('.pin-max', row).value) || 1),
        }));
        return {
            name: query('#creator-name', root).value.trim(),
            designatorPrefix: query('#creator-prefix', root).value.trim().toUpperCase() || 'X',
            kind: query('#creator-kind', root).value,
            subtitle: query('#creator-subtitle', root).value.trim(),
            manufacturer: query('#creator-manufacturer', root).value.trim(),
            partNumber: query('#creator-part-number', root).value.trim(),
            category: query('#creator-category', root).value.trim() || 'custom',
            tags: query('#creator-tags', root).value.split(',').map((value) => value.trim()).filter(Boolean),
            ports,
        };
    }
    renderCreatorPreview(root) {
        const preview = queryOptional('#component-preview', root);
        if (!preview)
            return;
        try {
            const definition = buildCustomLibraryComponent(this.collectCustomComponentInput(root));
            const document = createEmptyDocument('component-preview');
            const component = structuredClone(definition.component);
            component.position = { x: 40, y: 40 };
            document.components[component.id] = component;
            document.componentOrder.push(component.id);
            document.settings.grid.visible = true;
            const engine = new HarnessEditorEngine(document);
            preview.innerHTML = renderEditorSvg(engine.document, {
                geometries: engine.geometries,
                labelPlacements: [...engine.labelPlacements],
                theme: this.theme === 'dark' ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME,
                options: { showGrid: true, showPorts: true, showLabels: true, showRouteHandles: false, showDiagnostics: false, includeAccessibility: false },
            });
        }
        catch (error) {
            preview.innerHTML = `<div class="panel-empty">${escapeHtml(errorMessage(error))}</div>`;
        }
    }
    async componentCreatorDialog() {
        const body = `
      <div class="modal-grid">
        <section class="modal-panel">
          <div class="modal-panel-title">Reusable component definition</div>
          <div class="modal-panel-body form-grid">
            ${fieldRow('Name', textControl('creator-name', 'Custom Connector'))}
            <div class="inline-fields">${fieldRow('Prefix', textControl('creator-prefix', 'J'))}${fieldRow('Kind', selectControl('creator-kind', 'connector', COMPONENT_KINDS))}</div>
            ${fieldRow('Subtitle', textControl('creator-subtitle', 'CUSTOM'))}
            ${fieldRow('Manufacturer', textControl('creator-manufacturer', ''))}
            ${fieldRow('Part number', textControl('creator-part-number', ''))}
            ${fieldRow('Category', textControl('creator-category', 'connector'))}
            ${fieldRow('Tags', textControl('creator-tags', 'custom, connector'), { stacked: true })}
          </div>
          <div class="modal-panel-title">Dynamic pin matrix <button type="button" class="mini-action" id="creator-add-pin">＋ Add pin</button></div>
          <div class="modal-panel-body table-scroll">
            <table class="data-table pin-editor-table"><thead><tr><th>Label</th><th>Function</th><th>Side</th><th>Electrical</th><th>Max</th><th></th></tr></thead><tbody id="creator-pin-body">
              ${[0, 1, 2, 3].map((index) => this.componentPinRow(index, { side: index < 2 ? 'west' : 'east' })).join('')}
            </tbody></table>
          </div>
        </section>
        <section class="modal-panel"><div class="modal-panel-title">Live geometry preview</div><div id="component-preview" class="preview-canvas"></div><div class="modal-panel-body"><div class="callout">The component body grows from its title, pin labels, functions, banks, row heights, and padding. Port identities remain stable after instantiation.</div></div></section>
      </div>`;
        const saved = await this.modal.open({
            title: 'Component Creator',
            subtitle: 'Build a reusable offline library definition',
            body,
            size: 'large',
            confirmLabel: 'Save to local library',
            onMount: ({ body: root }) => {
                const refresh = debounce(() => this.renderCreatorPreview(root), 80);
                root.addEventListener('input', refresh);
                root.addEventListener('change', refresh);
                query('#creator-add-pin', root).addEventListener('click', () => {
                    const tbody = query('#creator-pin-body', root);
                    tbody.insertAdjacentHTML('beforeend', this.componentPinRow(tbody.rows.length));
                    this.renderCreatorPreview(root);
                });
                root.addEventListener('click', (event) => {
                    const button = event.target.closest('[data-pin-delete]');
                    if (button) {
                        button.closest('tr')?.remove();
                        this.renderCreatorPreview(root);
                    }
                });
                this.renderCreatorPreview(root);
            },
            onConfirm: async ({ body: root }) => {
                const input = this.collectCustomComponentInput(root);
                if (!input.name)
                    throw new Error('Component name is required.');
                if (!input.ports.length)
                    throw new Error('At least one pin is required.');
                if (input.ports.some((port) => !port.label))
                    throw new Error('Every pin requires a label.');
                const labels = new Set();
                for (const port of input.ports) {
                    if (labels.has(port.label))
                        throw new Error(`Pin label ${port.label} is duplicated.`);
                    labels.add(port.label);
                }
                const definition = buildCustomLibraryComponent(input);
                return this.api.put('/api/library/components', definition);
            },
        });
        if (saved) {
            this.components = [...this.components.filter((value) => value.id !== saved.id), saved].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
            this.pendingPlacementId = saved.id;
            this.activeLeftTab = 'library';
            this.updateTabButtons('[data-left-tab]', 'library', 'leftTab');
            this.renderLeftPanel();
            this.setTool('component');
            toast('Component saved', 'It is available in the local library and ready to place.', 'success');
        }
    }
    async editComponentPinsDialog(componentId) {
        const source = this.host.engine.document.components[componentId];
        if (!source)
            return;
        const body = `
      <div class="callout">Connected pins that are removed will detach their wire endpoint at its last visual location. Existing pin IDs are preserved for unchanged rows.</div>
      <div class="panel-toolbar"><button type="button" class="secondary-button" id="edit-pins-add">Add pin</button><button type="button" class="secondary-button" id="edit-pins-sort">Normalize order</button></div>
      <div class="table-scroll tall"><table class="data-table pin-editor-table"><thead><tr><th>Label</th><th>Function</th><th>Detail</th><th>Side</th><th>Electrical</th><th>Max</th><th></th></tr></thead><tbody id="edit-pins-body">${source.ports.map((port) => `
        <tr data-edit-pin-row data-port-id="${escapeAttribute(port.id)}"><td><input class="pin-label" value="${escapeAttribute(port.label)}" /></td><td><input class="pin-function" value="${escapeAttribute(port.function || '')}" /></td><td><input class="pin-detail" value="${escapeAttribute(port.detail || '')}" /></td><td><select class="pin-side">${SIDES.map((side) => `<option${selected(port.side, side)}>${side}</option>`).join('')}</select></td><td><select class="pin-electrical">${ELECTRICAL_CLASSES.map((value) => `<option${selected(port.electricalClass, value)}>${value}</option>`).join('')}</select></td><td><input class="pin-max" type="number" min="1" value="${port.connectionPolicy.maximumConnections}" /></td><td><button type="button" class="row-delete" data-edit-pin-delete>×</button></td></tr>`).join('')}</tbody></table></div>`;
        const changed = await this.modal.open({
            title: `Edit pin matrix — ${source.designator}`,
            subtitle: 'Dynamic component rebuild with stable port mapping',
            body,
            size: 'large',
            confirmLabel: 'Rebuild component',
            onMount: ({ body: root }) => {
                query('#edit-pins-add', root).addEventListener('click', () => {
                    const tbody = query('#edit-pins-body', root);
                    tbody.insertAdjacentHTML('beforeend', `<tr data-edit-pin-row><td><input class="pin-label" value="${tbody.rows.length + 1}" /></td><td><input class="pin-function" /></td><td><input class="pin-detail" /></td><td><select class="pin-side">${SIDES.map((side) => `<option>${side}</option>`).join('')}</select></td><td><select class="pin-electrical">${ELECTRICAL_CLASSES.map((value) => `<option>${value}</option>`).join('')}</select></td><td><input class="pin-max" type="number" min="1" value="1" /></td><td><button type="button" class="row-delete" data-edit-pin-delete>×</button></td></tr>`);
                });
                root.addEventListener('click', (event) => {
                    if (event.target.closest('[data-edit-pin-delete]'))
                        event.target.closest('tr')?.remove();
                });
                query('#edit-pins-sort', root).addEventListener('click', () => {
                    [...query('#edit-pins-body', root).rows]
                        .sort((a, b) => query('.pin-side', a).value.localeCompare(query('.pin-side', b).value) || query('.pin-label', a).value.localeCompare(query('.pin-label', b).value, undefined, { numeric: true }))
                        .forEach((row) => query('#edit-pins-body', root).append(row));
                });
            },
            onConfirm: ({ body: root }) => {
                const rows = [...root.querySelectorAll('[data-edit-pin-row]')];
                if (!rows.length)
                    throw new Error('A component requires at least one pin.');
                const nextPorts = rows.map((row, index) => ({
                    id: row.dataset.portId || `${source.id}:port:${createId('pin')}`,
                    label: query('.pin-label', row).value.trim() || String(index + 1),
                    function: query('.pin-function', row).value.trim(),
                    detail: query('.pin-detail', row).value.trim(),
                    side: query('.pin-side', row).value,
                    order: index,
                    visible: true,
                    electricalClass: query('.pin-electrical', row).value,
                    connectionPolicy: { maximumConnections: Math.max(1, Number(query('.pin-max', row).value) || 1), allowSelfConnection: false },
                }));
                this.host.engine.updateComponent(componentId, (component) => {
                    component.ports = nextPorts;
                    component.pinBanks = SIDES.map((side) => {
                        const ports = nextPorts.filter((port) => port.side === side);
                        if (!ports.length)
                            return null;
                        const old = component.pinBanks.find((bank) => bank.side === side);
                        const bank = old || { id: `${component.id}:bank:${side}`, side, portIds: [], flow: 'forward', rowGap: 2, edgePadding: 12, collapseEmpty: false };
                        bank.portIds = ports.map((port) => port.id);
                        ports.forEach((port, order) => { port.bankId = bank.id; port.order = order; });
                        return bank;
                    }).filter((bank) => Boolean(bank));
                }, { connectedPortRemoval: 'detach', reroute: 'full', reflowLabels: true });
                return true;
            },
        });
        if (changed)
            toast('Component rebuilt', 'Pins, banks, connected routes, and labels were recalculated.', 'success');
    }
    cableCoreRow(index, values = {}) {
        return `<tr data-cable-core-row><td><input class="core-label" value="${escapeAttribute(values.label || String(index + 1))}" /></td><td><input class="core-color" type="color" value="${escapeAttribute(values.color || ['#dc2626', '#111827', '#2563eb', '#f97316'][index % 4])}" /></td><td><input class="core-stripe" type="color" value="${escapeAttribute(values.stripe || '#ffffff')}" /></td><td><input class="core-awg" type="number" min="0" value="${escapeAttribute(values.gaugeAwg || 22)}" /></td><td><button type="button" class="row-delete" data-core-delete>×</button></td></tr>`;
    }
    async cableCreatorDialog() {
        const body = `
      <div class="modal-grid">
        <section class="modal-panel"><div class="modal-panel-title">Cable definition</div><div class="modal-panel-body form-grid">
          ${fieldRow('Name', textControl('cable-name', 'Custom cable'))}
          ${fieldRow('Manufacturer', textControl('cable-manufacturer', ''))}
          ${fieldRow('Part number', textControl('cable-part-number', ''))}
          ${fieldRow('Kind', selectControl('cable-kind', 'multi-core', ['multi-core', 'twisted-pair', 'shielded-twisted-pair', 'coaxial', 'ribbon']))}
          ${fieldRow('Outer diameter mm', textControl('cable-diameter', 6, { type: 'number', min: 0, step: 0.1 }))}
          ${fieldRow('Impedance Ω', textControl('cable-impedance', '', { type: 'number', min: 0, step: 1 }))}
          ${fieldRow('Tags', textControl('cable-tags', 'custom, cable'))}
        </div></section>
        <section class="modal-panel"><div class="modal-panel-title">Cores <button type="button" class="mini-action" id="cable-add-core">＋ Add core</button></div><div class="modal-panel-body table-scroll"><table class="data-table pin-editor-table"><thead><tr><th>Label</th><th>Color</th><th>Stripe</th><th>AWG</th><th></th></tr></thead><tbody id="cable-core-body">${[0, 1, 2, 3].map((index) => this.cableCoreRow(index)).join('')}</tbody></table></div><div class="modal-panel-body"><div id="cable-preview" class="cable-preview"></div></div></section>
      </div>`;
        const saved = await this.modal.open({
            title: 'Cable Creator',
            subtitle: 'Reusable local cable and core definition',
            body,
            size: 'large',
            confirmLabel: 'Save cable',
            onMount: ({ body: root }) => {
                const render = () => {
                    const preview = query('#cable-preview', root);
                    preview.innerHTML = [...root.querySelectorAll('[data-cable-core-row]')].map((row) => `<div><span style="--core:${escapeAttribute(query('.core-color', row).value)};--stripe:${escapeAttribute(query('.core-stripe', row).value)}"></span><strong>${escapeHtml(query('.core-label', row).value || 'CORE')}</strong><small>${escapeHtml(query('.core-awg', row).value)} AWG</small></div>`).join('');
                };
                root.addEventListener('input', render);
                query('#cable-add-core', root).addEventListener('click', () => {
                    const tbody = query('#cable-core-body', root);
                    tbody.insertAdjacentHTML('beforeend', this.cableCoreRow(tbody.rows.length));
                    render();
                });
                root.addEventListener('click', (event) => {
                    if (event.target.closest('[data-core-delete]')) {
                        event.target.closest('tr')?.remove();
                        render();
                    }
                });
                render();
            },
            onConfirm: async ({ body: root }) => {
                const name = query('#cable-name', root).value.trim();
                if (!name)
                    throw new Error('Cable name is required.');
                const coreRows = [...root.querySelectorAll('[data-cable-core-row]')];
                if (!coreRows.length)
                    throw new Error('At least one core is required.');
                const item = {
                    id: createId('library-cable'),
                    name,
                    manufacturer: query('#cable-manufacturer', root).value.trim(),
                    partNumber: query('#cable-part-number', root).value.trim(),
                    tags: query('#cable-tags', root).value.split(',').map((value) => value.trim()).filter(Boolean),
                    definition: {
                        kind: query('#cable-kind', root).value,
                        nominalOuterDiameterMm: Math.max(0, Number(query('#cable-diameter', root).value) || 0),
                        impedanceOhm: query('#cable-impedance', root).value ? Math.max(0, Number(query('#cable-impedance', root).value)) : undefined,
                        cores: coreRows.map((row, index) => ({
                            id: `core-${index + 1}`,
                            label: query('.core-label', row).value.trim() || String(index + 1),
                            color: query('.core-color', row).value,
                            stripe: query('.core-stripe', row).value,
                            gaugeAwg: Math.max(0, Number(query('.core-awg', row).value) || 0),
                        })),
                    },
                    modifiedAt: new Date().toISOString(),
                };
                return this.api.put('/api/library/cables', item);
            },
        });
        if (saved) {
            this.cables = [...this.cables.filter((value) => value.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name));
            this.renderLeftPanel();
            toast('Cable saved', 'The definition is available offline in the local library.', 'success');
        }
    }
    async cableDetailsDialog(cable) {
        const selectedWireIds = this.host.engine.selection.items
            .filter((item) => item.kind === 'wire')
            .map((item) => item.id)
            .filter((id) => Boolean(this.host.engine.document.wires[id]));
        const body = `
      <div class="modal-grid cable-details-grid">
        <section class="modal-panel"><div class="modal-panel-title">Cable</div><div class="modal-panel-body form-grid">
          ${fieldRow('Name', `<div class="readout">${escapeHtml(cable.name)}</div>`)}
          ${fieldRow('Manufacturer', `<div class="readout">${escapeHtml(cable.manufacturer || '—')}</div>`)}
          ${fieldRow('Part number', `<div class="readout mono">${escapeHtml(cable.partNumber || '—')}</div>`)}
          ${fieldRow('Construction', `<div class="readout">${escapeHtml(cable.definition.kind)}</div>`)}
          ${fieldRow('Outer diameter', `<div class="readout">${formatNumber(Number(cable.definition.nominalOuterDiameterMm || 0), 2)} mm</div>`)}
          ${cable.definition.impedanceOhm ? fieldRow('Impedance', `<div class="readout">${formatNumber(cable.definition.impedanceOhm, 0)} Ω</div>`) : ''}
          <div class="callout${selectedWireIds.length ? ' success' : ''}">${selectedWireIds.length
            ? `${selectedWireIds.length} selected conductor${selectedWireIds.length === 1 ? '' : 's'} will receive the chosen core appearance and metadata.`
            : 'Select one or more conductors before opening this dialog to apply a core definition.'}</div>
        </div></section>
        <section class="modal-panel"><div class="modal-panel-title">Cores</div><div class="modal-panel-body cable-core-list">
          ${cable.definition.cores.map((core, index) => `
            <button type="button" class="cable-core-card" data-apply-core="${escapeAttribute(core.id)}"${selectedWireIds.length ? '' : ' disabled'}>
              <span class="cable-core-line" style="--core-color:${escapeAttribute(core.color)};--core-stripe:${escapeAttribute(core.stripe || core.color)}"></span>
              <span><strong>${escapeHtml(core.label)}</strong><small>${core.gaugeAwg != null ? `${formatNumber(core.gaugeAwg, 0)} AWG` : 'Gauge not specified'} · core ${index + 1}</small></span>
              <span class="core-apply-label">Apply</span>
            </button>`).join('')}
        </div></section>
      </div>`;
        await this.modal.open({
            title: cable.name,
            subtitle: 'Local cable-library definition',
            body,
            size: 'large',
            hideFooter: true,
            onMount: ({ body: root, close }) => {
                root.querySelectorAll('[data-apply-core]').forEach((button) => button.addEventListener('click', () => {
                    const core = cable.definition.cores.find((value) => value.id === button.dataset.applyCore);
                    if (!core)
                        return;
                    for (const wireId of selectedWireIds) {
                        this.host.engine.updateWire(wireId, (wire) => {
                            wire.kind = 'cable-core';
                            wire.style.pattern = core.stripe
                                ? { kind: 'stripe', base: core.color, stripe: core.stripe, stripeWidth: Math.max(1, wire.style.width * 0.32), repeat: 14 }
                                : { kind: 'solid', color: core.color };
                            wire.metadata = {
                                ...(wire.metadata || {}),
                                cableDefinitionId: cable.id,
                                cableName: cable.name,
                                cablePartNumber: cable.partNumber,
                                cableCoreId: core.id,
                                cableCoreLabel: core.label,
                                gaugeAwg: core.gaugeAwg,
                                crossSectionMm2: core.crossSectionMm2,
                            };
                        });
                    }
                    toast('Cable core applied', `${core.label} was assigned to ${selectedWireIds.length} conductor${selectedWireIds.length === 1 ? '' : 's'}.`, 'success');
                    close();
                }));
            },
        });
    }
    async bomDialog(existing) {
        const primary = this.host.engine.selection.primary;
        let entityKind = existing?.entityKind;
        let entityId = existing?.entityId;
        if (!existing && primary) {
            entityKind = primary.kind === 'wire' ? 'conductor' : primary.kind === 'label' ? 'annotation' : primary.kind === 'port' ? 'contact' : primary.kind;
            entityId = primary.kind === 'port' && typeof primary.subId === 'string' ? primary.subId : primary.id;
        }
        if (!entityKind || !entityId) {
            toast('Select an entity', 'Select a component, conductor, pin, or annotation before creating a BOM assignment.', 'warning');
            return;
        }
        const document = this.host.engine.document;
        const component = primary?.kind === 'component' ? document.components[primary.id] : undefined;
        const wire = primary?.kind === 'wire' ? document.wires[primary.id] : undefined;
        const defaultDescription = existing?.description || component?.labels.description || component?.labels.title || wire?.label || wire?.signal || '';
        const body = `
      <div class="form-grid">
        ${fieldRow('Entity', `<div class="readout mono">${escapeHtml(entityKind)} · ${escapeHtml(entityId)}</div>`, { stacked: true })}
        ${fieldRow('Role', selectControl('bom-role', existing?.role || 'primary', ['primary', 'housing', 'contact', 'seal', 'terminal', 'accessory', 'material', 'consumable']))}
        ${fieldRow('Manufacturer', textControl('bom-manufacturer', existing?.manufacturer || component?.labels.manufacturer || ''))}
        ${fieldRow('Part number', textControl('bom-part-number', existing?.partNumber || component?.labels.partNumber || ''))}
        ${fieldRow('Description', `<textarea id="bom-description" class="form-textarea">${escapeHtml(defaultDescription)}</textarea>`, { stacked: true })}
        <div class="inline-fields">
          ${fieldRow('Quantity', textControl('bom-quantity', existing?.quantity ?? 1, { type: 'number', min: 0, step: 0.01 }))}
          ${fieldRow('Unit', selectControl('bom-unit', existing?.unit || (entityKind === 'conductor' ? 'mm' : 'each'), ['each', 'mm', 'm', 'in', 'ft', 'g', 'kg', 'set']))}
        </div>
        ${fieldRow('Supplier', textControl('bom-supplier', existing?.supplier || ''))}
        ${fieldRow('Notes', `<textarea id="bom-notes" class="form-textarea">${escapeHtml(existing?.notes || '')}</textarea>`, { stacked: true })}
        ${existing ? '<div class="button-row start"><button type="button" class="danger-button" data-delete-bom>Delete assignment</button></div>' : ''}
      </div>`;
        const saved = await this.modal.open({
            title: existing ? 'Edit BOM assignment' : 'Add BOM assignment',
            subtitle: 'Project-local manufacturing data',
            body,
            confirmLabel: existing ? 'Save assignment' : 'Add assignment',
            onMount: ({ body: root, close }) => {
                queryOptional('[data-delete-bom]', root)?.addEventListener('click', async () => {
                    if (!existing)
                        return;
                    try {
                        await this.api.delete(`/api/project/bom/${encodeURIComponent(existing.id)}`);
                        this.workspace.bom = this.workspace.bom.filter((value) => value.id !== existing.id);
                        this.renderBom();
                        close();
                        toast('BOM assignment deleted', '', 'success');
                    }
                    catch (error) {
                        toast('Delete failed', errorMessage(error), 'error');
                    }
                });
            },
            onConfirm: async ({ body: root }) => this.api.put('/api/project/bom', {
                id: existing?.id,
                modelId: this.workspace.workspace.activeModelId,
                entityKind,
                entityId,
                role: query('#bom-role', root).value,
                manufacturer: query('#bom-manufacturer', root).value.trim(),
                partNumber: query('#bom-part-number', root).value.trim(),
                description: query('#bom-description', root).value.trim(),
                quantity: Math.max(0, Number(query('#bom-quantity', root).value) || 0),
                unit: query('#bom-unit', root).value,
                supplier: query('#bom-supplier', root).value.trim(),
                notes: query('#bom-notes', root).value.trim(),
                properties: existing?.properties || {},
            }),
        });
        if (saved) {
            this.workspace.bom = [...this.workspace.bom.filter((value) => value.id !== saved.id && !(value.entityKind === saved.entityKind && value.entityId === saved.entityId && value.role === saved.role)), saved]
                .sort((a, b) => `${a.entityKind}:${a.entityId}:${a.role}`.localeCompare(`${b.entityKind}:${b.entityId}:${b.role}`));
            this.renderLeftPanel();
            toast('BOM assignment saved', `${saved.partNumber || saved.description || saved.entityId}`, 'success');
        }
    }
    async createRevisionDialog() {
        await this.saveNow(true);
        const body = `
      <div class="form-grid">
        ${fieldRow('Name', textControl('revision-name', `Revision ${this.workspace.revisions.length + 1}`))}
        ${fieldRow('Lifecycle', selectControl('revision-lifecycle', 'draft', ['draft', 'review', 'released', 'obsolete']))}
        ${fieldRow('Message', '<textarea id="revision-message" class="form-textarea" placeholder="What changed and why"></textarea>', { stacked: true })}
        <div class="callout">The revision stores a complete immutable snapshot of the active model and can be restored later.</div>
      </div>`;
        const revision = await this.modal.open({
            title: 'Create revision',
            subtitle: 'Immutable local model snapshot',
            body,
            confirmLabel: 'Create revision',
            onConfirm: async ({ body: root }) => {
                const name = query('#revision-name', root).value.trim();
                if (!name)
                    throw new Error('Revision name is required.');
                return this.api.post('/api/project/revisions', {
                    modelId: this.workspace.workspace.activeModelId,
                    pageId: this.workspace.workspace.activePageId,
                    viewKind: this.workspace.workspace.activeViewKind,
                    name,
                    lifecycleState: query('#revision-lifecycle', root).value,
                    message: query('#revision-message', root).value.trim(),
                });
            },
        });
        if (revision) {
            this.workspace.revisions = [revision, ...this.workspace.revisions.filter((value) => value.id !== revision.id)];
            toast('Revision created', revision.name, 'success');
            this.log('success', `Created immutable revision ${revision.name}.`);
        }
    }
    async revisionsDialog() {
        const modelId = this.workspace.workspace.activeModelId;
        this.workspace.revisions = await this.api.get(`/api/project/revisions?modelId=${encodeURIComponent(modelId || '')}`);
        const renderRows = () => this.workspace.revisions.map((revision) => `
      <article class="revision-card">
        <div class="revision-main"><strong>${escapeHtml(revision.name)}</strong><small>${escapeHtml(revision.lifecycleState)} · ${escapeHtml(formatDate(revision.createdAt))}</small><p>${escapeHtml(revision.message || 'No revision note.')}</p></div>
        <div class="revision-metrics"><span>${Number(revision.validation.errors || 0)} errors</span><span>${Number(revision.validation.warnings || 0)} warnings</span><code>${escapeHtml(revision.contentHash.slice(0, 12))}</code></div>
        <button type="button" class="secondary-button" data-restore-revision="${escapeAttribute(revision.id)}">Restore</button>
      </article>`).join('') || '<div class="panel-empty">No revisions exist for this model.</div>';
        await this.modal.open({
            title: 'Model revisions',
            subtitle: 'Local immutable snapshots',
            body: `<div class="modal-toolbar"><button type="button" class="primary-button" data-create-revision>＋ Create revision</button></div><div class="revision-list">${renderRows()}</div>`,
            size: 'large',
            hideFooter: true,
            onMount: ({ body: root, close }) => {
                query('[data-create-revision]', root).addEventListener('click', () => {
                    close();
                    void this.createRevisionDialog().then(() => this.revisionsDialog());
                });
                root.querySelectorAll('[data-restore-revision]').forEach((button) => button.addEventListener('click', async () => {
                    const revision = this.workspace.revisions.find((value) => value.id === button.dataset.restoreRevision);
                    if (!revision)
                        return;
                    const confirmed = await this.modal.open({
                        title: `Restore ${revision.name}?`,
                        subtitle: 'The active document will be replaced by the snapshot',
                        body: '<div class="callout warning">Current edits are saved first. Restoring creates a new persisted editor state; the revision snapshot remains unchanged.</div>',
                        confirmLabel: 'Restore snapshot',
                        destructive: true,
                        onConfirm: () => true,
                    });
                    if (!confirmed)
                        return;
                    try {
                        await this.saveNow(true);
                        const response = await this.api.post(`/api/project/revisions/${encodeURIComponent(revision.id)}/restore`);
                        await this.adoptWorkspace(response.workspace, `Restored ${revision.name}.`);
                        close();
                    }
                    catch (error) {
                        toast('Restore failed', errorMessage(error), 'error');
                    }
                }));
            },
        });
    }
    async generateAssemblyDialog() {
        const document = this.host.engine.document;
        const selectedComponents = new Set(this.host.engine.selection.items.filter((item) => item.kind === 'component').map((item) => item.id));
        const selectedWires = new Set(this.host.engine.selection.items.filter((item) => item.kind === 'wire').map((item) => item.id));
        const useSelection = selectedComponents.size > 0;
        const body = `
      <div class="modal-grid">
        <section class="modal-panel"><div class="modal-panel-title">Assembly identity</div><div class="modal-panel-body form-grid">
          ${fieldRow('Name', textControl('assembly-name', `Assembly ${this.workspace.models.filter((model) => model.kind === 'assembly').length + 1}`))}
          ${fieldRow('Designator', textControl('assembly-designator', `ASM-${String(this.workspace.models.filter((model) => model.kind === 'assembly').length + 1).padStart(3, '0')}`))}
          ${fieldRow('Description', '<textarea id="assembly-description" class="form-textarea">Generated manufacturing assembly</textarea>', { stacked: true })}
          <div class="callout">Generation creates independent Layout and Schematic projections with stable origin mappings back to this Plan.</div>
        </div></section>
        <section class="modal-panel"><div class="modal-panel-title">Included topology</div><div class="modal-panel-body assembly-selection-list">
          ${document.componentOrder.map((id) => {
            const component = document.components[id];
            return `<label class="check-row"><input type="checkbox" data-assembly-component="${escapeAttribute(id)}"${checked(useSelection ? selectedComponents.has(id) : true)} /><span><strong>${escapeHtml(component.designator)}</strong><small>${escapeHtml(component.labels.title || component.kind)} · ${component.ports.length} ports</small></span></label>`;
        }).join('') || '<div class="panel-empty">No components exist.</div>'}
          <div class="assembly-wire-summary">Connected conductors are included when both endpoints belong to selected components. Explicitly selected conductors are always considered.</div>
        </div></section>
      </div>`;
        const result = await this.modal.open({
            title: 'Generate assembly',
            subtitle: 'Create manufacturing projections from Plan topology',
            body,
            size: 'large',
            confirmLabel: 'Generate assembly',
            onConfirm: async ({ body: root }) => {
                await this.saveNow(true);
                const componentIds = [...root.querySelectorAll('[data-assembly-component]:checked')].map((input) => input.dataset.assemblyComponent);
                if (!componentIds.length)
                    throw new Error('Select at least one component.');
                const included = new Set(componentIds);
                const wireIds = document.wireOrder.filter((id) => {
                    if (selectedWires.has(id))
                        return true;
                    const wire = document.wires[id];
                    const sourceIncluded = wire.source.kind !== 'port' || included.has(wire.source.componentId);
                    const targetIncluded = wire.target.kind !== 'port' || included.has(wire.target.componentId);
                    return sourceIncluded && targetIncluded;
                });
                return this.api.post('/api/project/generate-assembly', {
                    sourceModelId: this.workspace.workspace.activeModelId,
                    sourcePageId: this.workspace.workspace.activePageId,
                    sourceViewKind: this.workspace.workspace.activeViewKind,
                    name: query('#assembly-name', root).value.trim(),
                    designator: query('#assembly-designator', root).value.trim(),
                    description: query('#assembly-description', root).value.trim(),
                    componentIds,
                    wireIds,
                });
            },
        });
        if (result)
            await this.adoptWorkspace(result, 'Assembly generated.');
    }
    downloadExport(format) {
        this.api.download(format, {
            modelId: this.workspace.workspace.activeModelId,
            pageId: this.workspace.workspace.activePageId,
            viewKind: this.workspace.workspace.activeViewKind,
            showGrid: this.host.engine.document.settings.grid.visible,
            showDiagnostics: true,
        });
        const definition = this.exports.find((value) => value.id === format);
        this.log('info', `Export requested: ${definition?.label || format}.`);
        this.setStatus(`Generating ${definition?.label || format} locally…`, 'info');
    }
    async exportsDialog() {
        if (!this.exports.length)
            this.exports = await this.api.get('/api/exports');
        const body = `<div class="export-grid">${this.exports.map((item) => `
      <button type="button" class="export-card" data-export-format="${escapeAttribute(item.id)}">
        <span class="export-icon">${item.extension.toUpperCase()}</span>
        <span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.description || `${item.mediaType} · .${item.extension}`)}</small></span>
        <span class="export-action">Export</span>
      </button>`).join('')}</div>
      <div class="callout">Exports are generated from the active SQLite project and editor projection on the local loopback server.</div>`;
        await this.modal.open({
            title: 'Export project data',
            subtitle: 'Local engineering and manufacturing outputs',
            body,
            size: 'large',
            hideFooter: true,
            onMount: ({ body: root, close }) => {
                root.querySelectorAll('[data-export-format]').forEach((button) => button.addEventListener('click', () => {
                    this.downloadExport(button.dataset.exportFormat);
                    close();
                }));
            },
        });
    }
    async importEditorDialog() {
        const body = `
      <div class="form-grid">
        ${fieldRow('Editor JSON', '<input id="import-editor-file" class="form-control" type="file" accept="application/json,.json" />', { stacked: true })}
        <div class="callout warning">Import replaces only the active editor document. The project database, parts library, BOM, and other models remain intact.</div>
      </div>`;
        const imported = await this.modal.open({
            title: 'Import editor document',
            subtitle: 'RouteCore editor JSON',
            body,
            confirmLabel: 'Import document',
            onConfirm: async ({ body: root }) => {
                const file = query('#import-editor-file', root).files?.[0];
                if (!file)
                    throw new Error('Choose an editor JSON file.');
                let documentValue;
                try {
                    documentValue = JSON.parse(await file.text());
                }
                catch {
                    throw new Error('The selected file is not valid JSON.');
                }
                if (documentValue.schemaVersion !== 1 || !documentValue.components || !documentValue.wires || !documentValue.labels) {
                    throw new Error('The file is not a supported RouteCore editor document.');
                }
                await this.api.post('/api/project/import-editor', {
                    modelId: this.workspace.workspace.activeModelId,
                    pageId: this.workspace.workspace.activePageId,
                    viewKind: this.workspace.workspace.activeViewKind,
                    document: documentValue,
                    reason: 'import editor document',
                });
                return documentValue;
            },
        });
        if (imported) {
            const envelope = await this.api.get(`/api/project/document?modelId=${encodeURIComponent(this.workspace.workspace.activeModelId || '')}&pageId=${encodeURIComponent(this.workspace.workspace.activePageId || '')}&viewKind=${encodeURIComponent(this.workspace.workspace.activeViewKind)}`);
            this.workspace.editor = envelope;
            this.saveRevision = 0;
            this.savedRevision = 0;
            this.host.load(envelope.document, this.workspace.workspace.viewportState);
            this.renderAll();
            toast('Editor document imported', '', 'success');
        }
    }
    async integrityDialog() {
        const result = await this.api.get('/api/project/integrity');
        const body = `
      <div class="integrity-summary ${result.ok ? 'ok' : 'failed'}"><strong>${result.ok ? 'Database integrity valid' : 'Integrity problem detected'}</strong><span>${result.ok ? 'SQLite quick check and foreign-key verification passed.' : 'Review the details below before continuing engineering work.'}</span></div>
      <div class="metrics-grid"><div><strong>${result.quick.length}</strong><span>quick-check rows</span></div><div><strong>${result.foreignKeys.length}</strong><span>foreign-key issues</span></div><div><strong>${result.migrations.length}</strong><span>migrations</span></div></div>
      <section class="modal-panel"><div class="modal-panel-title">Quick check</div><div class="modal-panel-body"><pre class="code-block">${escapeHtml(result.quick.join('\n'))}</pre></div></section>
      <section class="modal-panel"><div class="modal-panel-title">Schema migrations</div><div class="modal-panel-body table-scroll"><table class="data-table"><thead><tr><th>ID</th><th>Name</th><th>Applied</th></tr></thead><tbody>${result.migrations.map((migration) => `<tr><td class="mono">${escapeHtml(String(migration.id ?? migration.migration_id ?? ''))}</td><td>${escapeHtml(String(migration.name ?? migration.description ?? ''))}</td><td>${escapeHtml(formatDate(String(migration.applied_at ?? migration.appliedAt ?? '')))}</td></tr>`).join('')}</tbody></table></div></section>`;
        await this.modal.open({ title: 'Project database integrity', subtitle: this.workspace.path, body, size: 'large', hideFooter: true });
    }
    async settingsDialog() {
        const settings = this.bootstrap.settings;
        const body = `
      <div class="form-grid">
        ${fieldRow('Theme', selectControl('settings-theme', this.theme, ['dark', 'light']))}
        ${fieldRow('Interface density', selectControl('settings-density', String(settings.density || byId('app').dataset.density || 'compact'), ['compact', 'comfortable']))}
        ${fieldRow('Autosave delay ms', textControl('settings-autosave', Number(settings.autosaveDelayMs || 420), { type: 'number', min: 100, max: 5000, step: 50 }))}
        ${fieldRow('Show route handles', `<input id="settings-route-handles" class="form-control" type="checkbox"${checked(settings.showRouteHandles !== false)} />`)}
        ${fieldRow('Show diagnostics', `<input id="settings-diagnostics" class="form-control" type="checkbox"${checked(settings.showDiagnostics !== false)} />`)}
        <div class="callout">Application preferences are stored in a separate local SQLite database. Project engineering data remains inside the selected ${PROJECT_EXTENSION} file.</div>
      </div>`;
        const updated = await this.modal.open({
            title: 'Application settings',
            subtitle: 'Offline workspace preferences',
            body,
            confirmLabel: 'Save settings',
            onConfirm: async ({ body: root }) => this.api.put('/api/settings', {
                theme: query('#settings-theme', root).value,
                density: query('#settings-density', root).value,
                autosaveDelayMs: Math.max(100, Number(query('#settings-autosave', root).value) || 420),
                showRouteHandles: query('#settings-route-handles', root).checked,
                showDiagnostics: query('#settings-diagnostics', root).checked,
            }),
        });
        if (updated) {
            this.bootstrap.settings = updated;
            this.theme = updated.theme === 'light' ? 'light' : 'dark';
            byId('app').dataset.density = String(updated.density || 'compact');
            this.host.setShowRouteHandles(updated.showRouteHandles !== false);
            this.host.setShowDiagnostics(updated.showDiagnostics !== false);
            this.applyTheme();
            toast('Settings saved', '', 'success');
        }
    }
    async persistTheme() {
        this.applyTheme();
        try {
            this.bootstrap.settings = await this.api.put('/api/settings', { theme: this.theme });
        }
        catch (error) {
            this.log('warning', `Theme preference could not be persisted: ${errorMessage(error)}`);
        }
    }
    async toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        await this.persistTheme();
    }
    async shortcutsDialog() {
        const shortcuts = [
            ['V', 'Select tool'], ['H / Space', 'Pan tool / temporary pan'], ['W', 'Wire tool'], ['L', 'Label tool'], ['C', 'Component placement'],
            ['Ctrl+Z', 'Undo'], ['Ctrl+Y / Ctrl+Shift+Z', 'Redo'], ['Delete', 'Delete or detach selection'], ['Arrow keys', 'Nudge selected entity'],
            ['Ctrl+S', 'Checkpoint'], ['Ctrl+N', 'New project'], ['Ctrl+O', 'Open project'], ['Ctrl+Shift+E', 'Export'], ['F', 'Fit drawing'], ['G', 'Toggle grid'], ['Esc', 'Cancel active gesture'],
        ];
        await this.modal.open({
            title: 'Keyboard shortcuts',
            subtitle: 'Dense CAD interaction reference',
            body: `<div class="shortcut-grid">${shortcuts.map(([key, description]) => `<kbd>${escapeHtml(key)}</kbd><span>${escapeHtml(description)}</span>`).join('')}</div>`,
            hideFooter: true,
        });
    }
    async aboutDialog() {
        const app = this.bootstrap.application;
        await this.modal.open({
            title: app.name,
            subtitle: `Version ${app.version}`,
            body: `<div class="about-panel"><div class="about-mark">RC</div><div><h3>Offline-first wiring harness CAD</h3><p>Visual topology, synchronized model projections, deterministic routing, local component and cable libraries, BOM assignments, revisions, manufacturing exports, and SQLite persistence.</p><dl><dt>Network policy</dt><dd>${escapeHtml(app.networkPolicy)}</dd><dt>Project format</dt><dd>${escapeHtml(app.projectFormat)}</dd><dt>Editor core</dt><dd>@routecore/harness-editor-core 0.3.0</dd><dt>Project file</dt><dd class="mono">${escapeHtml(this.workspace.path)}</dd></dl></div></div>`,
            size: 'large',
            hideFooter: true,
        });
    }
    menuEntries(menu) {
        const selection = this.host.engine.selection;
        const hasSelection = selection.items.length > 0;
        const hasComponents = selection.items.some((item) => item.kind === 'component');
        const hasWires = selection.items.some((item) => item.kind === 'wire');
        const entries = {
            file: [
                { label: 'New project…', icon: '＋', shortcut: 'Ctrl+N', action: () => this.newProjectDialog() },
                { label: 'Open project…', icon: '↗', shortcut: 'Ctrl+O', action: () => this.openProjectDialog() },
                { separator: true },
                { label: 'Checkpoint', icon: '◆', shortcut: 'Ctrl+S', action: () => this.checkpoint() },
                { label: 'Project properties…', icon: 'ⓘ', action: () => this.projectPropertiesDialog() },
                { label: 'Create revision…', icon: '◈', action: () => this.createRevisionDialog() },
                { label: 'Revision history…', icon: '↺', action: () => this.revisionsDialog() },
                { separator: true },
                { label: 'Import editor JSON…', icon: '⇥', action: () => this.importEditorDialog() },
                { label: 'Export…', icon: '⇱', shortcut: 'Ctrl+Shift+E', action: () => this.exportsDialog() },
            ],
            edit: [
                { label: 'Undo', icon: '↶', shortcut: 'Ctrl+Z', disabled: !this.host.engine.canUndo, action: () => this.host.undo() },
                { label: 'Redo', icon: '↷', shortcut: 'Ctrl+Y', disabled: !this.host.engine.canRedo, action: () => this.host.redo() },
                { separator: true },
                { label: 'Duplicate component', icon: '⧉', shortcut: 'Ctrl+D', disabled: !hasComponents, action: () => this.duplicateSelectedComponents() },
                { label: 'Rotate clockwise', icon: '↻', shortcut: 'R', disabled: !hasComponents, action: () => this.host.rotateSelection() },
                { label: 'Delete selection', icon: '⌫', shortcut: 'Delete', disabled: !hasSelection, action: () => this.host.deleteSelection(true) },
            ],
            view: [
                { label: 'Fit drawing', icon: '⌗', shortcut: 'F', action: () => this.host.fit() },
                { label: 'Center selection', icon: '◎', disabled: !hasSelection, action: () => this.host.centerOnSelection() },
                { label: 'Reset zoom', icon: '1:1', action: () => this.host.resetZoom() },
                { separator: true },
                { label: this.host.engine.document.settings.grid.visible ? 'Hide grid' : 'Show grid', icon: '#', shortcut: 'G', action: () => byId('toggle-grid').click() },
                { label: this.host.engine.document.settings.grid.snap ? 'Disable snapping' : 'Enable snapping', icon: '⌖', action: () => byId('toggle-snap').click() },
                { label: this.bottomOpen ? 'Hide bottom panel' : 'Show bottom panel', icon: '▤', action: () => this.setBottomOpen(!this.bottomOpen) },
                { label: this.theme === 'dark' ? 'Use light theme' : 'Use dark theme', icon: '◐', action: () => this.toggleTheme() },
            ],
            insert: [
                { label: 'Library component', icon: '▣', shortcut: 'C', action: () => this.activateLibraryPlacement() },
                { label: 'New component definition…', icon: '◫', action: () => this.componentCreatorDialog() },
                { label: 'Annotation label', icon: 'T', shortcut: 'L', action: () => this.setTool('label') },
                { label: 'Cable definition…', icon: '≋', action: () => this.cableCreatorDialog() },
                { separator: true },
                { label: 'BOM assignment…', icon: '☷', disabled: !hasSelection, action: () => this.bomDialog() },
            ],
            route: [
                { label: 'Draw wire', icon: '⌁', shortcut: 'W', action: () => this.setTool('wire') },
                { label: 'Auto-route selected', icon: '⌗', disabled: !hasWires && hasSelection, action: () => this.host.autoRouteSelection() },
                { label: 'Auto-route complete view', icon: '⇝', action: () => { this.host.engine.autoRoute(); } },
                { separator: true },
                ...ROUTE_PATTERNS.map((pattern) => ({
                    label: pattern,
                    icon: this.host.engine.document.settings.defaultRouting.pattern === pattern ? '●' : '○',
                    action: () => this.setRoutePattern(pattern, hasWires),
                })),
            ],
            tools: [
                { label: 'Generate assembly…', icon: '◇', action: () => this.generateAssemblyDialog() },
                { label: 'Database integrity…', icon: '✓', action: () => this.integrityDialog() },
                { label: 'Application settings…', icon: '⚙', action: () => this.settingsDialog() },
            ],
            help: [
                { label: 'Keyboard shortcuts', icon: '⌨', shortcut: 'F1', action: () => this.shortcutsDialog() },
                { label: 'About RouteCore', icon: 'ⓘ', action: () => this.aboutDialog() },
            ],
        };
        return entries[menu] || [];
    }
    setRoutePattern(pattern, selectionOnly) {
        const wireIds = this.host.engine.selection.items.filter((item) => item.kind === 'wire').map((item) => item.id);
        if (selectionOnly && wireIds.length) {
            for (const id of wireIds)
                this.host.engine.updateWire(id, (wire) => { wire.routing.pattern = pattern; });
            this.host.engine.autoRoute(wireIds);
        }
        else {
            this.host.engine.execute('Set default route pattern', (draft) => { draft.settings.defaultRouting.pattern = pattern; });
        }
    }
    duplicateSelectedComponents() {
        const document = this.host.engine.document;
        const selected = this.host.engine.selection.items.filter((item) => item.kind === 'component').map((item) => item.id);
        const created = [];
        for (const id of selected) {
            const component = document.components[id];
            if (!component)
                continue;
            const copy = duplicateComponent(component, this.host.engine.document, { x: 28, y: 28 });
            this.host.engine.addComponent(copy);
            created.push({ kind: 'component', id: copy.id });
        }
        if (created.length)
            this.host.select(created);
    }
    toggleMenu(menu, trigger) {
        if (this.menuOpen === menu) {
            this.closeMenus();
            return;
        }
        this.closeMenus();
        const entries = this.menuEntries(menu);
        const popup = document.createElement('div');
        popup.className = 'menu-popup';
        popup.setAttribute('role', 'menu');
        entries.forEach((entry) => {
            if (entry.separator) {
                const separator = document.createElement('div');
                separator.className = 'menu-separator';
                popup.append(separator);
                return;
            }
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'menu-item';
            button.disabled = Boolean(entry.disabled);
            button.innerHTML = `<span class="menu-item-icon">${escapeHtml(entry.icon || '')}</span><span class="menu-item-label">${escapeHtml(entry.label || '')}</span><kbd>${escapeHtml(entry.shortcut || '')}</kbd>`;
            button.addEventListener('click', () => {
                this.closeMenus();
                try {
                    const result = entry.action?.();
                    if (result instanceof Promise)
                        void result.catch((error) => toast('Command failed', errorMessage(error), 'error'));
                }
                catch (error) {
                    toast('Command failed', errorMessage(error), 'error');
                }
            });
            popup.append(button);
        });
        const rect = trigger.getBoundingClientRect();
        popup.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - 290))}px`;
        popup.style.top = `${rect.bottom + 1}px`;
        byId('menu-popup-root').append(popup);
        trigger.classList.add('active');
        this.menuOpen = menu;
    }
    closeMenus() {
        byId('menu-popup-root').replaceChildren();
        document.querySelectorAll('.menu-trigger.active').forEach((item) => item.classList.remove('active'));
        this.menuOpen = null;
    }
    openContextMenu(screenPoint, worldPoint, hit) {
        const root = byId('context-menu-root');
        root.replaceChildren();
        if (hit) {
            if (hit.kind === 'component-body' || hit.kind === 'component-header')
                this.host.select([{ kind: 'component', id: hit.entityId }]);
            else if (hit.kind === 'port' && typeof hit.subId === 'string')
                this.host.select([{ kind: 'port', id: hit.entityId, subId: hit.subId }]);
            else if (hit.kind === 'wire' || hit.kind === 'route-segment' || hit.kind === 'route-waypoint')
                this.host.select([{ kind: 'wire', id: hit.entityId, subId: hit.subId }]);
            else if (hit.kind === 'label')
                this.host.select([{ kind: 'label', id: hit.entityId }]);
        }
        const primary = this.host.engine.selection.primary;
        const entries = [];
        if (primary?.kind === 'component')
            entries.push({ label: 'Edit pin matrix…', icon: '▦', action: () => this.editComponentPinsDialog(primary.id) }, { label: 'Duplicate', icon: '⧉', action: () => this.duplicateSelectedComponents() }, { label: 'Rotate 90°', icon: '↻', action: () => this.host.rotateSelection() }, { label: 'Add BOM assignment…', icon: '☷', action: () => this.bomDialog() }, { separator: true }, { label: 'Delete and detach wires', icon: '⌫', action: () => this.host.deleteSelection(true) });
        else if (primary?.kind === 'wire')
            entries.push({ label: 'Auto-route', icon: '⌗', action: () => this.host.autoRouteSelection() }, { label: 'Add wire label', icon: 'T', action: () => this.addLabelForWire(primary.id) }, { label: 'Assign cable core…', icon: '≋', action: () => { this.activeLeftTab = 'library'; this.renderLeftPanel(); } }, { label: 'Add BOM assignment…', icon: '☷', action: () => this.bomDialog() }, { separator: true }, { label: 'Delete wire', icon: '⌫', action: () => this.host.deleteSelection(true) });
        else if (primary?.kind === 'port')
            entries.push({ label: 'Edit component pins…', icon: '▦', action: () => this.editComponentPinsDialog(primary.id) }, { label: 'Add BOM assignment…', icon: '☷', action: () => this.bomDialog() }, { separator: true }, { label: 'Delete pin and detach wires', icon: '⌫', action: () => this.deleteSelectedPort() });
        else if (primary?.kind === 'label')
            entries.push({ label: 'Reset automatic placement', icon: '◎', action: () => { this.host.engine.resetLabel(primary.id); } }, { label: 'Delete annotation', icon: '⌫', action: () => this.host.deleteSelection(true) });
        else
            entries.push({ label: 'Place component here', icon: '▣', action: () => { this.activateLibraryPlacement(); this.placePendingComponent(worldPoint); } }, { label: 'Place annotation here', icon: 'T', action: () => this.placeLabel(worldPoint) }, { label: 'Fit drawing', icon: '⌗', action: () => this.host.fit() });
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        for (const entry of entries) {
            if (entry.separator) {
                const separator = document.createElement('div');
                separator.className = 'menu-separator';
                menu.append(separator);
                continue;
            }
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'menu-item';
            button.innerHTML = `<span class="menu-item-icon">${escapeHtml(entry.icon || '')}</span><span class="menu-item-label">${escapeHtml(entry.label || '')}</span>`;
            button.addEventListener('click', () => {
                root.replaceChildren();
                try {
                    const result = entry.action?.();
                    if (result instanceof Promise)
                        void result.catch((error) => toast('Command failed', errorMessage(error), 'error'));
                }
                catch (error) {
                    toast('Command failed', errorMessage(error), 'error');
                }
            });
            menu.append(button);
        }
        const canvasRect = byId('canvas-shell').getBoundingClientRect();
        const left = Math.max(4, Math.min(canvasRect.left + screenPoint.x, window.innerWidth - 310));
        const top = Math.max(4, Math.min(canvasRect.top + screenPoint.y, window.innerHeight - Math.max(180, entries.length * 34)));
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        root.append(menu);
    }
    addLabelForWire(wireId) {
        const wire = this.host.engine.document.wires[wireId];
        if (!wire)
            return;
        const label = {
            id: createId('label'),
            text: wire.label || wire.signal || wire.id,
            anchor: { ownerKind: 'wire', ownerId: wire.id, wireFraction: 0.5 },
            mode: 'auto',
            orientation: 'follow-segment',
            offset: { x: 0, y: -8 },
            priority: 20,
            avoidWires: false,
            avoidComponents: true,
            allowLeader: true,
            visible: true,
            locked: false,
            style: { fontSize: 10, fontWeight: 600 },
        };
        this.host.engine.addLabel(label);
        this.host.select([{ kind: 'label', id: label.id }]);
    }
    deleteSelectedPort() {
        const primary = this.host.engine.selection.primary;
        if (primary?.kind !== 'port' || typeof primary.subId !== 'string')
            return;
        const portId = primary.subId;
        this.host.engine.updateComponent(primary.id, (component) => {
            component.ports = component.ports.filter((port) => port.id !== portId);
            component.pinBanks = component.pinBanks.map((bank) => ({ ...bank, portIds: bank.portIds.filter((id) => id !== portId) })).filter((bank) => bank.portIds.length > 0);
        }, { connectedPortRemoval: 'detach', reroute: 'full', reflowLabels: true });
        this.host.select([{ kind: 'component', id: primary.id }]);
    }
    handleGlobalKeyDown(event) {
        if (isTextEntryTarget(event.target))
            return;
        const ctrl = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        if (ctrl && key === 'n') {
            event.preventDefault();
            void this.newProjectDialog();
            return;
        }
        if (ctrl && key === 'o') {
            event.preventDefault();
            void this.openProjectDialog();
            return;
        }
        if (ctrl && key === 's') {
            event.preventDefault();
            void this.checkpoint();
            return;
        }
        if (ctrl && event.shiftKey && key === 'e') {
            event.preventDefault();
            void this.exportsDialog();
            return;
        }
        if (ctrl && key === 'd') {
            event.preventDefault();
            this.duplicateSelectedComponents();
            return;
        }
        if (event.key === 'F1') {
            event.preventDefault();
            void this.shortcutsDialog();
            return;
        }
        if (ctrl)
            return;
        if (key === 'v') {
            event.preventDefault();
            this.setTool('select');
        }
        else if (key === 'h') {
            event.preventDefault();
            this.setTool('pan');
        }
        else if (key === 'w') {
            event.preventDefault();
            this.setTool('wire');
        }
        else if (key === 'l') {
            event.preventDefault();
            this.setTool('label');
        }
        else if (key === 'c') {
            event.preventDefault();
            this.activateLibraryPlacement();
        }
        else if (key === 'r') {
            event.preventDefault();
            this.host.rotateSelection();
        }
        else if (key === 'f') {
            event.preventDefault();
            this.host.fit();
        }
        else if (key === 'g') {
            event.preventDefault();
            byId('toggle-grid').click();
        }
    }
    beginSplitDrag(event, side) {
        if (event.button !== 0)
            return;
        event.preventDefault();
        const panel = byId(side === 'left' ? 'left-panel' : 'right-panel');
        this.splitDrag = { side, startX: event.clientX, startWidth: panel.getBoundingClientRect().width };
        document.body.classList.add('resizing-dock');
        event.currentTarget.setPointerCapture(event.pointerId);
    }
    continueSplitDrag(event) {
        if (!this.splitDrag)
            return;
        const delta = event.clientX - this.splitDrag.startX;
        const width = clamp(this.splitDrag.startWidth + (this.splitDrag.side === 'left' ? delta : -delta), this.splitDrag.side === 'left' ? 180 : 240, 620);
        document.documentElement.style.setProperty(this.splitDrag.side === 'left' ? '--left-width' : '--right-width', `${Math.round(width)}px`);
        writeLocalSetting(this.splitDrag.side === 'left' ? 'left-width' : 'right-width', String(Math.round(width)));
    }
    endSplitDrag() {
        if (!this.splitDrag)
            return;
        const side = this.splitDrag.side;
        this.splitDrag = null;
        document.body.classList.remove('resizing-dock');
        const width = byId(side === 'left' ? 'left-panel' : 'right-panel').getBoundingClientRect().width;
        const key = side === 'left' ? 'leftPanelWidth' : 'rightPanelWidth';
        void this.api.put('/api/settings', { [key]: Math.round(width) })
            .then((settings) => { this.bootstrap.settings = settings; })
            .catch((error) => this.log('warning', `Panel width preference could not be saved: ${errorMessage(error)}`));
    }
    renderFatal(message) {
        document.body.innerHTML = `<main class="fatal-screen"><section><div class="about-mark">RC</div><h1>RouteCore could not start</h1><p>${escapeHtml(message)}</p><pre>Start the application with Node.js 22 or newer and verify that the local project directory is writable.</pre><button id="fatal-retry" type="button">Retry</button></section></main>`;
        document.getElementById('fatal-retry')?.addEventListener('click', () => location.reload());
    }
}
void new StudioApplication().start();
//# sourceMappingURL=main.js.map