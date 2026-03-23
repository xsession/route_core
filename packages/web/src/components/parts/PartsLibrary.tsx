import React, { useState, useEffect } from 'react';
import { partsApi } from '../../api/client';
import { useHarnessStore } from '../../store/harness-store';
import type { Component } from '@route-core/core';
import { PartCard } from './PartCard';

export function PartsLibrary() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [parts, setParts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { placeComponent, harness } = useHarnessStore();

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading(true);
      partsApi.list({ q: query || undefined, category: category || undefined })
        .then(setParts)
        .catch(() => setParts([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, category]);

  const handlePlace = (comp: Component) => {
    // Place at a default position near center
    const cx = harness.canvas.width / 2 + Math.random() * 100 - 50;
    const cy = harness.canvas.height / 2 + Math.random() * 100 - 50;
    placeComponent(comp, { x: cx, y: cy });
  };

  return (
    <div className="parts-library">
      <h3>Parts Library</h3>
      <input
        type="text"
        placeholder="Search parts..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="search-input"
      />
      <select
        value={category}
        onChange={e => setCategory(e.target.value)}
        className="category-select"
      >
        <option value="">All Categories</option>
        <option value="connector">Connectors</option>
        <option value="terminal">Terminals</option>
        <option value="motor">Motors</option>
        <option value="relay">Relays</option>
        <option value="power_supply">Power Supplies</option>
        <option value="sensor">Sensors</option>
        <option value="switch">Switches</option>
        <option value="fuse">Fuses</option>
        <option value="circuit_breaker">Circuit Breakers</option>
        <option value="controller">Controllers</option>
        <option value="device">Devices</option>
      </select>

      <div className="parts-list">
        {loading && <p className="loading">Searching...</p>}
        {!loading && parts.length === 0 && <p className="empty">No parts found</p>}
        {parts.map((part: any) => (
          <PartCard
            key={part.id}
            part={part.data ?? part}
            onPlace={() => handlePlace(part.data ?? part)}
          />
        ))}
      </div>
    </div>
  );
}
