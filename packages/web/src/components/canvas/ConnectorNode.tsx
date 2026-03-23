import React from 'react';
import type { HarnessNode } from '@route-core/core';

interface Props {
  node: HarnessNode;
  selected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}

export function ConnectorNode({ node, selected, onMouseDown }: Props) {
  const { component, position, rotation, label } = node;
  const { footprint, pins } = component;

  return (
    <g
      transform={`translate(${position.x}, ${position.y}) rotate(${rotation})`}
      onMouseDown={onMouseDown}
      style={{ cursor: 'move' }}
    >
      {/* Body */}
      <rect
        x={0}
        y={0}
        width={footprint.width}
        height={footprint.height}
        rx={4}
        fill={selected ? '#dbeafe' : '#f9fafb'}
        stroke={selected ? '#3b82f6' : '#6b7280'}
        strokeWidth={selected ? 2 : 1.5}
      />

      {/* Label */}
      <text
        x={footprint.width / 2}
        y={-8}
        textAnchor="middle"
        fontSize={12}
        fontWeight="bold"
        fill="#1f2937"
      >
        {label}
      </text>

      {/* Component name */}
      <text
        x={footprint.width / 2}
        y={footprint.height + 14}
        textAnchor="middle"
        fontSize={9}
        fill="#6b7280"
      >
        {component.name}
      </text>

      {/* Pins */}
      {pins.map(pin => (
        <g key={pin.id}>
          <circle
            cx={pin.position.x}
            cy={pin.position.y}
            r={3}
            fill={selected ? '#3b82f6' : '#374151'}
          />
          <text
            x={pin.position.x + (pin.direction === 'left' ? -8 : 8)}
            y={pin.position.y + 3}
            textAnchor={pin.direction === 'left' ? 'end' : 'start'}
            fontSize={8}
            fill="#9ca3af"
            fontFamily="monospace"
          >
            {pin.label}
          </text>
        </g>
      ))}
    </g>
  );
}
