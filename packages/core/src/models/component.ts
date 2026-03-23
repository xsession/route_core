import type { Pin } from './pin.js';

// Component: a connector, device, or terminal block
export interface Component {
  id: string;
  name: string;
  manufacturer: string;
  partNumber: string;
  category: ComponentCategory;
  type: ComponentType;
  shape: ComponentShape;
  pins: Pin[];
  footprint: Footprint;
  description: string;
  datasheetUrl?: string;
  imageUrl?: string;
  tags: string[];
  custom: boolean; // user-created vs from library
  gender?: 'male' | 'female' | 'hermaphroditic';
  series?: string;
  pitch?: number;          // mm
  fastening?: ComponentFastening;
  termination?: ComponentTermination;
  color?: string;          // housing color
  minAwg?: number;
  maxAwg?: number;
  keyingCode?: string;
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
  | 'device'
  | 'push_button'
  | 'timer'
  | 'fan'
  | 'pcb'
  | 'resistor'
  | 'capacitor'
  | 'diode'
  | 'inductor'
  | 'transformer'
  | 'inverter'
  | 'battery'
  | 'solar_cell'
  | 'splice';

export type ComponentShape =
  | 'rectangular'
  | 'circular'
  | 'usb'
  | 'd_sub'
  | 'ferrule'
  | 'quick_disconnect'
  | 'ring_terminal'
  | 'terminal_block'
  | 'generic';

export type ComponentType =
  | 'inline'
  | 'panel_mount'
  | 'pcb_mount'
  | 'din_rail'
  | 'free_hanging'
  | 'bulkhead';

export type ComponentFastening =
  | 'screw'
  | 'latch'
  | 'push_pull'
  | 'bayonet'
  | 'snap'
  | 'threaded'
  | 'none';

export type ComponentTermination =
  | 'crimp'
  | 'solder'
  | 'idc'
  | 'spring'
  | 'wire_wrap'
  | 'screw'
  | 'push_in';

export interface Footprint {
  width: number;   // mm
  height: number;  // mm
  pinLayout: 'single_row' | 'dual_row' | 'grid' | 'circular' | 'custom';
  mountingHoles?: { x: number; y: number; diameter: number }[];
}

/** Designator prefixes per component category */
export const DESIGNATOR_PREFIX: Record<ComponentCategory, string> = {
  circuit_breaker: 'CB',
  fuse: 'F',
  push_button: 'S',
  switch: 'SW',
  relay: 'K',
  contactor: 'KM',
  timer: 'KT',
  power_supply: 'PS',
  motor: 'M',
  fan: 'FAN',
  pcb: 'PCB',
  resistor: 'R',
  capacitor: 'C',
  diode: 'D',
  inductor: 'L',
  transformer: 'T',
  inverter: 'INV',
  battery: 'BAT',
  solar_cell: 'PV',
  splice: 'SP',
  connector: 'X',
  terminal: 'TB',
  sensor: 'SE',
  controller: 'PLC',
  device: 'U',
};
