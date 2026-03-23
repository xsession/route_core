import type { Component } from '../models/component.js';

export interface SearchOptions {
  query: string;
  category?: string;
  manufacturer?: string;
  maxResults?: number;
}

export interface SearchResult {
  component: Component;
  score: number;
}

/**
 * Fuzzy text matching using bigram similarity (Dice coefficient).
 * Returns a score from 0 (no match) to 1 (exact match).
 */
export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase().trim();

  if (q === t) return 1;
  if (q.length === 0 || t.length === 0) return 0;

  // Substring bonus
  if (t.includes(q)) return 0.9;
  if (q.includes(t)) return 0.7;

  const qBigrams = toBigrams(q);
  const tBigrams = toBigrams(t);

  let matches = 0;
  for (const bg of qBigrams) {
    if (tBigrams.has(bg)) matches++;
  }

  return (2 * matches) / (qBigrams.size + tBigrams.size);
}

function toBigrams(str: string): Set<string> {
  const bigrams = new Set<string>();
  for (let i = 0; i < str.length - 1; i++) {
    bigrams.add(str.substring(i, i + 2));
  }
  return bigrams;
}

/**
 * Search components by matching query against name, partNumber,
 * manufacturer, description, and tags.
 */
export function searchComponents(
  components: Component[],
  options: SearchOptions
): SearchResult[] {
  const { query, category, manufacturer, maxResults = 50 } = options;

  let filtered = components;

  if (category) {
    filtered = filtered.filter(c => c.category === category);
  }
  if (manufacturer) {
    filtered = filtered.filter(
      c => c.manufacturer.toLowerCase() === manufacturer.toLowerCase()
    );
  }

  if (!query.trim()) {
    return filtered.slice(0, maxResults).map(c => ({ component: c, score: 1 }));
  }

  const scored: SearchResult[] = [];

  for (const comp of filtered) {
    const fields = [
      comp.name,
      comp.partNumber,
      comp.manufacturer,
      comp.description,
      ...comp.tags,
    ];

    let bestScore = 0;
    for (const field of fields) {
      const s = fuzzyScore(query, field);
      if (s > bestScore) bestScore = s;
    }

    if (bestScore > 0.15) {
      scored.push({ component: comp, score: bestScore });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults);
}
