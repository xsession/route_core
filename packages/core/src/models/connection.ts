// Connection: a wire or cable link between two pins
export interface Connection {
  id: string;
  from: ConnectionEndpoint;
  to: ConnectionEndpoint;
  wireRef?: string;     // wire ID if individual wire
  cableRef?: string;    // cable ID if part of a cable
  conductorIndex?: number; // which conductor in the cable
  signalLabel: string;
  colorCode?: string;
  length?: number;      // mm, user-specified or calculated
}

export interface ConnectionEndpoint {
  componentId: string;
  pinId: string;
}

// A splice point where multiple wires join
export interface SplicePoint {
  id: string;
  position: { x: number; y: number };
  connectionIds: string[];
  method: 'solder' | 'crimp' | 'butt_splice' | 'wire_nut' | 'terminal_block';
  label: string;
}
