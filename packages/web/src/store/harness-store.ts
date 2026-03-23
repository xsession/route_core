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

interface HarnessState {
  harness: Harness;
  builder: HarnessBuilder;
  routes: RoutedWire[];
  issues: ValidationIssue[];
  selectedNodeId: string | null;
  selectedConnectionId: string | null;
  tool: 'select' | 'connect' | 'pan';

  // Actions
  newHarness: (name: string, author: string) => void;
  loadHarness: (harness: Harness) => void;
  placeComponent: (component: Component, pos: { x: number; y: number }) => void;
  removeNode: (nodeId: string) => void;
  moveNode: (nodeId: string, pos: { x: number; y: number }) => void;
  rotateNode: (nodeId: string, degrees: number) => void;
  renameNode: (nodeId: string, label: string) => void;
  connect: (from: ConnectionEndpoint, to: ConnectionEndpoint, signal: string) => void;
  disconnect: (connectionId: string) => void;
  addWire: (wire: Wire) => void;
  addCable: (cable: Cable) => void;
  selectNode: (nodeId: string | null) => void;
  selectConnection: (connectionId: string | null) => void;
  setTool: (tool: HarnessState['tool']) => void;
  saveRevision: (message: string) => void;
  validate: () => void;
  reroute: () => void;
}

const router = new WireRouter();
const validator = new HarnessValidator();

export const useHarnessStore = create<HarnessState>((set, get) => {
  const initial = createHarness('Untitled Harness', 'User');
  const initialBuilder = new HarnessBuilder(initial);

  return {
    harness: initial,
    builder: initialBuilder,
    routes: [],
    issues: [],
    selectedNodeId: null,
    selectedConnectionId: null,
    tool: 'select',

    newHarness: (name, author) => {
      const h = createHarness(name, author);
      set({ harness: h, builder: new HarnessBuilder(h), routes: [], issues: [], selectedNodeId: null });
    },

    loadHarness: (harness) => {
      const b = new HarnessBuilder(harness);
      const routes = router.routeAll(harness.connections, harness.nodes);
      set({ harness, builder: b, routes, issues: [], selectedNodeId: null });
    },

    placeComponent: (component, pos) => {
      const { builder } = get();
      builder.placeComponent(component, pos);
      const h = builder.getHarness();
      set({ harness: { ...h } });
    },

    removeNode: (nodeId) => {
      const { builder } = get();
      builder.removeNode(nodeId);
      const h = builder.getHarness();
      const routes = router.routeAll(h.connections, h.nodes);
      set({ harness: { ...h }, routes, selectedNodeId: null });
    },

    moveNode: (nodeId, pos) => {
      const { builder } = get();
      builder.moveNode(nodeId, pos);
      const h = builder.getHarness();
      const routes = router.routeAll(h.connections, h.nodes);
      set({ harness: { ...h }, routes });
    },

    rotateNode: (nodeId, degrees) => {
      const { builder } = get();
      builder.rotateNode(nodeId, degrees);
      set({ harness: { ...builder.getHarness() } });
    },

    renameNode: (nodeId, label) => {
      const { builder } = get();
      builder.renameNode(nodeId, label);
      set({ harness: { ...builder.getHarness() } });
    },

    connect: (from, to, signal) => {
      const { builder } = get();
      builder.connect(from, to, signal);
      const h = builder.getHarness();
      const routes = router.routeAll(h.connections, h.nodes);
      set({ harness: { ...h }, routes });
    },

    disconnect: (connectionId) => {
      const { builder } = get();
      builder.disconnect(connectionId);
      const h = builder.getHarness();
      const routes = router.routeAll(h.connections, h.nodes);
      set({ harness: { ...h }, routes, selectedConnectionId: null });
    },

    addWire: (wire) => {
      const { builder } = get();
      builder.addWire(wire);
      set({ harness: { ...builder.getHarness() } });
    },

    addCable: (cable) => {
      const { builder } = get();
      builder.addCable(cable);
      set({ harness: { ...builder.getHarness() } });
    },

    selectNode: (nodeId) => set({ selectedNodeId: nodeId, selectedConnectionId: null }),
    selectConnection: (connectionId) => set({ selectedConnectionId: connectionId, selectedNodeId: null }),
    setTool: (tool) => set({ tool }),

    saveRevision: (message) => {
      const { builder } = get();
      builder.saveRevision(message);
      set({ harness: { ...builder.getHarness() } });
    },

    validate: () => {
      const { harness } = get();
      const issues = validator.validate(harness);
      set({ issues });
    },

    reroute: () => {
      const { harness } = get();
      const routes = router.routeAll(harness.connections, harness.nodes);
      set({ routes });
    },
  };
});
