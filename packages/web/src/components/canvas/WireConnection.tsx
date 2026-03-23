import React from 'react';
import type { Connection } from '@route-core/core';
import type { RoutedWire } from '@route-core/core';
import { useHarnessStore } from '../../store/harness-store';

interface Props {
  route: RoutedWire;
  connections: Connection[];
}

const SIGNAL_COLORS: Record<string, string> = {
  VCC: '#dc2626',
  '+V': '#dc2626',
  GND: '#1f2937',
  SDA: '#2563eb',
  SCL: '#7c3aed',
  TX: '#059669',
  RX: '#d97706',
};

export function WireConnection({ route, connections }: Props) {
  const { selectedConnectionId, selectConnection } = useHarnessStore();
  const connection = connections.find(c => c.id === route.connectionId);
  if (!connection || route.path.length < 2) return null;

  const isSelected = selectedConnectionId === route.connectionId;
  const color = SIGNAL_COLORS[connection.signalLabel] ?? '#6b7280';

  const pathData = route.path
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  const midIdx = Math.floor(route.path.length / 2);
  const midPoint = route.path[midIdx];

  return (
    <g onClick={() => selectConnection(route.connectionId)} style={{ cursor: 'pointer' }}>
      {/* Hit area (wider invisible line for easier clicking) */}
      <path d={pathData} fill="none" stroke="transparent" strokeWidth={10} />

      {/* Visible wire */}
      <path
        d={pathData}
        fill="none"
        stroke={isSelected ? '#3b82f6' : color}
        strokeWidth={isSelected ? 2.5 : 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Signal label */}
      {connection.signalLabel && midPoint && (
        <text
          x={midPoint.x}
          y={midPoint.y - 6}
          textAnchor="middle"
          fontSize={9}
          fill={isSelected ? '#3b82f6' : '#6b7280'}
          fontFamily="sans-serif"
        >
          {connection.signalLabel}
        </text>
      )}
    </g>
  );
}
