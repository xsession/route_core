import { describe, it, expect, beforeEach } from 'vitest';
import { ExportManager } from '../manager.js';
import { HarnessBuilder } from '../../harness/builder.js';
import { createHarness } from '../../models/harness.js';
import type { Harness } from '../../models/harness.js';
import type { Component } from '../../models/component.js';

function makeComponent(): Component {
  return {
    id: 'c1',
    name: 'Test Connector',
    manufacturer: 'Acme',
    partNumber: 'AC-100',
    category: 'connector',
    type: 'free_hanging',
    shape: 'rectangular',
    pins: [
      { id: 'p1', label: '1', position: { x: 0, y: 5 }, direction: 'left', signalType: 'signal', gender: 'neutral' },
      { id: 'p2', label: '2', position: { x: 0, y: 15 }, direction: 'left', signalType: 'power', gender: 'neutral' },
    ],
    footprint: { width: 20, height: 30, pinLayout: 'single_row' },
    description: 'A test connector',
    tags: [],
    custom: false,
  };
}

describe('ExportManager', () => {
  let manager: ExportManager;
  let harness: Harness;

  beforeEach(() => {
    manager = new ExportManager();
    harness = createHarness('Export Test', 'Tester');
  });

  describe('exportSvg', () => {
    it('returns an SVG export result', () => {
      const result = manager.exportSvg(harness);
      expect(result.mimeType).toBe('image/svg+xml');
      expect(result.filename).toContain('.svg');
      expect(result.content).toContain('<svg');
      expect(result.content).toContain('</svg>');
    });

    it('includes harness name in the filename', () => {
      const result = manager.exportSvg(harness);
      expect(result.filename).toContain('Export_Test');
    });

    it('includes version in the filename', () => {
      const result = manager.exportSvg(harness);
      expect(result.filename).toContain('v1');
    });
  });

  describe('exportBomCsv', () => {
    it('returns CSV content', () => {
      const result = manager.exportBomCsv(harness);
      expect(result.mimeType).toBe('text/csv');
      expect(result.filename).toContain('BOM');
      expect(result.filename).toContain('.csv');
      expect(result.content).toContain('Ref Designator');
    });
  });

  describe('exportBomText', () => {
    it('returns text table content', () => {
      const result = manager.exportBomText(harness);
      expect(result.mimeType).toBe('text/plain');
      expect(result.filename).toContain('BOM');
      expect(result.filename).toContain('.txt');
      expect(result.content).toContain('BOM - Export Test');
    });
  });

  describe('exportJson', () => {
    it('returns JSON export', () => {
      const result = manager.exportJson(harness);
      expect(result.mimeType).toBe('application/json');
      expect(result.filename).toContain('.json');

      const parsed = JSON.parse(result.content);
      expect(parsed.name).toBe('Export Test');
      expect(parsed.nodes).toEqual([]);
    });

    it('includes component data in the JSON', () => {
      const builder = new HarnessBuilder(harness);
      builder.placeComponent(makeComponent(), { x: 50, y: 50 });

      const result = manager.exportJson(harness);
      const parsed = JSON.parse(result.content);
      expect(parsed.nodes.length).toBe(1);
    });
  });

  describe('importJson', () => {
    it('round-trips a harness through JSON', () => {
      const builder = new HarnessBuilder(harness);
      builder.placeComponent(makeComponent(), { x: 50, y: 50 });

      const exported = manager.exportJson(harness);
      const imported = manager.importJson(exported.content);

      expect(imported.name).toBe(harness.name);
      expect(imported.nodes.length).toBe(1);
      expect(imported.nodes[0].component.name).toBe('Test Connector');
    });
  });

  describe('exportNetlist', () => {
    it('returns netlist text content', () => {
      const result = manager.exportNetlist(harness);
      expect(result.mimeType).toBe('text/plain');
      expect(result.filename).toContain('netlist');
      expect(result.content).toContain('Netlist');
    });

    it('groups connections by signal label', () => {
      const builder = new HarnessBuilder(harness);
      const c1 = makeComponent();
      const c2: Component = { ...makeComponent(), id: 'c2' };
      const n1 = builder.placeComponent(c1, { x: 0, y: 0 });
      const n2 = builder.placeComponent(c2, { x: 100, y: 0 });

      builder.connect(
        { componentId: n1.id, pinId: 'p1' },
        { componentId: n2.id, pinId: 'p1' },
        'VCC'
      );

      const result = manager.exportNetlist(harness);
      expect(result.content).toContain('NET: VCC');
    });
  });

  describe('filename sanitization', () => {
    it('sanitizes special characters in filenames', () => {
      harness.name = 'Design / Rev #2 <test>';
      const result = manager.exportJson(harness);
      expect(result.filename).not.toContain('/');
      expect(result.filename).not.toContain('<');
      expect(result.filename).not.toContain('>');
      expect(result.filename).not.toContain('#');
    });
  });
});
