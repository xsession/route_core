import React from 'react';
import type { Connection } from '@route-core/core';
import { useHarnessStore } from '../../store/harness-store';

interface VisualRoute {
  connectionId: string;
  path: Array<{ x: number; y: number }>;
  fromDir?: 'left' | 'right';
  toDir?: 'left' | 'right';
}

interface Props {
  route: VisualRoute;
  connections: Connection[];
}

const SIGNAL_COLORS: Record<string, string> = {
  VCC: '#ef4444',
  '+V': '#ef4444',
  '12V': '#ef4444',
  '5V': '#f97316',
  '3V3': '#f59e0b',
  GND: '#94a3b8',
  SDA: '#3b82f6',
  SCL: '#8b5cf6',
  TX: '#10b981',
  RX: '#f59e0b',
  MOSI: '#06b6d4',
  MISO: '#6366f1',
  CLK: '#a855f7',
  CS: '#ec4899',
  CAN_H: '#f97316',
  CAN_L: '#14b8a6',
};

/** Build a smooth cubic bezier connecting two pin endpoints */
function buildWirePath(
  a: { x: number; y: number },
  b: { x: number; y: number },
  fromDir: 'left' | 'right' = 'right',
  toDir: 'left' | 'right' = 'left',
): string {
  // Control point offset based on horizontal distance
  const dx = Math.abs(b.x - a.x);
  const cpOffset = Math.max(40, dx * 0.4);

  // Control points extend outward from the pin direction
  const cp1x = fromDir === 'right' ? a.x + cpOffset : a.x - cpOffset;
  const cp1y = a.y;
  const cp2x = toDir === 'left' ? b.x - cpOffset : b.x + cpOffset;
  const cp2y = b.y;

  return `M ${a.x} ${a.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${b.x} ${b.y}`;
}

export function WireConnection({ route, connections }: Props) {
  const { selectedConnectionId, selectConnection } = useHarnessStore();
  const connection = connections.find(c => c.id === route.connectionId);
  if (!connection || route.path.length < 2) return null;

  const isSelected = selectedConnectionId === route.connectionId;

  // Prefer explicit colorCode, then signal-based lookup, then default
  const color = connection.colorCode
    || SIGNAL_COLORS[connection.signalLabel]
    || '#64748b';

  const start = route.path[0];
  const end = route.path[route.path.length - 1];
  const pathData = buildWirePath(start, end, route.fromDir, route.toDir);

  // Mid-point for label
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  const wireWidth = isSelected ? 2.5 : 1.8;

  return (
    <g onClick={() => selectConnection(route.connectionId)} style={{ cursor: 'pointer' }}>
      {/* Hit area (wider invisible path for easier clicking) */}
      <path d={pathData} fill="none" stroke="transparent" strokeWidth={12} />

      {/* Glow effect when selected */}
      {isSelected && (
        <path
          d={pathData}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={6}
          strokeLinecap="round"
          opacity={0.2}
        />
      )}

      {/* Visible wire */}
      <path
        d={pathData}
        fill="none"
        stroke={isSelected ? '#60a5fa' : color}
        strokeWidth={wireWidth}
        strokeLinecap="round"
      />

      {/* Signal label with background */}
      {connection.signalLabel && (
        <g>
          <rect
            x={midX - connection.signalLabel.length * 3 - 4}
            y={midY - 14}
            width={connection.signalLabel.length * 6 + 8}
            height={14}
            rx={3}
            fill="#0f172a"
            fillOpacity={0.85}
          />
          <text
            x={midX}
            y={midY - 5}
            textAnchor="middle"
            fontSize={9}
            fontWeight={isSelected ? '600' : '500'}
            fill={isSelected ? '#60a5fa' : '#94a3b8'}
            fontFamily="'Segoe UI', system-ui, sans-serif"
          >
            {connection.signalLabel}
          </text>
        </g>
      )}
    </g>
  );
}
