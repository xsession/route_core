import React from 'react';
import { DESIGNATOR_PREFIX } from '@route-core/core';
import type { HarnessNode, ComponentCategory, Connection } from '@route-core/core';

interface Props {
  node: HarnessNode;
  selected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onPinClick?: (pinId: string) => void;
  connectedPinIds?: Set<string>;
  collapsed?: boolean;
  connections?: Connection[];
}

export const BLOCK_WIDTH = 180;
export const HEADER_HEIGHT = 32;
export const SUBHEADER_HEIGHT = 16;
export const PIN_ROW_HEIGHT = 20;
const PIN_DOT_RADIUS = 5;
const BORDER_RADIUS = 4;

/** Color for pin connection dot */
function pinDotColor(isConnected: boolean, colorCode?: string): string {
  if (isConnected && colorCode) return colorCode;
  if (isConnected) return '#3b82f6';
  return '#4b5563';
}

function formatTypeDesc(shape: string, category: ComponentCategory): string {
  const shapeLabel = shape.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const catLabel = category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return `${shapeLabel} ${catLabel}`;
}

export function ConnectorNode({
  node,
  selected,
  onMouseDown,
  onPinClick,
  connectedPinIds,
  collapsed = false,
  connections = [],
}: Props) {
  const { component, position, rotation, label } = node;
  const { pins, category, shape, partNumber, manufacturer } = component;

  const visiblePins = collapsed
    ? pins.filter(pin => connectedPinIds?.has(`${node.id}:${pin.id}`) ?? false)
    : pins;

  const bodyHeight = visiblePins.length * PIN_ROW_HEIGHT;
  const totalHeight = HEADER_HEIGHT + SUBHEADER_HEIGHT + bodyHeight;
  const designator = label || `${DESIGNATOR_PREFIX[category] ?? 'U'}?`;
  const typeDesc = formatTypeDesc(shape, category);
  const subtitle = [partNumber, manufacturer].filter(Boolean).join(' ');

  const headerBg = selected ? '#1d4ed8' : '#1f2937';
  const borderColor = selected ? '#3b82f6' : '#d1d5db';
  const borderWidth = selected ? 2 : 1;

  const getConnectionForPin = (pinId: string): Connection | undefined =>
    connections.find(c =>
      (c.from.componentId === node.id && c.from.pinId === pinId) ||
      (c.to.componentId === node.id && c.to.pinId === pinId)
    );

  return (
    <g
      transform={`translate(${position.x}, ${position.y})${rotation ? ` rotate(${rotation})` : ''}`}
      onMouseDown={onMouseDown}
      style={{ cursor: 'move' }}
    >
      {/* Drop shadow */}
      <rect x={2} y={2} width={BLOCK_WIDTH} height={totalHeight} rx={BORDER_RADIUS} fill="rgba(0,0,0,0.06)" />

      {/* Body */}
      <rect x={0} y={0} width={BLOCK_WIDTH} height={totalHeight} rx={BORDER_RADIUS} fill="#ffffff" stroke={borderColor} strokeWidth={borderWidth} />

      {/* Header */}
      <rect x={0} y={0} width={BLOCK_WIDTH} height={HEADER_HEIGHT} rx={BORDER_RADIUS} fill={headerBg} />
      <rect x={0} y={HEADER_HEIGHT - BORDER_RADIUS} width={BLOCK_WIDTH} height={BORDER_RADIUS} fill={headerBg} />

      <text x={8} y={21} fontSize={13} fontWeight="bold" fill="#ffffff" fontFamily="'Segoe UI', system-ui, sans-serif">
        {designator}
      </text>

      {subtitle && (
        <text x={BLOCK_WIDTH - 8} y={21} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.65)" fontFamily="'Segoe UI', system-ui, sans-serif">
          {subtitle}
        </text>
      )}

      {/* Sub-header */}
      <rect x={0} y={HEADER_HEIGHT} width={BLOCK_WIDTH} height={SUBHEADER_HEIGHT} fill="#f1f5f9" />
      <text x={BLOCK_WIDTH / 2} y={HEADER_HEIGHT + 11} textAnchor="middle" fontSize={9} fill="#64748b" fontStyle="italic">
        {collapsed ? `${visiblePins.length}/${pins.length} pins shown` : typeDesc}
      </text>

      {/* Pin rows */}
      {visiblePins.map((pin, idx) => {
        const rowY = HEADER_HEIGHT + SUBHEADER_HEIGHT + idx * PIN_ROW_HEIGHT;
        const isLeft = pin.direction === 'left' || pin.direction === 'top';
        const dotX = isLeft ? 0 : BLOCK_WIDTH;
        const dotCY = rowY + PIN_ROW_HEIGHT / 2;
        const isConnected = connectedPinIds?.has(`${node.id}:${pin.id}`) ?? false;
        const conn = getConnectionForPin(pin.id);
        const dotColor = pinDotColor(isConnected, conn?.colorCode);
        const rowFill = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        const origIdx = pins.indexOf(pin);

        return (
          <g key={pin.id}>
            <rect x={1} y={rowY} width={BLOCK_WIDTH - 2} height={PIN_ROW_HEIGHT} fill={rowFill} />

            {/* Pin label */}
            <text x={isLeft ? 16 : BLOCK_WIDTH - 16} y={dotCY + 3.5} textAnchor={isLeft ? 'start' : 'end'}
              fontSize={10} fill={isConnected ? '#1f2937' : '#94a3b8'} fontWeight={isConnected ? '500' : '400'}>
              {pin.label || `Pin ${origIdx + 1}`}
            </text>

            {/* Pin number */}
            <text x={isLeft ? BLOCK_WIDTH - 10 : 10} y={dotCY + 3.5} textAnchor={isLeft ? 'end' : 'start'}
              fontSize={9} fill="#94a3b8" fontFamily="monospace">
              {origIdx + 1}
            </text>

            {/* Connection dot */}
            <circle cx={dotX} cy={dotCY} r={PIN_DOT_RADIUS}
              fill={dotColor} stroke={isConnected ? '#ffffff' : '#e2e8f0'} strokeWidth={isConnected ? 2 : 1.5}
              style={{ cursor: onPinClick ? 'pointer' : 'default' }}
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); onPinClick?.(pin.id); }}
            />

            {isConnected && <circle cx={dotX} cy={dotCY} r={2} fill="#ffffff" pointerEvents="none" />}
          </g>
        );
      })}

      {/* Outer border on top */}
      <rect x={0} y={0} width={BLOCK_WIDTH} height={totalHeight} rx={BORDER_RADIUS} fill="none" stroke={borderColor} strokeWidth={borderWidth} pointerEvents="none" />
    </g>
  );
}
