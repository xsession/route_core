import { create } from 'zustand';
import type {
  Harness,
  HarnessNode,
  Connection,
  ConnectionEndpoint,
  Component,
  Wire,
  Cable,
  ValidationIssue,
} from '@route-core/core';
import {
  createHarness,
  HarnessBuilder,
  HarnessValidator,
  WireRouter,
  type RoutedWire,
} from '@route-core/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SignalEdit {
  pinId: string;
  label: string;
}

export interface HarnessState {
  harness: Harness;
  builder: HarnessBuilder;
  routes: RoutedWire[];
  issues: ValidationIssue[];

  // Selection
  selectedNodeId: string | null;
  selectedConnectionId: string | null;
  selectedNodeIds: Set<string>;

  // Tool mode
  tool: 'select' | 'connect' | 'pan' | 'boxselect';

  // Box select state
  boxSelectStart: { x: number; y: number } | null;
  boxSelectEnd: { x: number; y: number } | null;
  boxSelectDirection: 'right' | 'left' | null;

  // UI panels
  rightPanel: 'components' | 'wires' | 'cables' | 'settings' | null;

  // Wire connection flow
  connectingFrom: ConnectionEndpoint | null;

  // Wire defaults
  selectedWireGauge: number;
  selectedWireColor: string;
  selectedWireSignal: string;

  // Modification tracking
  harnessModified: boolean;

  // Undo / Redo
  undoStack: string[];
  redoStack: string[];

  // Signal editor
  editingSignalsNodeId: string | null;

  // Context menu
  contextMenu: { x: number; y: number; nodeId?: string; connectionId?: string } | null;

  // Collapsed nodes (hide unused pins)
  collapsedNodes: Set<string>;

  // Selected pin for pin editor
  selectedPinId: { nodeId: string; pinId: string } | null;

  // Dragging flag
  _isDragging: boolean;

  // Actions
  newHarness: (name: string, author: string) => void;
  loadHarness: (harness: Harness) => void;
  placeComponent: (component: Component, pos: { x: number; y: number }) => void;
  removeNode: (nodeId: string) => void;
  moveNode: (nodeId: string, pos: { x: number; y: number }) => void;
  moveNodes: (moves: Array<{ nodeId: string; pos: { x: number; y: number } }>) => void;
  startDrag: () => void;
  endDrag: () => void;
  rotateNode: (nodeId: string, degrees: number) => void;
  renameNode: (nodeId: string, label: string) => void;
  connect: (from: ConnectionEndpoint, to: ConnectionEndpoint, signal: string) => void;
  disconnect: (connectionId: string) => void;
  addWire: (wire: Wire) => void;
  addCable: (cable: Cable) => void;
  removeCable: (cableId: string) => void;
  selectNode: (nodeId: string | null) => void;
  selectConnection: (connectionId: string | null) => void;
  toggleSelectNode: (nodeId: string) => void;
  selectNodes: (nodeIds: string[]) => void;
  clearSelection: () => void;
  setTool: (tool: HarnessState['tool']) => void;
  saveRevision: (message: string) => void;
  validate: () => void;
  reroute: () => void;

  setRightPanel: (panel: HarnessState['rightPanel']) => void;
  startConnection: (from: ConnectionEndpoint) => void;
  completeConnection: (to: ConnectionEndpoint) => void;
  cancelConnection: () => void;
  setSelectedWireGauge: (gauge: number) => void;
  setSelectedWireColor: (color: string) => void;
  setSelectedWireSignal: (signal: string) => void;
  updateHarnessInfo: (name: string, description: string) => void;

  toggleGrid: () => void;
  setGridSize: (size: number) => void;
  toggleSnapToGrid: () => void;
  toggleLabels: () => void;
  togglePinNumbers: () => void;
  toggleWireInfo: () => void;
  setWireUnits: (units: 'awg' | 'mm2') => void;
  setLengthUnits: (units: 'imperial' | 'metric') => void;

  undo: () => void;
  redo: () => void;
  fitToView: () => void;

  bulkConnect: (componentA: string, componentB: string, pattern: 'straight' | 'crossover') => void;
  deleteSelected: () => void;

  startBoxSelect: (pos: { x: number; y: number }) => void;
  updateBoxSelect: (pos: { x: number; y: number }) => void;
  endBoxSelect: (additive: boolean) => void;
  cancelBoxSelect: () => void;

  openSignalEditor: (nodeId: string) => void;
  closeSignalEditor: () => void;
  updateSignals: (nodeId: string, edits: SignalEdit[]) => void;

  moveConnection: (connectionId: string, newEndpoint: ConnectionEndpoint, side: 'from' | 'to') => void;
  swapConnections: (connIdA: string, connIdB: string, side: 'from' | 'to') => void;
  updateConnectionProps: (connectionId: string, props: Partial<Pick<Connection, 'signalLabel' | 'colorCode' | 'length'>>) => void;

  openContextMenu: (pos: { x: number; y: number }, nodeId?: string, connectionId?: string) => void;
  closeContextMenu: () => void;

  toggleCollapseNode: (nodeId: string) => void;
  collapseAll: () => void;
  expandAll: () => void;

  selectPin: (nodeId: string, pinId: string) => void;
  clearPinSelection: () => void;
  assignCableToConnection: (connectionId: string, cableId: string, conductorIndex: number) => void;
  unassignCableFromConnection: (connectionId: string) => void;
}

const routerEngine = new WireRouter();
const validatorEngine = new HarnessValidator();

function toSnap(harness: Harness): string { return JSON.stringify(harness); }
function fromSnap(data: string): Harness { return JSON.parse(data) as Harness; }

export const useHarnessStore = create<HarnessState>((set, get) => {
  const initial = createHarness('Untitled Harness', 'User');
  const initialBuilder = new HarnessBuilder(initial);

  const pushUndo = () => {
    const { harness, undoStack, _isDragging } = get();
    if (_isDragging) return;
    set({ undoStack: [...undoStack, toSnap(harness)], redoStack: [], harnessModified: true });
  };

  const rebuild = (h: Harness) => routerEngine.routeAll(h.connections, h.nodes);

  return {
    harness: initial,
    builder: initialBuilder,
    routes: [],
    issues: [],
    selectedNodeId: null,
    selectedConnectionId: null,
    selectedNodeIds: new Set(),
    tool: 'select',
    boxSelectStart: null,
    boxSelectEnd: null,
    boxSelectDirection: null,
    rightPanel: null,
    connectingFrom: null,
    selectedWireGauge: 22,
    selectedWireColor: '#2563eb',
    selectedWireSignal: '',
    harnessModified: false,
    undoStack: [],
    redoStack: [],
    editingSignalsNodeId: null,
    contextMenu: null,
    collapsedNodes: new Set(),
    selectedPinId: null,
    _isDragging: false,

    newHarness: (name, author) => {
      const h = createHarness(name, author);
      set({
        harness: h, builder: new HarnessBuilder(h), routes: [], issues: [],
        selectedNodeId: null, selectedConnectionId: null, selectedNodeIds: new Set(),
        connectingFrom: null, harnessModified: false, undoStack: [], redoStack: [],
        editingSignalsNodeId: null, contextMenu: null, collapsedNodes: new Set(),
      });
    },

    loadHarness: (harness) => {
      const b = new HarnessBuilder(harness);
      set({
        harness, builder: b, routes: rebuild(harness), issues: [],
        selectedNodeId: null, selectedConnectionId: null, selectedNodeIds: new Set(),
        connectingFrom: null, harnessModified: false, undoStack: [], redoStack: [],
        editingSignalsNodeId: null, contextMenu: null, collapsedNodes: new Set(),
      });
    },

    placeComponent: (component, pos) => {
      pushUndo();
      const { builder } = get();
      builder.placeComponent(component, pos);
      set({ harness: { ...builder.getHarness() } });
    },

    removeNode: (nodeId) => {
      pushUndo();
      const { builder } = get();
      builder.removeNode(nodeId);
      const h = builder.getHarness();
      set({ harness: { ...h }, routes: rebuild(h), selectedNodeId: null, selectedNodeIds: new Set() });
    },

    moveNode: (nodeId, pos) => {
      const { builder } = get();
      builder.moveNode(nodeId, pos);
      const h = builder.getHarness();
      // Spread nodes array so React sees a new reference and re-renders wires
      set({ harness: { ...h, nodes: [...h.nodes] }, routes: rebuild(h) });
    },

    moveNodes: (moves) => {
      const { builder } = get();
      for (const m of moves) builder.moveNode(m.nodeId, m.pos);
      const h = builder.getHarness();
      set({ harness: { ...h, nodes: [...h.nodes] }, routes: rebuild(h) });
    },

    startDrag: () => {
      const { harness, undoStack } = get();
      set({ _isDragging: true, undoStack: [...undoStack, toSnap(harness)], redoStack: [], harnessModified: true });
    },

    endDrag: () => set({ _isDragging: false }),

    rotateNode: (nodeId, degrees) => {
      pushUndo();
      const { builder } = get();
      builder.rotateNode(nodeId, degrees);
      set({ harness: { ...builder.getHarness() } });
    },

    renameNode: (nodeId, label) => {
      pushUndo();
      const { builder } = get();
      builder.renameNode(nodeId, label);
      set({ harness: { ...builder.getHarness() } });
    },

    connect: (from, to, signal) => {
      pushUndo();
      const { builder } = get();
      builder.connect(from, to, signal);
      const h = builder.getHarness();
      set({ harness: { ...h }, routes: rebuild(h) });
    },

    disconnect: (connectionId) => {
      pushUndo();
      const { builder } = get();
      builder.disconnect(connectionId);
      const h = builder.getHarness();
      set({ harness: { ...h }, routes: rebuild(h), selectedConnectionId: null });
    },

    addWire: (wire) => {
      pushUndo();
      const { builder } = get();
      builder.addWire(wire);
      set({ harness: { ...builder.getHarness() }, harnessModified: true });
    },

    addCable: (cable) => {
      pushUndo();
      const { builder } = get();
      builder.addCable(cable);
      set({ harness: { ...builder.getHarness() }, harnessModified: true });
    },

    removeCable: (cableId) => {
      pushUndo();
      const { harness } = get();
      const updated: Harness = {
        ...harness,
        cables: harness.cables.filter(c => c.id !== cableId),
        connections: harness.connections.filter(c => c.cableRef !== cableId),
      };
      const b = new HarnessBuilder(updated);
      set({ harness: updated, builder: b, routes: rebuild(updated), harnessModified: true });
    },

    selectNode: (nodeId) => set({
      selectedNodeId: nodeId, selectedConnectionId: null,
      selectedNodeIds: nodeId ? new Set([nodeId]) : new Set(),
    }),

    selectConnection: (connectionId) => set({
      selectedConnectionId: connectionId, selectedNodeId: null, selectedNodeIds: new Set(),
    }),

    toggleSelectNode: (nodeId) => {
      const s = new Set(get().selectedNodeIds);
      if (s.has(nodeId)) s.delete(nodeId); else s.add(nodeId);
      set({ selectedNodeIds: s, selectedNodeId: s.size === 1 ? [...s][0] : null, selectedConnectionId: null });
    },

    selectNodes: (nodeIds) => set({
      selectedNodeIds: new Set(nodeIds), selectedNodeId: nodeIds.length === 1 ? nodeIds[0] : null, selectedConnectionId: null,
    }),

    clearSelection: () => set({ selectedNodeId: null, selectedConnectionId: null, selectedNodeIds: new Set() }),

    setTool: (tool) => set({ tool }),

    saveRevision: (message) => {
      const { builder } = get();
      builder.saveRevision(message);
      set({ harness: { ...builder.getHarness() }, harnessModified: false });
    },

    validate: () => set({ issues: validatorEngine.validate(get().harness) }),

    reroute: () => set({ routes: rebuild(get().harness) }),

    setRightPanel: (panel) => set({ rightPanel: panel }),

    startConnection: (from) => set({ connectingFrom: from, tool: 'connect' }),

    completeConnection: (to) => {
      const { connectingFrom, selectedWireSignal, selectedWireColor } = get();
      if (!connectingFrom) return;
      const signal = selectedWireSignal.trim() || 'Wire';
      get().connect(connectingFrom, to, signal);
      const { harness } = get();
      const lastConn = harness.connections[harness.connections.length - 1];
      if (lastConn) lastConn.colorCode = selectedWireColor;
      set({ connectingFrom: null, tool: 'select', harness: { ...harness } });
    },

    cancelConnection: () => set({ connectingFrom: null, tool: 'select' }),
    setSelectedWireGauge: (gauge) => set({ selectedWireGauge: gauge }),
    setSelectedWireColor: (color) => set({ selectedWireColor: color }),
    setSelectedWireSignal: (signal) => set({ selectedWireSignal: signal }),
    updateHarnessInfo: (name, description) => set({ harness: { ...get().harness, name, description }, harnessModified: true }),

    toggleGrid: () => { const c = get().harness.canvas; set({ harness: { ...get().harness, canvas: { ...c, showGrid: !c.showGrid } } }); },
    setGridSize: (size) => set({ harness: { ...get().harness, canvas: { ...get().harness.canvas, gridSize: size } } }),
    toggleSnapToGrid: () => { const c = get().harness.canvas; set({ harness: { ...get().harness, canvas: { ...c, snapToGrid: !c.snapToGrid } } }); },
    toggleLabels: () => { const c = get().harness.canvas; set({ harness: { ...get().harness, canvas: { ...c, showLabels: !c.showLabels } } }); },
    togglePinNumbers: () => { const c = get().harness.canvas; set({ harness: { ...get().harness, canvas: { ...c, showPinNumbers: !c.showPinNumbers } } }); },
    toggleWireInfo: () => { const c = get().harness.canvas; set({ harness: { ...get().harness, canvas: { ...c, showWireInfo: !c.showWireInfo } } }); },
    setWireUnits: (units) => set({ harness: { ...get().harness, canvas: { ...get().harness.canvas, wireUnits: units } } }),
    setLengthUnits: (units) => set({ harness: { ...get().harness, canvas: { ...get().harness.canvas, lengthUnits: units } } }),

    undo: () => {
      const { undoStack, harness } = get();
      if (undoStack.length === 0) return;
      const prev = undoStack[undoStack.length - 1];
      const newUndo = undoStack.slice(0, -1);
      const restored = fromSnap(prev);
      set({
        undoStack: newUndo, redoStack: [...get().redoStack, toSnap(harness)],
        harness: restored, builder: new HarnessBuilder(restored), routes: rebuild(restored),
        harnessModified: newUndo.length > 0,
      });
    },

    redo: () => {
      const { redoStack, harness } = get();
      if (redoStack.length === 0) return;
      const next = redoStack[redoStack.length - 1];
      const newRedo = redoStack.slice(0, -1);
      const restored = fromSnap(next);
      set({
        redoStack: newRedo, undoStack: [...get().undoStack, toSnap(harness)],
        harness: restored, builder: new HarnessBuilder(restored), routes: rebuild(restored),
        harnessModified: true,
      });
    },

    fitToView: () => {
      const c = get().harness.canvas;
      set({ harness: { ...get().harness, canvas: { ...c, zoom: 1, panX: 0, panY: 0 } } });
    },

    bulkConnect: (componentA, componentB, pattern) => {
      const { builder } = get();
      const nodeA = builder.findNode(componentA);
      const nodeB = builder.findNode(componentB);
      if (!nodeA || !nodeB) return;
      pushUndo();
      const pinsA = nodeA.component.pins;
      const pinsB = nodeB.component.pins;
      const count = Math.min(pinsA.length, pinsB.length);
      for (let i = 0; i < count; i++) {
        const bIdx = pattern === 'crossover' ? count - 1 - i : i;
        builder.connect(
          { componentId: componentA, pinId: pinsA[i].id },
          { componentId: componentB, pinId: pinsB[bIdx].id },
          `${nodeA.label}-${nodeB.label}:${i + 1}`,
        );
      }
      const h = builder.getHarness();
      set({ harness: { ...h }, routes: rebuild(h) });
    },

    deleteSelected: () => {
      const { selectedNodeIds, selectedConnectionId, builder } = get();
      if (selectedNodeIds.size === 0 && !selectedConnectionId) return;
      pushUndo();
      if (selectedConnectionId) builder.disconnect(selectedConnectionId);
      for (const nid of selectedNodeIds) {
        try { builder.removeNode(nid); } catch { /* already removed */ }
      }
      const h = builder.getHarness();
      set({ harness: { ...h }, routes: rebuild(h), selectedNodeId: null, selectedConnectionId: null, selectedNodeIds: new Set() });
    },

    startBoxSelect: (pos) => set({ boxSelectStart: pos, boxSelectEnd: pos, boxSelectDirection: null }),

    updateBoxSelect: (pos) => {
      const { boxSelectStart } = get();
      if (!boxSelectStart) return;
      set({ boxSelectEnd: pos, boxSelectDirection: pos.x >= boxSelectStart.x ? 'right' : 'left' });
    },

    endBoxSelect: (additive) => {
      const { boxSelectStart: s, boxSelectEnd: e, boxSelectDirection: dir, harness, selectedNodeIds } = get();
      if (!s || !e) { set({ boxSelectStart: null, boxSelectEnd: null, boxSelectDirection: null }); return; }
      const x1 = Math.min(s.x, e.x), y1 = Math.min(s.y, e.y);
      const x2 = Math.max(s.x, e.x), y2 = Math.max(s.y, e.y);
      const BW = 180, HH = 32 + 16, PH = 20; // Updated to match new ConnectorNode dimensions
      const matched: string[] = [];
      for (const node of harness.nodes) {
        const nh = HH + node.component.pins.length * PH;
        const nx1 = node.position.x, ny1 = node.position.y;
        const nx2 = nx1 + BW, ny2 = ny1 + nh;
        if (dir === 'right') {
          if (nx1 >= x1 && ny1 >= y1 && nx2 <= x2 && ny2 <= y2) matched.push(node.id);
        } else {
          if (nx1 <= x2 && nx2 >= x1 && ny1 <= y2 && ny2 >= y1) matched.push(node.id);
        }
      }
      const newSet = additive ? new Set([...selectedNodeIds, ...matched]) : new Set(matched);
      set({
        selectedNodeIds: newSet, selectedNodeId: newSet.size === 1 ? [...newSet][0] : null,
        boxSelectStart: null, boxSelectEnd: null, boxSelectDirection: null,
      });
    },

    cancelBoxSelect: () => set({ boxSelectStart: null, boxSelectEnd: null, boxSelectDirection: null }),

    openSignalEditor: (nodeId) => set({ editingSignalsNodeId: nodeId }),
    closeSignalEditor: () => set({ editingSignalsNodeId: null }),

    updateSignals: (nodeId, edits) => {
      pushUndo();
      const { harness } = get();
      const updated = { ...harness, connections: harness.connections.map(c => {
        for (const ed of edits) {
          if ((c.from.componentId === nodeId && c.from.pinId === ed.pinId) ||
              (c.to.componentId === nodeId && c.to.pinId === ed.pinId)) {
            return { ...c, signalLabel: ed.label };
          }
        }
        return c;
      })};
      const b = new HarnessBuilder(updated);
      set({ harness: updated, builder: b, routes: rebuild(updated) });
    },

    moveConnection: (connectionId, newEndpoint, side) => {
      pushUndo();
      const { harness } = get();
      const updated = { ...harness, connections: harness.connections.map(c =>
        c.id === connectionId ? { ...c, [side]: newEndpoint } : c
      )};
      const b = new HarnessBuilder(updated);
      set({ harness: updated, builder: b, routes: rebuild(updated) });
    },

    swapConnections: (connIdA, connIdB, side) => {
      pushUndo();
      const { harness } = get();
      const a = harness.connections.find(c => c.id === connIdA);
      const bConn = harness.connections.find(c => c.id === connIdB);
      if (!a || !bConn) return;
      const updated = { ...harness, connections: harness.connections.map(c => {
        if (c.id === connIdA) return { ...c, [side]: bConn[side] };
        if (c.id === connIdB) return { ...c, [side]: a[side] };
        return c;
      })};
      set({ harness: updated, builder: new HarnessBuilder(updated), routes: rebuild(updated) });
    },

    updateConnectionProps: (connectionId, props) => {
      pushUndo();
      const { harness } = get();
      const updated = { ...harness, connections: harness.connections.map(c =>
        c.id === connectionId ? { ...c, ...props } : c
      )};
      set({ harness: updated, routes: rebuild(updated) });
    },

    openContextMenu: (pos, nodeId, connectionId) => set({ contextMenu: { x: pos.x, y: pos.y, nodeId, connectionId } }),
    closeContextMenu: () => set({ contextMenu: null }),

    toggleCollapseNode: (nodeId) => {
      const s = new Set(get().collapsedNodes);
      if (s.has(nodeId)) s.delete(nodeId); else s.add(nodeId);
      set({ collapsedNodes: s });
    },
    collapseAll: () => set({ collapsedNodes: new Set(get().harness.nodes.map(n => n.id)) }),
    expandAll: () => set({ collapsedNodes: new Set() }),

    selectPin: (nodeId, pinId) => set({ selectedPinId: { nodeId, pinId } }),
    clearPinSelection: () => set({ selectedPinId: null }),

    assignCableToConnection: (connectionId, cableId, conductorIndex) => {
      pushUndo();
      const { harness } = get();
      const updated = {
        ...harness,
        connections: harness.connections.map(c =>
          c.id === connectionId ? { ...c, cableRef: cableId, conductorIndex } : c
        ),
      };
      set({ harness: updated, routes: rebuild(updated) });
    },

    unassignCableFromConnection: (connectionId) => {
      pushUndo();
      const { harness } = get();
      const updated = {
        ...harness,
        connections: harness.connections.map(c =>
          c.id === connectionId ? { ...c, cableRef: undefined, conductorIndex: undefined } : c
        ),
      };
      set({ harness: updated, routes: rebuild(updated) });
    },
  };
});
