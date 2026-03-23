import { describe, it, expect } from 'vitest';
import { AWG_SPECS } from '../wire.js';

describe('AWG_SPECS', () => {
  it('contains standard gauge values', () => {
    const expectedGauges = [30, 28, 26, 24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 4, 2];
    for (const gauge of expectedGauges) {
      expect(AWG_SPECS[gauge]).toBeDefined();
    }
  });

  it('each spec has diameter_mm, resistance_ohm_per_m, and currentRating', () => {
    for (const [gauge, spec] of Object.entries(AWG_SPECS)) {
      expect(spec.diameter_mm).toBeGreaterThan(0);
      expect(spec.resistance_ohm_per_m).toBeGreaterThan(0);
      expect(spec.currentRating).toBeGreaterThan(0);
    }
  });

  it('diameter increases as gauge decreases (larger wire)', () => {
    const gauges = [30, 28, 26, 24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 4, 2];
    for (let i = 1; i < gauges.length; i++) {
      expect(AWG_SPECS[gauges[i]].diameter_mm).toBeGreaterThan(
        AWG_SPECS[gauges[i - 1]].diameter_mm
      );
    }
  });

  it('resistance decreases as gauge decreases (thicker wire)', () => {
    const gauges = [30, 28, 26, 24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 4, 2];
    for (let i = 1; i < gauges.length; i++) {
      expect(AWG_SPECS[gauges[i]].resistance_ohm_per_m).toBeLessThan(
        AWG_SPECS[gauges[i - 1]].resistance_ohm_per_m
      );
    }
  });

  it('current rating increases as gauge decreases', () => {
    const gauges = [30, 28, 26, 24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 4, 2];
    for (let i = 1; i < gauges.length; i++) {
      expect(AWG_SPECS[gauges[i]].currentRating).toBeGreaterThan(
        AWG_SPECS[gauges[i - 1]].currentRating
      );
    }
  });

  it('has reasonable values for common gauges', () => {
    // 22 AWG is very common in electronics
    expect(AWG_SPECS[22].diameter_mm).toBeCloseTo(0.644, 2);
    expect(AWG_SPECS[22].currentRating).toBe(3.0);

    // 14 AWG common for household wiring
    expect(AWG_SPECS[14].currentRating).toBe(15.0);
  });
});
