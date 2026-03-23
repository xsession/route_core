import type { Pin } from './pin.js';

// Component: a connector, device, or terminal block
export interface Component {
  id: string;
  name: string;
  manufacturer: string;
  partNumber: string;
  category: ComponentCategory;
  type: ComponentType;
  pins: Pin[];
  footprint: Footprint;
  description: string;
  datasheetUrl?: string;
  tags: string[];
  custom: boolean; // user-created vs from library
}

export type ComponentCategory =
  | 'connector'
  | 'terminal'
  | 'motor'
  | 'relay'
  | 'contactor'
  | 'power_supply'
  | 'sensor'
  | 'switch'
  | 'fuse'
  | 'circuit_breaker'
  | 'controller'
  | 'device';

export type ComponentType =
  | 'inline'
  | 'panel_mount'
  | 'pcb_mount'
  | 'din_rail'
  | 'free_hanging'
  | 'bulkhead';

export interface Footprint {
  width: number;   // mm
  height: number;  // mm
  pinLayout: 'single_row' | 'dual_row' | 'grid' | 'circular' | 'custom';
  mountingHoles?: { x: number; y: number; diameter: number }[];
}
