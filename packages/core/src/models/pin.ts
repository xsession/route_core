// Pin: a single connection point on a component
export interface Pin {
  id: string;
  label: string;
  position: { x: number; y: number };
  direction: 'left' | 'right' | 'top' | 'bottom';
  signalType: PinSignalType;
  currentRating?: number;   // amps
  voltageRating?: number;   // volts
  gender: 'male' | 'female' | 'neutral';
}

export type PinSignalType =
  | 'power'
  | 'ground'
  | 'signal'
  | 'data'
  | 'analog'
  | 'digital'
  | 'coax'
  | 'shielded'
  | 'nc';        // no-connect
