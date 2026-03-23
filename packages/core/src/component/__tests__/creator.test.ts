import { describe, it, expect } from 'vitest';
import { ComponentCreator, COMPONENT_TEMPLATES } from '../creator.js';

describe('COMPONENT_TEMPLATES', () => {
  it('contains at least 10 templates', () => {
    expect(COMPONENT_TEMPLATES.length).toBeGreaterThanOrEqual(10);
  });

  it('every template has required fields', () => {
    for (const tmpl of COMPONENT_TEMPLATES) {
      expect(tmpl.name).toBeTruthy();
      expect(tmpl.category).toBeTruthy();
      expect(tmpl.pinCount).toBeGreaterThan(0);
      expect(tmpl.pinLayout).toBeTruthy();
      expect(tmpl.defaultPinSignal).toBeTruthy();
    }
  });

  it('includes common component types', () => {
    const names = COMPONENT_TEMPLATES.map(t => t.name);
    expect(names).toContain('DB9');
    expect(names).toContain('Fuse Holder');
    expect(names).toContain('Relay SPDT');
    expect(names).toContain('DC Motor');
  });
});

describe('ComponentCreator', () => {
  const creator = new ComponentCreator();

  describe('fromTemplate', () => {
    it('creates a component from a template', () => {
      const template = COMPONENT_TEMPLATES[0]; // 2-Pin Connector
      const comp = creator.fromTemplate(template);

      expect(comp.name).toBe(template.name);
      expect(comp.category).toBe(template.category);
      expect(comp.pins.length).toBe(template.pinCount);
      expect(comp.custom).toBe(true);
    });

    it('applies overrides', () => {
      const template = COMPONENT_TEMPLATES[0];
      const comp = creator.fromTemplate(template, {
        name: 'Custom Name',
        manufacturer: 'Acme',
      });

      expect(comp.name).toBe('Custom Name');
      expect(comp.manufacturer).toBe('Acme');
    });

    it('generates unique IDs for each call', () => {
      const template = COMPONENT_TEMPLATES[0];
      const a = creator.fromTemplate(template);
      const b = creator.fromTemplate(template);
      expect(a.id).not.toBe(b.id);
    });

    it('generates unique pin IDs', () => {
      const template = COMPONENT_TEMPLATES.find(t => t.pinCount >= 4)!;
      const comp = creator.fromTemplate(template);
      const pinIds = comp.pins.map(p => p.id);
      expect(new Set(pinIds).size).toBe(pinIds.length);
    });

    it('sets correct pin signal type from template', () => {
      const template = COMPONENT_TEMPLATES.find(t => t.defaultPinSignal === 'data')!;
      const comp = creator.fromTemplate(template);
      for (const pin of comp.pins) {
        expect(pin.signalType).toBe('data');
      }
    });

    it('generates correct footprint for single_row layout', () => {
      const template = COMPONENT_TEMPLATES.find(t => t.pinLayout === 'single_row')!;
      const comp = creator.fromTemplate(template);
      expect(comp.footprint.pinLayout).toBe('single_row');
      expect(comp.footprint.width).toBe(20);
    });

    it('generates correct footprint for dual_row layout', () => {
      const template = COMPONENT_TEMPLATES.find(t => t.pinLayout === 'dual_row')!;
      const comp = creator.fromTemplate(template);
      expect(comp.footprint.pinLayout).toBe('dual_row');
      expect(comp.footprint.width).toBe(30);
    });

    it('generates correct footprint for circular layout', () => {
      const template = COMPONENT_TEMPLATES.find(t => t.pinLayout === 'circular')!;
      const comp = creator.fromTemplate(template);
      expect(comp.footprint.pinLayout).toBe('circular');
    });
  });

  describe('createCustom', () => {
    it('creates a component with custom pins', () => {
      const comp = creator.createCustom({
        name: 'Custom Sensor',
        category: 'sensor',
        type: 'inline',
        pins: [
          { label: 'VCC', signalType: 'power' },
          { label: 'GND', signalType: 'ground' },
          { label: 'SIG', signalType: 'signal' },
        ],
        pinLayout: 'single_row',
      });

      expect(comp.name).toBe('Custom Sensor');
      expect(comp.category).toBe('sensor');
      expect(comp.type).toBe('inline');
      expect(comp.pins.length).toBe(3);
      expect(comp.pins[0].label).toBe('VCC');
      expect(comp.pins[0].signalType).toBe('power');
      expect(comp.custom).toBe(true);
    });

    it('sets optional manufacturer and partNumber', () => {
      const comp = creator.createCustom({
        name: 'OEM Part',
        category: 'connector',
        type: 'panel_mount',
        manufacturer: 'MakerCorp',
        partNumber: 'MC-42',
        pins: [{ label: '1', signalType: 'signal' }],
        pinLayout: 'single_row',
      });

      expect(comp.manufacturer).toBe('MakerCorp');
      expect(comp.partNumber).toBe('MC-42');
    });

    it('respects pin direction overrides', () => {
      const comp = creator.createCustom({
        name: 'Dir Test',
        category: 'connector',
        type: 'free_hanging',
        pins: [
          { label: 'A', signalType: 'signal', direction: 'right' },
          { label: 'B', signalType: 'signal', direction: 'top' },
        ],
        pinLayout: 'single_row',
      });

      expect(comp.pins[0].direction).toBe('right');
      expect(comp.pins[1].direction).toBe('top');
    });

    it('assigns positions to pins', () => {
      const comp = creator.createCustom({
        name: 'Pos Test',
        category: 'connector',
        type: 'free_hanging',
        pins: [
          { label: '1', signalType: 'signal' },
          { label: '2', signalType: 'signal' },
        ],
        pinLayout: 'single_row',
      });

      // Single row: x=0, increasing y
      expect(comp.pins[0].position.x).toBe(0);
      expect(comp.pins[1].position.x).toBe(0);
      expect(comp.pins[1].position.y).toBeGreaterThan(comp.pins[0].position.y);
    });
  });

  describe('clone', () => {
    it('creates a deep copy with new ID', () => {
      const original = creator.fromTemplate(COMPONENT_TEMPLATES[0]);
      const cloned = creator.clone(original);

      expect(cloned.id).not.toBe(original.id);
      expect(cloned.pins.length).toBe(original.pins.length);
      expect(cloned.name).toBe(`${original.name} (copy)`);
    });

    it('does not share references with the original', () => {
      const original = creator.fromTemplate(COMPONENT_TEMPLATES[0]);
      const cloned = creator.clone(original);

      cloned.pins[0].label = 'MODIFIED';
      expect(original.pins[0].label).not.toBe('MODIFIED');
    });

    it('uses custom name when provided', () => {
      const original = creator.fromTemplate(COMPONENT_TEMPLATES[0]);
      const cloned = creator.clone(original, 'Renamed');
      expect(cloned.name).toBe('Renamed');
    });
  });

  describe('addPins', () => {
    it('adds new pins to the component', () => {
      const original = creator.fromTemplate(COMPONENT_TEMPLATES[0]); // 2-pin
      const updated = creator.addPins(original, [
        { label: 'VCC', signalType: 'power' },
        { label: 'GND', signalType: 'ground' },
      ]);

      expect(updated.pins.length).toBe(4);
      expect(updated.pins[2].label).toBe('VCC');
      expect(updated.pins[3].label).toBe('GND');
    });

    it('does not modify the original', () => {
      const original = creator.fromTemplate(COMPONENT_TEMPLATES[0]);
      const originalPinCount = original.pins.length;
      creator.addPins(original, [{ label: 'NEW', signalType: 'signal' }]);
      expect(original.pins.length).toBe(originalPinCount);
    });

    it('recalculates the footprint', () => {
      const original = creator.fromTemplate(COMPONENT_TEMPLATES[0]); // 2-pin single row
      const origHeight = original.footprint.height;
      const updated = creator.addPins(original, [
        { label: 'A', signalType: 'signal' },
        { label: 'B', signalType: 'signal' },
      ]);
      expect(updated.footprint.height).toBeGreaterThan(origHeight);
    });
  });
});
