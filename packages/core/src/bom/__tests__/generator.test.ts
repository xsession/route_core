import { describe, it, expect, beforeEach } from 'vitest';
import { BomGenerator, type BomSummary } from '../generator.js';
import { createHarness } from '../../models/harness.js';
import type { Harness, HarnessNode } from '../../models/harness.js';
import type { Component } from '../../models/component.js';
import type { Wire } from '../../models/wire.js';
import type { Cable } from '../../models/cable.js';

function makeComponent(overrides: Partial<Component> = {}): Component {
  return {
    id: 'comp-1',
    name: 'Test Connector',
    manufacturer: 'Acme',
    partNumber: 'AC-100',
    category: 'connector',
    type: 'free_hanging',
    shape: 'rectangular',
    pins: [
      { id: 'p1', label: '1', position: { x: 0, y: 0 }, direction: 'left', signalType: 'signal', gender: 'neutral' },
    ],
    footprint: { width: 20, height: 20, pinLayout: 'single_row' },
    description: 'A test connector',
    tags: ['test'],
    custom: false,
    ...overrides,
  };
}

function makeWire(overrides: Partial<Wire> = {}): Wire {
  return {
    id: 'wire-1',
    gauge: 22,
    color: 'red',
    material: 'copper',
    insulationType: 'PVC',
    currentRating: 3,
    voltageRating: 300,
    temperatureRating: 105,
    ...overrides,
  };
}

function makeCable(overrides: Partial<Cable> = {}): Cable {
  return {
    id: 'cable-1',
    name: 'Test Cable',
    partNumber: 'CBL-001',
    manufacturer: 'CableCo',
    conductors: [
      { position: 0, wire: makeWire({ id: 'cw1', color: 'red' }) },
      { position: 1, wire: makeWire({ id: 'cw2', color: 'black' }) },
    ],
    jacket: { material: 'PVC', color: 'black', outerDiameter: 5.0 },
    outerDiameter: 6.0,
    bendRadius: 24,
    weightPerMeter: 50,
    temperatureRange: { min: -20, max: 105 },
    description: 'A test cable',
    custom: false,
    ...overrides,
  };
}

describe('BomGenerator', () => {
  let generator: BomGenerator;
  let harness: Harness;

  beforeEach(() => {
    generator = new BomGenerator();
    harness = createHarness('Test Harness', 'Tester');
  });

  describe('generate', () => {
    it('generates an empty BOM for an empty harness', () => {
      const bom = generator.generate(harness);
      expect(bom.harnessName).toBe('Test Harness');
      expect(bom.version).toBe(1);
      expect(bom.entries).toEqual([]);
      expect(bom.totalParts).toBe(0);
      expect(bom.totalUniquePartNumbers).toBe(0);
      expect(bom.estimatedCost).toBeUndefined();
    });

    it('collects component entries from nodes', () => {
      const comp = makeComponent();
      const node: HarnessNode = {
        id: 'n1',
        componentId: comp.id,
        component: comp,
        position: { x: 100, y: 100 },
        rotation: 0,
        label: 'J1',
        locked: false,
      };
      harness.nodes.push(node);

      const bom = generator.generate(harness);
      expect(bom.entries.length).toBe(1);
      expect(bom.entries[0].refDesignator).toBe('J1');
      expect(bom.entries[0].partNumber).toBe('AC-100');
      expect(bom.entries[0].manufacturer).toBe('Acme');
      expect(bom.entries[0].quantity).toBe(1);
    });

    it('collects wire entries', () => {
      harness.wires.push(makeWire({ id: 'w1' }));
      harness.wires.push(makeWire({ id: 'w2' }));

      const bom = generator.generate(harness);
      expect(bom.entries.length).toBe(1); // Consolidated: same gauge+color
      expect(bom.entries[0].quantity).toBe(2);
      expect(bom.entries[0].category).toBe('wire');
    });

    it('separates wires by gauge and color', () => {
      harness.wires.push(makeWire({ id: 'w1', gauge: 22, color: 'red' }));
      harness.wires.push(makeWire({ id: 'w2', gauge: 18, color: 'black' }));

      const bom = generator.generate(harness);
      expect(bom.entries.length).toBe(2);
    });

    it('collects cable entries', () => {
      harness.cables.push(makeCable());

      const bom = generator.generate(harness);
      expect(bom.entries.length).toBe(1);
      expect(bom.entries[0].category).toBe('cable');
      expect(bom.entries[0].partNumber).toBe('CBL-001');
    });

    it('consolidates duplicate part numbers', () => {
      const comp = makeComponent();
      harness.nodes.push({
        id: 'n1', componentId: comp.id, component: comp,
        position: { x: 0, y: 0 }, rotation: 0, label: 'J1', locked: false,
      });
      harness.nodes.push({
        id: 'n2', componentId: comp.id, component: { ...comp, id: 'comp-2' },
        position: { x: 100, y: 0 }, rotation: 0, label: 'J2', locked: false,
      });

      const bom = generator.generate(harness);
      // Same part number → consolidated to one entry with qty 2
      expect(bom.entries.length).toBe(1);
      expect(bom.entries[0].quantity).toBe(2);
      expect(bom.entries[0].refDesignator).toContain('J1');
      expect(bom.entries[0].refDesignator).toContain('J2');
    });

    it('computes correct totalParts and totalUniquePartNumbers', () => {
      const comp1 = makeComponent({ partNumber: 'P1' });
      const comp2 = makeComponent({ id: 'c2', partNumber: 'P2' });
      harness.nodes.push({
        id: 'n1', componentId: comp1.id, component: comp1,
        position: { x: 0, y: 0 }, rotation: 0, label: 'J1', locked: false,
      });
      harness.nodes.push({
        id: 'n2', componentId: comp2.id, component: comp2,
        position: { x: 100, y: 0 }, rotation: 0, label: 'J2', locked: false,
      });

      const bom = generator.generate(harness);
      expect(bom.totalParts).toBe(2);
      expect(bom.totalUniquePartNumbers).toBe(2);
    });

    it('sets generatedAt to a valid ISO date', () => {
      const bom = generator.generate(harness);
      expect(new Date(bom.generatedAt).toISOString()).toBe(bom.generatedAt);
    });

    it('notes shielded cables', () => {
      const cable = makeCable({
        shielding: { type: 'braid', coverage: 85, material: 'tinned copper', drainWire: true },
      });
      harness.cables.push(cable);

      const bom = generator.generate(harness);
      expect(bom.entries[0].notes).toContain('Shielded');
      expect(bom.entries[0].notes).toContain('braid');
    });
  });

  describe('toCSV', () => {
    it('generates valid CSV with headers', () => {
      const bom = generator.generate(harness);
      const csv = generator.toCSV(bom);
      const lines = csv.split('\n');
      expect(lines[0]).toContain('Ref Designator');
      expect(lines[0]).toContain('Part Number');
      expect(lines[0]).toContain('Quantity');
    });

    it('includes all entries as rows', () => {
      const comp = makeComponent();
      harness.nodes.push({
        id: 'n1', componentId: comp.id, component: comp,
        position: { x: 0, y: 0 }, rotation: 0, label: 'J1', locked: false,
      });

      const bom = generator.generate(harness);
      const csv = generator.toCSV(bom);
      const lines = csv.split('\n');
      expect(lines.length).toBe(2); // header + 1 data row
    });

    it('escapes CSV special characters', () => {
      const comp = makeComponent({ name: 'Has "quotes" and, commas' });
      harness.nodes.push({
        id: 'n1', componentId: comp.id, component: comp,
        position: { x: 0, y: 0 }, rotation: 0, label: 'J1', locked: false,
      });

      const bom = generator.generate(harness);
      const csv = generator.toCSV(bom);
      // Description (mapped from component.name) with special chars should be quoted
      expect(csv).toContain('"Has ""quotes"" and, commas"');
    });
  });

  describe('toTextTable', () => {
    it('includes title and version', () => {
      const bom = generator.generate(harness);
      const table = generator.toTextTable(bom);
      expect(table).toContain('BOM - Test Harness');
      expect(table).toContain('Version: 1');
    });

    it('includes total parts count', () => {
      const comp = makeComponent();
      harness.nodes.push({
        id: 'n1', componentId: comp.id, component: comp,
        position: { x: 0, y: 0 }, rotation: 0, label: 'J1', locked: false,
      });

      const bom = generator.generate(harness);
      const table = generator.toTextTable(bom);
      expect(table).toContain('Total parts: 1');
    });

    it('includes estimated cost when available', () => {
      const bom = generator.generate(harness);
      bom.estimatedCost = 42.50;
      const table = generator.toTextTable(bom);
      expect(table).toContain('Estimated cost: $42.50');
    });
  });
});
