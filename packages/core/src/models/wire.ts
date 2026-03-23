// Wire: a single conductor
export interface Wire {
  id: string;
  gauge: number;         // AWG
  color: string;         // color code
  material: WireMaterial;
  insulationType: InsulationType;
  currentRating: number; // amps
  voltageRating: number; // volts
  temperatureRating: number; // °C
  strandCount?: number;
  outerDiameter?: number; // mm
}

export type WireMaterial = 'copper' | 'tinned_copper' | 'aluminum' | 'silver_plated';

export type InsulationType =
  | 'PVC'
  | 'PTFE'
  | 'silicone'
  | 'XLPE'
  | 'rubber'
  | 'kapton'
  | 'tefzel';

// Standard AWG specifications
export const AWG_SPECS: Record<number, { diameter_mm: number; resistance_ohm_per_m: number; currentRating: number }> = {
  30: { diameter_mm: 0.255, resistance_ohm_per_m: 0.3385, currentRating: 0.52 },
  28: { diameter_mm: 0.321, resistance_ohm_per_m: 0.2129, currentRating: 0.83 },
  26: { diameter_mm: 0.405, resistance_ohm_per_m: 0.1339, currentRating: 1.3 },
  24: { diameter_mm: 0.511, resistance_ohm_per_m: 0.0842, currentRating: 2.1 },
  22: { diameter_mm: 0.644, resistance_ohm_per_m: 0.0530, currentRating: 3.0 },
  20: { diameter_mm: 0.812, resistance_ohm_per_m: 0.0333, currentRating: 5.0 },
  18: { diameter_mm: 1.024, resistance_ohm_per_m: 0.0210, currentRating: 7.0 },
  16: { diameter_mm: 1.291, resistance_ohm_per_m: 0.0132, currentRating: 10.0 },
  14: { diameter_mm: 1.628, resistance_ohm_per_m: 0.00829, currentRating: 15.0 },
  12: { diameter_mm: 2.053, resistance_ohm_per_m: 0.00521, currentRating: 20.0 },
  10: { diameter_mm: 2.588, resistance_ohm_per_m: 0.00328, currentRating: 30.0 },
  8:  { diameter_mm: 3.264, resistance_ohm_per_m: 0.00206, currentRating: 40.0 },
  6:  { diameter_mm: 4.115, resistance_ohm_per_m: 0.00130, currentRating: 55.0 },
  4:  { diameter_mm: 5.189, resistance_ohm_per_m: 0.000815, currentRating: 70.0 },
  2:  { diameter_mm: 6.544, resistance_ohm_per_m: 0.000513, currentRating: 95.0 },
};
