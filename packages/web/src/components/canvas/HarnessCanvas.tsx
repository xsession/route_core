import React, { useCallback, useRef, useState } from 'react';
import { useHarnessStore } from '../../store/harness-store';
import { ConnectorNode } from './ConnectorNode';
import { WireConnection } from './WireConnection';

export function HarnessCanvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const { harness, routes, tool, selectNode, moveNode, selectedNodeId } = useHarnessStore();
  const [dragState, setDragState] = useState<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: harness.canvas.width, h: harness.canvas.height });

  const svgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (tool === 'select' && e.target === svgRef.current) {
      selectNode(null);
    }
  }, [tool, selectNode]);

  const handleNodeMouseDown = useCallback((nodeId: string, e: React.MouseEvent) => {
    if (tool !== 'select') return;
    e.stopPropagation();
    selectNode(nodeId);

    const node = harness.nodes.find(n => n.id === nodeId);
    if (!node || node.locked) return;

    const pt = svgPoint(e.clientX, e.clientY);
    setDragState({
      nodeId,
      offsetX: pt.x - node.position.x,
      offsetY: pt.y - node.position.y,
    });
  }, [tool, harness.nodes, selectNode, svgPoint]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState) return;
    const pt = svgPoint(e.clientX, e.clientY);
    moveNode(dragState.nodeId, {
      x: pt.x - dragState.offsetX,
      y: pt.y - dragState.offsetY,
    });
  }, [dragState, moveNode, svgPoint]);

  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    setViewBox(prev => {
      const newW = prev.w * factor;
      const newH = prev.h * factor;
      const dx = (prev.w - newW) / 2;
      const dy = (prev.h - newH) / 2;
      return { x: prev.x + dx, y: prev.y + dy, w: newW, h: newH };
    });
  }, []);

  return (
    <svg
      ref={svgRef}
      className="harness-canvas"
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      style={{ width: '100%', height: '100%', cursor: tool === 'pan' ? 'grab' : 'default' }}
    >
      <defs>
        <pattern id="grid" width={harness.canvas.gridSize} height={harness.canvas.gridSize} patternUnits="userSpaceOnUse">
          <path d={`M ${harness.canvas.gridSize} 0 L 0 0 0 ${harness.canvas.gridSize}`} fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
        </pattern>
      </defs>

      <rect x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h} fill="url(#grid)" />

      {/* Wires */}
      {routes.map(route => (
        <WireConnection key={route.connectionId} route={route} connections={harness.connections} />
      ))}

      {/* Components */}
      {harness.nodes.map(node => (
        <ConnectorNode
          key={node.id}
          node={node}
          selected={node.id === selectedNodeId}
          onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
        />
      ))}
    </svg>
  );
}
