import { describe, it, expect } from 'vitest';
import { createHarness, createDefaultCanvas, generateId } from '../harness.js';

describe('generateId', () => {
  it('returns a non-empty string', () => {
    const id = generateId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('returns unique ids across multiple calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it('returns UUID-formatted strings', () => {
    const id = generateId();
    // UUID v4 format: 8-4-4-4-12 hex chars
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });
});

describe('createDefaultCanvas', () => {
  it('returns expected default values', () => {
    const canvas = createDefaultCanvas();
    expect(canvas).toEqual({
      width: 2000,
      height: 1500,
      zoom: 1,
      panX: 0,
      panY: 0,
      gridSize: 10,
      snapToGrid: true,
      showLabels: true,
      showPinNumbers: true,
      showGrid: true,
      showWireInfo: true,
      wireUnits: 'awg',
      lengthUnits: 'metric',
    });
  });

  it('returns a new object each time', () => {
    const a = createDefaultCanvas();
    const b = createDefaultCanvas();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('createHarness', () => {
  it('creates a harness with the given name and author', () => {
    const h = createHarness('Test Harness', 'Engineer');
    expect(h.name).toBe('Test Harness');
    expect(h.author).toBe('Engineer');
  });

  it('initializes with version 1', () => {
    const h = createHarness('H1', 'A');
    expect(h.version).toBe(1);
  });

  it('initializes with empty collections', () => {
    const h = createHarness('H1', 'A');
    expect(h.nodes).toEqual([]);
    expect(h.connections).toEqual([]);
    expect(h.splices).toEqual([]);
    expect(h.cables).toEqual([]);
    expect(h.wires).toEqual([]);
    expect(h.revisions).toEqual([]);
  });

  it('generates a unique id', () => {
    const a = createHarness('A', 'X');
    const b = createHarness('B', 'X');
    expect(a.id).not.toBe(b.id);
  });

  it('sets createdAt and updatedAt as valid ISO date strings', () => {
    const before = new Date().toISOString();
    const h = createHarness('H', 'A');
    const after = new Date().toISOString();

    expect(h.createdAt).toBeTruthy();
    expect(h.updatedAt).toBeTruthy();
    expect(h.createdAt >= before).toBe(true);
    expect(h.createdAt <= after).toBe(true);
    expect(h.createdAt).toBe(h.updatedAt);
  });

  it('sets default canvas state', () => {
    const h = createHarness('H', 'A');
    expect(h.canvas).toEqual(createDefaultCanvas());
  });

  it('sets empty description', () => {
    const h = createHarness('H', 'A');
    expect(h.description).toBe('');
  });
});
