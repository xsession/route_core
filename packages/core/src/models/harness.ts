import type { Component } from './component.js';
import type { Cable } from './cable.js';
import type { Wire } from './wire.js';
import type { Connection, SplicePoint } from './connection.js';

// Harness: the top-level design document
export interface Harness {
  id: string;
  name: string;
  description: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  author: string;

  // Placed components on the canvas with positions
  nodes: HarnessNode[];

  // Wire/cable connections between component pins
  connections: Connection[];

  // Splice points
  splices: SplicePoint[];

  // Cables used in this harness
  cables: Cable[];

  // Individual wires used (not part of a cable)
  wires: Wire[];

  // Canvas metadata
  canvas: CanvasState;

  // Revision history
  revisions: Revision[];
}

export interface HarnessNode {
  id: string;
  componentId: string;    // reference to component definition
  component: Component;   // embedded snapshot
  position: { x: number; y: number };
  rotation: number;       // degrees
  label: string;          // instance label (e.g. "J1", "P2")
  locked: boolean;
}

export interface CanvasState {
  width: number;
  height: number;
  zoom: number;
  panX: number;
  panY: number;
  gridSize: number;
  snapToGrid: boolean;
  showLabels: boolean;
  showPinNumbers: boolean;
}

export interface Revision {
  version: number;
  timestamp: string;
  author: string;
  message: string;
  snapshot: string; // JSON serialized harness state
}

export function createDefaultCanvas(): CanvasState {
  return {
    width: 2000,
    height: 1500,
    zoom: 1,
    panX: 0,
    panY: 0,
    gridSize: 10,
    snapToGrid: true,
    showLabels: true,
    showPinNumbers: true,
  };
}

export function createHarness(name: string, author: string): Harness {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name,
    description: '',
    version: 1,
    createdAt: now,
    updatedAt: now,
    author,
    nodes: [],
    connections: [],
    splices: [],
    cables: [],
    wires: [],
    canvas: createDefaultCanvas(),
    revisions: [],
  };
}

export function generateId(): string {
  return crypto.randomUUID();
}
