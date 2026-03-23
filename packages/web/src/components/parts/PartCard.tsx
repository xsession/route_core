import React from 'react';
import type { Component } from '@route-core/core';

interface Props {
  part: Component;
  onPlace: () => void;
}

export function PartCard({ part, onPlace }: Props) {
  return (
    <div className="part-card">
      <div className="part-card-header">
        <span className="part-name">{part.name}</span>
        <span className="part-category">{part.category}</span>
      </div>
      {part.manufacturer && (
        <div className="part-meta">{part.manufacturer}</div>
      )}
      {part.partNumber && (
        <div className="part-meta">P/N: {part.partNumber}</div>
      )}
      <div className="part-meta">{part.pins.length} pins &middot; {part.footprint.pinLayout}</div>
      <button className="place-btn" onClick={onPlace}>
        + Place on Canvas
      </button>
    </div>
  );
}
