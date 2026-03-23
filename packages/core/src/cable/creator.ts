import type { Cable, CableConductor, JacketSpec, JacketMaterial, ShieldingSpec } from '../models/cable.js';
import type { Wire, WireMaterial, InsulationType } from '../models/wire.js';
import { generateId } from '../models/harness.js';
import { AWG_SPECS } from '../models/wire.js';

export interface CableSpec {
  name: string;
  conductorCount: number;
  gauge: number;         // AWG
  wireMaterial?: WireMaterial;
  wireInsulation?: InsulationType;
  wireColors?: string[];
  jacketMaterial?: JacketMaterial;
  jacketColor?: string;
  shielded?: boolean;
  shieldType?: ShieldingSpec['type'];
  description?: string;
  manufacturer?: string;
  partNumber?: string;
}

// Standard color sequences for multi-conductor cables
const COLOR_SEQUENCES: Record<string, string[]> = {
  standard: ['black', 'red', 'white', 'green', 'orange', 'blue', 'yellow', 'brown', 'violet', 'gray', 'pink', 'tan'],
  iec: ['brown', 'blue', 'green/yellow', 'black', 'gray', 'white', 'red', 'orange', 'violet', 'pink', 'tan', 'turquoise'],
  power_dc: ['red', 'black'],
  power_ac: ['black', 'white', 'green'],
  ethernet: ['white/orange', 'orange', 'white/green', 'blue', 'white/blue', 'green', 'white/brown', 'brown'],
};

/**
 * CableCreator: builds multi-conductor cable definitions from specs
 * or pre-defined configurations.
 */
export class CableCreator {
  /**
   * Create a cable from a specification.
   */
  createCable(spec: CableSpec): Cable {
    const awg = AWG_SPECS[spec.gauge];
    const colors = spec.wireColors ?? this.autoColors(spec.conductorCount);

    const conductors: CableConductor[] = [];
    for (let i = 0; i < spec.conductorCount; i++) {
      const wire: Wire = {
        id: generateId(),
        gauge: spec.gauge,
        color: colors[i % colors.length],
        material: spec.wireMaterial ?? 'copper',
        insulationType: spec.wireInsulation ?? 'PVC',
        currentRating: awg?.currentRating ?? 1,
        voltageRating: 300,
        temperatureRating: 105,
      };

      conductors.push({ position: i, wire });
    }

    const jacket: JacketSpec = {
      material: spec.jacketMaterial ?? 'PVC',
      color: spec.jacketColor ?? 'black',
      outerDiameter: this.estimateJacketDiameter(spec.conductorCount, spec.gauge),
    };

    let shielding: ShieldingSpec | undefined;
    if (spec.shielded) {
      shielding = {
        type: spec.shieldType ?? 'braid',
        coverage: 85,
        material: 'tinned copper',
        drainWire: true,
      };
    }

    return {
      id: generateId(),
      name: spec.name,
      partNumber: spec.partNumber,
      manufacturer: spec.manufacturer,
      conductors,
      jacket,
      shielding,
      outerDiameter: jacket.outerDiameter + (shielding ? 1.5 : 0),
      bendRadius: this.estimateBendRadius(jacket.outerDiameter),
      weightPerMeter: this.estimateWeight(spec.conductorCount, spec.gauge),
      temperatureRange: { min: -20, max: 105 },
      description: spec.description ?? '',
      custom: true,
    };
  }

  /**
   * Create a simple 2-wire power cable.
   */
  createPowerCable(gauge: number, name?: string): Cable {
    return this.createCable({
      name: name ?? `Power Cable ${gauge}AWG`,
      conductorCount: 2,
      gauge,
      wireColors: COLOR_SEQUENCES.power_dc,
      description: 'DC power cable',
    });
  }

  /**
   * Create a shielded signal cable.
   */
  createSignalCable(
    conductorCount: number,
    gauge: number,
    name?: string
  ): Cable {
    return this.createCable({
      name: name ?? `Signal Cable ${conductorCount}C ${gauge}AWG`,
      conductorCount,
      gauge,
      shielded: true,
      description: 'Shielded signal cable',
    });
  }

  /**
   * Create an Ethernet/data cable (8 conductors).
   */
  createEthernetCable(name?: string): Cable {
    return this.createCable({
      name: name ?? 'Ethernet Cat5e',
      conductorCount: 8,
      gauge: 24,
      wireColors: COLOR_SEQUENCES.ethernet,
      shielded: false,
      description: 'Category 5e Ethernet cable',
    });
  }

  /**
   * Get available color sequence names.
   */
  getColorSequences(): string[] {
    return Object.keys(COLOR_SEQUENCES);
  }

  /**
   * Get a specific color sequence.
   */
  getColorSequence(name: string): string[] {
    return COLOR_SEQUENCES[name] ?? COLOR_SEQUENCES.standard;
  }

  private autoColors(count: number): string[] {
    const seq = COLOR_SEQUENCES.standard;
    return Array.from({ length: count }, (_, i) => seq[i % seq.length]);
  }

  private estimateJacketDiameter(conductors: number, gauge: number): number {
    const awg = AWG_SPECS[gauge];
    const wireDia = awg?.diameter_mm ?? 0.5;
    // Rough estimation: pack factor * wire diameter * sqrt(conductor count)
    return Math.round((wireDia * 2.5 * Math.sqrt(conductors) + 2) * 10) / 10;
  }

  private estimateBendRadius(outerDiameter: number): number {
    // Rule of thumb: 4x outer diameter for flexible cables
    return Math.round(outerDiameter * 4);
  }

  private estimateWeight(conductors: number, gauge: number): number {
    const awg = AWG_SPECS[gauge];
    const wireDia = awg?.diameter_mm ?? 0.5;
    // Copper density ~8.96 g/cm³, approximate cross-section, per meter
    const crossSection = Math.PI * (wireDia / 2) ** 2; // mm²
    const copperWeight = crossSection * 8.96 * 0.001 * 1000; // g/m per conductor
    return Math.round(copperWeight * conductors * 1.4); // 1.4x for insulation+jacket
  }
}
