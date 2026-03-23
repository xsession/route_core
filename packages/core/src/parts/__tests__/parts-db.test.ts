import { describe, it, expect, beforeEach } from 'vitest';
import { PartsDatabase } from '../parts-db.js';
import type { Component } from '../../models/component.js';
import type { Cable } from '../../models/cable.js';
import type { Wire } from '../../models/wire.js';

function makeComponent(id: string): Component {
  return {
    id,
    name: `Component ${id}`,
    manufacturer: 'TestMfr',
    partNumber: `PN-${id}`,
    category: 'connector',
    type: 'free_hanging',
    shape: 'rectangular',
    pins: [],
    footprint: { width: 20, height: 20, pinLayout: 'single_row' },
    description: '',
    tags: [],
    custom: false,
  };
}

function makeWire(id: string): Wire {
  return {
    id,
    gauge: 22,
    color: 'red',
    material: 'copper',
    insulationType: 'PVC',
    currentRating: 3,
    voltageRating: 300,
    temperatureRating: 105,
  };
}

function makeCable(id: string): Cable {
  return {
    id,
    name: `Cable ${id}`,
    conductors: [],
    jacket: { material: 'PVC', color: 'black', outerDiameter: 5 },
    outerDiameter: 6,
    bendRadius: 24,
    weightPerMeter: 50,
    temperatureRange: { min: -20, max: 105 },
    description: '',
    custom: false,
  };
}

describe('PartsDatabase', () => {
  let db: PartsDatabase;

  beforeEach(() => {
    db = new PartsDatabase();
  });

  describe('components', () => {
    it('adds and retrieves a component', () => {
      const comp = makeComponent('c1');
      db.addComponent(comp);
      expect(db.getComponent('c1')).toEqual(comp);
    });

    it('adds multiple components at once', () => {
      db.addComponents([makeComponent('c1'), makeComponent('c2')]);
      expect(db.getAllComponents().length).toBe(2);
    });

    it('removes a component', () => {
      db.addComponent(makeComponent('c1'));
      expect(db.removeComponent('c1')).toBe(true);
      expect(db.getComponent('c1')).toBeUndefined();
    });

    it('returns false when removing non-existent component', () => {
      expect(db.removeComponent('nope')).toBe(false);
    });

    it('returns all components', () => {
      db.addComponents([makeComponent('c1'), makeComponent('c2'), makeComponent('c3')]);
      expect(db.getAllComponents().length).toBe(3);
    });

    it('filters components by category', () => {
      const motor: Component = { ...makeComponent('m1'), category: 'motor' };
      db.addComponent(makeComponent('c1'));
      db.addComponent(motor);
      expect(db.getComponentsByCategory('motor').length).toBe(1);
    });

    it('searches components', () => {
      db.addComponents([
        makeComponent('c1'),
        { ...makeComponent('c2'), name: 'Special Sensor', category: 'sensor' },
      ]);
      const results = db.searchComponents({ query: 'Sensor' });
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('returns unique manufacturers', () => {
      db.addComponent({ ...makeComponent('c1'), manufacturer: 'Acme' });
      db.addComponent({ ...makeComponent('c2'), manufacturer: 'Beta' });
      db.addComponent({ ...makeComponent('c3'), manufacturer: 'Acme' });

      const mfrs = db.getManufacturers();
      expect(mfrs).toEqual(['Acme', 'Beta']);
    });

    it('returns unique categories', () => {
      db.addComponent({ ...makeComponent('c1'), category: 'motor' });
      db.addComponent({ ...makeComponent('c2'), category: 'connector' });
      db.addComponent({ ...makeComponent('c3'), category: 'motor' });

      const cats = db.getCategories();
      expect(cats).toContain('motor');
      expect(cats).toContain('connector');
      expect(cats.length).toBe(2);
    });
  });

  describe('cables', () => {
    it('adds and retrieves a cable', () => {
      const cable = makeCable('cb1');
      db.addCable(cable);
      expect(db.getCable('cb1')).toEqual(cable);
    });

    it('removes a cable', () => {
      db.addCable(makeCable('cb1'));
      expect(db.removeCable('cb1')).toBe(true);
      expect(db.getCable('cb1')).toBeUndefined();
    });

    it('returns all cables', () => {
      db.addCable(makeCable('cb1'));
      db.addCable(makeCable('cb2'));
      expect(db.getAllCables().length).toBe(2);
    });
  });

  describe('wires', () => {
    it('adds and retrieves a wire', () => {
      const wire = makeWire('w1');
      db.addWire(wire);
      expect(db.getWire('w1')).toEqual(wire);
    });

    it('removes a wire', () => {
      db.addWire(makeWire('w1'));
      expect(db.removeWire('w1')).toBe(true);
      expect(db.getWire('w1')).toBeUndefined();
    });

    it('returns all wires', () => {
      db.addWire(makeWire('w1'));
      db.addWire(makeWire('w2'));
      expect(db.getAllWires().length).toBe(2);
    });
  });

  describe('serialization', () => {
    it('serializes to JSON', () => {
      db.addComponent(makeComponent('c1'));
      db.addCable(makeCable('cb1'));
      db.addWire(makeWire('w1'));

      const json = db.toJSON();
      expect(json.components.length).toBe(1);
      expect(json.cables.length).toBe(1);
      expect(json.wires.length).toBe(1);
    });

    it('loads from JSON', () => {
      const data = {
        components: [makeComponent('c1')],
        cables: [makeCable('cb1')],
        wires: [makeWire('w1')],
      };

      db.loadFromJSON(data);
      expect(db.getAllComponents().length).toBe(1);
      expect(db.getAllCables().length).toBe(1);
      expect(db.getAllWires().length).toBe(1);
    });

    it('handles partial JSON data', () => {
      db.loadFromJSON({ components: [makeComponent('c1')] });
      expect(db.getAllComponents().length).toBe(1);
      expect(db.getAllCables().length).toBe(0);
    });
  });

  describe('stats', () => {
    it('reports correct counts', () => {
      db.addComponent(makeComponent('c1'));
      db.addComponent(makeComponent('c2'));
      db.addCable(makeCable('cb1'));
      db.addWire(makeWire('w1'));

      expect(db.stats).toEqual({
        components: 2,
        cables: 1,
        wires: 1,
      });
    });
  });
});
