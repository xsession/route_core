import React from 'react';
import type { Cable } from '@route-core/core';

interface Props {
  cable: Cable;
  position: { x: number; y: number };
  selected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  assignedConnections: number;
}

export const CABLE_BLOCK_WIDTH = 160;
export const CABLE_HEADER_HEIGHT = 28;
export const CABLE_CONDUCTOR_HEIGHT = 18;
const BORDER_RADIUS = 4;

// Conductor wire colors - map standard positions to colors
const CONDUCTOR_COLORS = [
  '#dc2626', '#2563eb', '#059669', '#d97706', '#7c3aed',
  '#ec4899', '#0891b2', '#f97316', '#6366f1', '#14b8a6',
];

export function CableBlock({
  cable,
  position,
  selected,
  onMouseDown,
  assignedConnections,
}: Props) {
  const bodyHeight = cable.conductors.length * CABLE_CONDUCTOR_HEIGHT + 8;
  const totalHeight = CABLE_HEADER_HEIGHT + bodyHeight;
  const headerBg = selected ? '#7c3aed' : '#4c1d95';
  const borderColor = selected ? '#a78bfa' : '#7c3aed';

  return (
    <g
      transform={`translate(${position.x}, ${position.y})`}
      onMouseDown={onMouseDown}
      style={{ cursor: 'move' }}
    >
      {/* Shadow */}
      <rect x={2} y={2} width={CABLE_BLOCK_WIDTH} height={totalHeight} rx={BORDER_RADIUS} fill="rgba(0,0,0,0.06)" />

      {/* Body */}
      <rect x={0} y={0} width={CABLE_BLOCK_WIDTH} height={totalHeight} rx={BORDER_RADIUS} fill="#ffffff" stroke={borderColor} strokeWidth={selected ? 2 : 1} />

      {/* Header */}
      <rect x={0} y={0} width={CABLE_BLOCK_WIDTH} height={CABLE_HEADER_HEIGHT} rx={BORDER_RADIUS} fill={headerBg} />
      <rect x={0} y={CABLE_HEADER_HEIGHT - BORDER_RADIUS} width={CABLE_BLOCK_WIDTH} height={BORDER_RADIUS} fill={headerBg} />

      {/* Cable name */}
      <text x={8} y={18} fontSize={12} fontWeight="bold" fill="#ffffff" fontFamily="'Segoe UI', system-ui, sans-serif">
        {cable.name}
      </text>

      {/* Core count badge */}
      <g transform={`translate(${CABLE_BLOCK_WIDTH - 36}, 6)`}>
        <rect width={28} height={16} rx={8} fill="rgba(255,255,255,0.2)" />
        <text x={14} y={12} textAnchor="middle" fontSize={10} fontWeight="600" fill="#ffffff">
          {cable.conductors.length}c
        </text>
      </g>

      {/* Shield icon if shielded */}
      {cable.shielding && (
        <text x={CABLE_BLOCK_WIDTH - 44} y={18} fontSize={11} fill="rgba(255,255,255,0.7)">
          🛡
        </text>
      )}

      {/* Conductor rows */}
      {cable.conductors.map((conductor, idx) => {
        const rowY = CABLE_HEADER_HEIGHT + 4 + idx * CABLE_CONDUCTOR_HEIGHT;
        const color = CONDUCTOR_COLORS[idx % CONDUCTOR_COLORS.length];
        const label = conductor.label || `Core ${idx + 1}`;

        return (
          <g key={idx}>
            {/* Color dot */}
            <circle cx={14} cy={rowY + CABLE_CONDUCTOR_HEIGHT / 2} r={4} fill={color} stroke="#ffffff" strokeWidth={1} />

            {/* Label */}
            <text x={24} y={rowY + CABLE_CONDUCTOR_HEIGHT / 2 + 3.5} fontSize={10} fill="#4b5563" fontFamily="'Segoe UI', system-ui, sans-serif">
              {label}
            </text>

            {/* Wire spec */}
            {conductor.wire && (
              <text x={CABLE_BLOCK_WIDTH - 8} y={rowY + CABLE_CONDUCTOR_HEIGHT / 2 + 3.5} textAnchor="end" fontSize={9} fill="#94a3b8" fontFamily="monospace">
                {conductor.wire.gauge}AWG
              </text>
            )}
          </g>
        );
      })}

      {/* Assignment badge */}
      {assignedConnections > 0 && (
        <g transform={`translate(${CABLE_BLOCK_WIDTH - 20}, ${totalHeight - 16})`}>
          <rect width={18} height={14} rx={7} fill="#3b82f6" />
          <text x={9} y={11} textAnchor="middle" fontSize={9} fontWeight="600" fill="#ffffff">
            {assignedConnections}
          </text>
        </g>
      )}

      {/* Outer border */}
      <rect x={0} y={0} width={CABLE_BLOCK_WIDTH} height={totalHeight} rx={BORDER_RADIUS} fill="none" stroke={borderColor} strokeWidth={selected ? 2 : 1} pointerEvents="none" />
    </g>
  );
}
