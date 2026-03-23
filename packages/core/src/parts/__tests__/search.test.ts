import { describe, it, expect } from 'vitest';
import { fuzzyScore, searchComponents } from '../search.js';
import type { Component } from '../../models/component.js';

function makeComponent(overrides: Partial<Component> = {}): Component {
  return {
    id: 'c1',
    name: 'JST PH 2-Pin',
    manufacturer: 'JST',
    partNumber: 'B2B-PH-K-S',
    category: 'connector',
    type: 'pcb_mount',
    shape: 'rectangular',
    pins: [],
    footprint: { width: 20, height: 20, pinLayout: 'single_row' },
    description: 'JST PH series 2-pin header',
    tags: ['jst', 'ph', '2pin'],
    custom: false,
    ...overrides,
  };
}

describe('fuzzyScore', () => {
  it('returns 1 for exact match', () => {
    expect(fuzzyScore('hello', 'hello')).toBe(1);
  });

  it('returns 0 for empty query', () => {
    expect(fuzzyScore('', 'hello')).toBe(0);
  });

  it('returns 0 for empty target', () => {
    expect(fuzzyScore('hello', '')).toBe(0);
  });

  it('returns 0.9 for substring match', () => {
    expect(fuzzyScore('PH', 'JST PH 2-Pin')).toBe(0.9);
  });

  it('is case-insensitive', () => {
    expect(fuzzyScore('JST', 'jst')).toBe(1);
  });

  it('returns higher score for closer matches', () => {
    const scoreGood = fuzzyScore('connector', 'connector');
    const scoreFair = fuzzyScore('connector', 'connection');
    expect(scoreGood).toBeGreaterThan(scoreFair);
  });

  it('returns non-zero for partial bigram matches', () => {
    const score = fuzzyScore('molex', 'micro-fit molex');
    expect(score).toBeGreaterThan(0);
  });
});

describe('searchComponents', () => {
  const components: Component[] = [
    makeComponent({ id: 'c1', name: 'JST PH 2-Pin', manufacturer: 'JST', category: 'connector', tags: ['jst'] }),
    makeComponent({ id: 'c2', name: 'Molex Micro-Fit', manufacturer: 'Molex', category: 'connector', tags: ['molex'] }),
    makeComponent({ id: 'c3', name: 'DC Motor', manufacturer: 'Generic', category: 'motor', tags: ['motor', 'dc'] }),
    makeComponent({ id: 'c4', name: 'SPDT Relay', manufacturer: 'Omron', category: 'relay', tags: ['relay'] }),
    makeComponent({ id: 'c5', name: 'Fuse 5A', manufacturer: 'Littelfuse', category: 'fuse', tags: ['fuse'] }),
  ];

  it('returns all components when query is empty', () => {
    const results = searchComponents(components, { query: '' });
    expect(results.length).toBe(5);
  });

  it('filters by query text', () => {
    const results = searchComponents(components, { query: 'JST' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].component.name).toContain('JST');
  });

  it('filters by category', () => {
    const results = searchComponents(components, { query: '', category: 'motor' });
    expect(results.length).toBe(1);
    expect(results[0].component.category).toBe('motor');
  });

  it('filters by manufacturer', () => {
    const results = searchComponents(components, { query: '', manufacturer: 'Omron' });
    expect(results.length).toBe(1);
    expect(results[0].component.manufacturer).toBe('Omron');
  });

  it('combines query and category filters', () => {
    const results = searchComponents(components, { query: 'motor', category: 'motor' });
    expect(results.length).toBe(1);
  });

  it('respects maxResults', () => {
    const results = searchComponents(components, { query: '', maxResults: 2 });
    expect(results.length).toBe(2);
  });

  it('sorts results by score (highest first)', () => {
    const results = searchComponents(components, { query: 'relay' });
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('searches across name, partNumber, manufacturer, description, tags', () => {
    const results = searchComponents(components, { query: 'Littelfuse' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].component.manufacturer).toBe('Littelfuse');
  });

  it('filters out low-score results', () => {
    const results = searchComponents(components, { query: 'zzzzqqqq' });
    expect(results.length).toBe(0);
  });
});
