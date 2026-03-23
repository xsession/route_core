import { describe, it, expect, beforeEach } from 'vitest';
import { HarnessValidator } from '../validator.js';
import { HarnessBuilder } from '../builder.js';
import { createHarness } from '../../models/harness.js';
import type { Component } from '../../models/component.js';

function makeComponent(overrides: Partial<Component> = {}): Component {
  return {
    id: 'comp-1',
    name: 'Connector',
    manufacturer: '',
    partNumber: '',
    category: 'connector',
    type: 'free_hanging',
    shape: 'rectangular',
    pins: [
      { id: 'p1', label: '1', position: { x: 0, y: 5 }, direction: 'left', signalType: 'signal', gender: 'neutral' },
      { id: 'p2', label: '2', position: { x: 0, y: 15 }, direction: 'left', signalType: 'power', currentRating: 10, gender: 'neutral' },
    ],
    footprint: { width: 20, height: 30, pinLayout: 'single_row' },
    description: '',
    tags: [],
    custom: false,
    ...overrides,
  };
}

describe('HarnessValidator', () => {
  let validator: HarnessValidator;
  let builder: HarnessBuilder;

  beforeEach(() => {
    validator = new HarnessValidator();
    builder = new HarnessBuilder(createHarness('Test', 'Eng'));
  });

  describe('empty harness', () => {
    it('produces no issues', () => {
      const issues = validator.validate(builder.getHarness());
      expect(issues).toEqual([]);
    });
  });

  describe('unconnected pins', () => {
    it('warns about unconnected pins', () => {
      const comp = makeComponent();
      builder.placeComponent(comp, { x: 0, y: 0 });

      const issues = validator.validate(builder.getHarness());
      const unconnected = issues.filter(i => i.code === 'UNCONNECTED_PIN');
      expect(unconnected.length).toBe(2); // 2 pins, none connected
      expect(unconnected[0].severity).toBe('warning');
    });

    it('does not warn about no-connect pins', () => {
      const comp = makeComponent({
        pins: [
          { id: 'p1', label: '1', position: { x: 0, y: 5 }, direction: 'left', signalType: 'nc', gender: 'neutral' },
        ],
      });
      builder.placeComponent(comp, { x: 0, y: 0 });

      const issues = validator.validate(builder.getHarness());
      const unconnected = issues.filter(i => i.code === 'UNCONNECTED_PIN');
      expect(unconnected.length).toBe(0);
    });

    it('does not warn when pin is connected', () => {
      const c1 = makeComponent({ id: 'c1' });
      const c2 = makeComponent({ id: 'c2' });
      const n1 = builder.placeComponent(c1, { x: 0, y: 0 });
      const n2 = builder.placeComponent(c2, { x: 100, y: 0 });

      builder.connect(
        { componentId: n1.id, pinId: 'p1' },
        { componentId: n2.id, pinId: 'p1' },
        'SIG'
      );

      const issues = validator.validate(builder.getHarness());
      const unconnected = issues.filter(i => i.code === 'UNCONNECTED_PIN');
      // Only p2 on each node is unconnected (2 warnings)
      expect(unconnected.length).toBe(2);
    });
  });

  describe('duplicate labels', () => {
    it('reports duplicate component labels', () => {
      const c1 = makeComponent({ id: 'c1' });
      const c2 = makeComponent({ id: 'c2' });
      const n1 = builder.placeComponent(c1, { x: 0, y: 0 }, 'J1');
      const n2 = builder.placeComponent(c2, { x: 100, y: 0 }, 'J1');

      const issues = validator.validate(builder.getHarness());
      const dups = issues.filter(i => i.code === 'DUPLICATE_LABEL');
      expect(dups.length).toBe(2); // One error per duplicate
      expect(dups[0].severity).toBe('error');
    });

    it('does not report unique labels', () => {
      const c1 = makeComponent({ id: 'c1' });
      const c2 = makeComponent({ id: 'c2' });
      builder.placeComponent(c1, { x: 0, y: 0 }, 'J1');
      builder.placeComponent(c2, { x: 100, y: 0 }, 'J2');

      const issues = validator.validate(builder.getHarness());
      const dups = issues.filter(i => i.code === 'DUPLICATE_LABEL');
      expect(dups.length).toBe(0);
    });
  });

  describe('current ratings', () => {
    it('reports wire current rating exceeded', () => {
      const c1 = makeComponent({
        id: 'c1',
        pins: [
          { id: 'p1', label: '1', position: { x: 0, y: 5 }, direction: 'left', signalType: 'power', currentRating: 20, gender: 'neutral' },
        ],
      });
      const c2 = makeComponent({ id: 'c2' });
      const n1 = builder.placeComponent(c1, { x: 0, y: 0 });
      const n2 = builder.placeComponent(c2, { x: 100, y: 0 });

      const wire = {
        id: 'w1', gauge: 22, color: 'red', material: 'copper' as const,
        insulationType: 'PVC' as const, currentRating: 3, voltageRating: 300, temperatureRating: 105,
      };
      builder.addWire(wire);

      builder.connect(
        { componentId: n1.id, pinId: 'p1' },
        { componentId: n2.id, pinId: 'p1' },
        'POWER',
        { wireRef: 'w1' }
      );

      const issues = validator.validate(builder.getHarness());
      const ratings = issues.filter(i => i.code === 'CURRENT_RATING_EXCEEDED');
      expect(ratings.length).toBeGreaterThanOrEqual(1);
      expect(ratings[0].severity).toBe('error');
    });
  });

  describe('overlapping nodes', () => {
    it('warns about overlapping components', () => {
      const c1 = makeComponent({ id: 'c1' });
      const c2 = makeComponent({ id: 'c2' });
      builder.placeComponent(c1, { x: 100, y: 100 });
      builder.placeComponent(c2, { x: 102, y: 102 });

      const issues = validator.validate(builder.getHarness());
      const overlaps = issues.filter(i => i.code === 'OVERLAPPING_NODES');
      expect(overlaps.length).toBeGreaterThanOrEqual(1);
      expect(overlaps[0].severity).toBe('warning');
    });

    it('does not warn about well-spaced components', () => {
      const c1 = makeComponent({ id: 'c1' });
      const c2 = makeComponent({ id: 'c2' });
      builder.placeComponent(c1, { x: 0, y: 0 });
      builder.placeComponent(c2, { x: 200, y: 200 });

      const issues = validator.validate(builder.getHarness());
      const overlaps = issues.filter(i => i.code === 'OVERLAPPING_NODES');
      expect(overlaps.length).toBe(0);
    });
  });

  describe('self connections', () => {
    it('reports a pin connected to itself', () => {
      const harness = builder.getHarness();
      const comp = makeComponent();
      const node = builder.placeComponent(comp, { x: 0, y: 0 });

      // Manually add a self-connection (bypass builder validation)
      harness.connections.push({
        id: 'self-conn',
        from: { componentId: node.id, pinId: 'p1' },
        to: { componentId: node.id, pinId: 'p1' },
        signalLabel: 'SELF',
      });

      const issues = validator.validate(harness);
      const selfConns = issues.filter(i => i.code === 'SELF_CONNECTION');
      expect(selfConns.length).toBe(1);
      expect(selfConns[0].severity).toBe('error');
    });
  });
});
