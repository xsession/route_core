/** Shared HMI data types — used across all hmi/* modules */

/** One waveform channel. Data is a flat packed Float64Array: [x0,y0, x1,y1, …] */
export interface WaveformSeries {
  label: string;
  /** Flat interleaved [x0,y0, x1,y1, …] */
  data: Float64Array;
  unit?: string;
  /** CSS color string; defaults to --hmi-trace-N */
  color?: string;
  alarmHigh?: number;
  alarmLow?: number;
}

export type AlarmSeverity = 'none' | 'info' | 'warning' | 'critical';

export interface AlarmEvent {
  id: string;
  severity: AlarmSeverity;
  /** Instrument / channel tag, e.g. "PT-101" */
  tag: string;
  message: string;
  timestamp: number;
  acknowledged: boolean;
}

export interface KpiMetric {
  label: string;
  value: number | string;
  unit?: string;
  severity: AlarmSeverity;
  trend?: 'up' | 'down' | 'stable';
}

export interface EquipmentStatus {
  id: string;
  label: string;
  status: 'running' | 'stopped' | 'fault' | 'maintenance';
  value?: string;
  unit?: string;
}
