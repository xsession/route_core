import { describe, it, expect } from 'vitest';
import { CableCreator } from '../creator.js';

describe('CableCreator', () => {
  const creator = new CableCreator();

  describe('createCable', () => {
    it('creates a cable with the specified number of conductors', () => {
      const cable = creator.createCable({
        name: 'Test Cable',
        conductorCount: 4,
        gauge: 22,
      });

      expect(cable.name).toBe('Test Cable');
      expect(cable.conductors.length).toBe(4);
      expect(cable.custom).toBe(true);
    });

    it('assigns sequential positions to conductors', () => {
      const cable = creator.createCable({
        name: 'Seq Cable',
        conductorCount: 3,
        gauge: 24,
      });

      expect(cable.conductors[0].position).toBe(0);
      expect(cable.conductors[1].position).toBe(1);
      expect(cable.conductors[2].position).toBe(2);
    });

    it('uses default wire material and insulation', () => {
      const cable = creator.createCable({
        name: 'Default Cable',
        conductorCount: 2,
        gauge: 22,
      });

      for (const c of cable.conductors) {
        expect(c.wire.material).toBe('copper');
        expect(c.wire.insulationType).toBe('PVC');
      }
    });

    it('respects custom wire material and insulation', () => {
      const cable = creator.createCable({
        name: 'Custom Cable',
        conductorCount: 2,
        gauge: 22,
        wireMaterial: 'tinned_copper',
        wireInsulation: 'PTFE',
      });

      for (const c of cable.conductors) {
        expect(c.wire.material).toBe('tinned_copper');
        expect(c.wire.insulationType).toBe('PTFE');
      }
    });

    it('uses standard color sequence when no colors specified', () => {
      const cable = creator.createCable({
        name: 'Color Cable',
        conductorCount: 3,
        gauge: 22,
      });

      // Standard sequence starts: black, red, white
      expect(cable.conductors[0].wire.color).toBe('black');
      expect(cable.conductors[1].wire.color).toBe('red');
      expect(cable.conductors[2].wire.color).toBe('white');
    });

    it('uses custom wire colors when provided', () => {
      const cable = creator.createCable({
        name: 'Custom Colors',
        conductorCount: 2,
        gauge: 22,
        wireColors: ['orange', 'purple'],
      });

      expect(cable.conductors[0].wire.color).toBe('orange');
      expect(cable.conductors[1].wire.color).toBe('purple');
    });

    it('sets jacket material and color', () => {
      const cable = creator.createCable({
        name: 'Jacket Cable',
        conductorCount: 2,
        gauge: 22,
        jacketMaterial: 'TPE',
        jacketColor: 'gray',
      });

      expect(cable.jacket.material).toBe('TPE');
      expect(cable.jacket.color).toBe('gray');
    });

    it('adds shielding when shielded is true', () => {
      const cable = creator.createCable({
        name: 'Shielded Cable',
        conductorCount: 2,
        gauge: 22,
        shielded: true,
      });

      expect(cable.shielding).toBeDefined();
      expect(cable.shielding!.type).toBe('braid');
      expect(cable.shielding!.drainWire).toBe(true);
    });

    it('does not add shielding by default', () => {
      const cable = creator.createCable({
        name: 'Unshielded Cable',
        conductorCount: 2,
        gauge: 22,
      });

      expect(cable.shielding).toBeUndefined();
    });

    it('calculates bend radius based on outer diameter', () => {
      const cable = creator.createCable({
        name: 'Bend Cable',
        conductorCount: 4,
        gauge: 16,
      });

      expect(cable.bendRadius).toBeGreaterThan(0);
      // Rule of thumb: 4x OD
      expect(cable.bendRadius).toBeCloseTo(cable.jacket.outerDiameter * 4, 0);
    });

    it('includes temperature range', () => {
      const cable = creator.createCable({
        name: 'Temp Cable',
        conductorCount: 2,
        gauge: 22,
      });

      expect(cable.temperatureRange.min).toBe(-20);
      expect(cable.temperatureRange.max).toBe(105);
    });

    it('generates a unique id', () => {
      const a = creator.createCable({ name: 'A', conductorCount: 2, gauge: 22 });
      const b = creator.createCable({ name: 'B', conductorCount: 2, gauge: 22 });
      expect(a.id).not.toBe(b.id);
    });

    it('sets manufacturer and partNumber from spec', () => {
      const cable = creator.createCable({
        name: 'OEM Cable',
        conductorCount: 2,
        gauge: 22,
        manufacturer: 'Belden',
        partNumber: 'BEL-9999',
      });

      expect(cable.manufacturer).toBe('Belden');
      expect(cable.partNumber).toBe('BEL-9999');
    });
  });

  describe('createPowerCable', () => {
    it('creates a 2-conductor cable', () => {
      const cable = creator.createPowerCable(18);
      expect(cable.conductors.length).toBe(2);
    });

    it('uses DC power color sequence (red, black)', () => {
      const cable = creator.createPowerCable(18);
      expect(cable.conductors[0].wire.color).toBe('red');
      expect(cable.conductors[1].wire.color).toBe('black');
    });

    it('uses the specified gauge', () => {
      const cable = creator.createPowerCable(14);
      for (const c of cable.conductors) {
        expect(c.wire.gauge).toBe(14);
      }
    });

    it('accepts an optional name', () => {
      const cable = creator.createPowerCable(18, 'Main Power');
      expect(cable.name).toBe('Main Power');
    });
  });

  describe('createSignalCable', () => {
    it('creates a shielded cable', () => {
      const cable = creator.createSignalCable(4, 24);
      expect(cable.shielding).toBeDefined();
      expect(cable.conductors.length).toBe(4);
    });

    it('uses the specified gauge', () => {
      const cable = creator.createSignalCable(2, 26);
      for (const c of cable.conductors) {
        expect(c.wire.gauge).toBe(26);
      }
    });
  });

  describe('createEthernetCable', () => {
    it('creates an 8-conductor cable', () => {
      const cable = creator.createEthernetCable();
      expect(cable.conductors.length).toBe(8);
    });

    it('uses 24 AWG', () => {
      const cable = creator.createEthernetCable();
      for (const c of cable.conductors) {
        expect(c.wire.gauge).toBe(24);
      }
    });

    it('uses ethernet color sequence', () => {
      const cable = creator.createEthernetCable();
      expect(cable.conductors[0].wire.color).toBe('white/orange');
      expect(cable.conductors[1].wire.color).toBe('orange');
    });
  });

  describe('getColorSequences', () => {
    it('returns available sequence names', () => {
      const seqs = creator.getColorSequences();
      expect(seqs).toContain('standard');
      expect(seqs).toContain('iec');
      expect(seqs).toContain('ethernet');
      expect(seqs).toContain('power_dc');
      expect(seqs).toContain('power_ac');
    });
  });

  describe('getColorSequence', () => {
    it('returns standard sequence by default for unknown name', () => {
      const seq = creator.getColorSequence('nonexistent');
      expect(seq[0]).toBe('black');
    });

    it('returns ethernet sequence', () => {
      const seq = creator.getColorSequence('ethernet');
      expect(seq.length).toBe(8);
      expect(seq[0]).toBe('white/orange');
    });
  });
});
