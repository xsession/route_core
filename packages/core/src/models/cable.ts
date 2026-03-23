import type { Wire } from './wire.js';

// Cable: a multi-conductor assembly with jacket
export interface Cable {
  id: string;
  name: string;
  partNumber?: string;
  manufacturer?: string;
  conductors: CableConductor[];
  jacket: JacketSpec;
  shielding?: ShieldingSpec;
  outerDiameter: number;    // mm
  bendRadius: number;       // mm (minimum)
  weightPerMeter: number;   // grams
  temperatureRange: { min: number; max: number }; // °C
  description: string;
  custom: boolean;
}

export interface CableConductor {
  position: number;  // conductor index in cable
  wire: Wire;
  label?: string;    // signal label assigned by user
}

export interface JacketSpec {
  material: JacketMaterial;
  color: string;
  outerDiameter: number; // mm
  flameRating?: string;
}

export type JacketMaterial =
  | 'PVC'
  | 'TPE'
  | 'PUR'
  | 'silicone'
  | 'rubber'
  | 'neoprene'
  | 'LSZH';   // low smoke zero halogen

export interface ShieldingSpec {
  type: 'braid' | 'foil' | 'spiral' | 'combination';
  coverage: number;       // percent 0-100
  material: string;
  drainWire: boolean;
}
