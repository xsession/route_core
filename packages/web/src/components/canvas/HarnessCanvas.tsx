import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHarnessStore } from '../../store/harness-store';
import { ConnectorNode, BLOCK_WIDTH, HEADER_HEIGHT, SUBHEADER_HEIGHT, PIN_ROW_HEIGHT } from './ConnectorNode';
import { CableBlock, CABLE_BLOCK_WIDTH, CABLE_HEADER_HEIGHT, CABLE_CONDUCTOR_HEIGHT } from './CableBlock';
import { WireConnection } from './WireConnection';

export function HarnessCanvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const {
    harness,
    tool,
    selectNode,
    moveNode,
    moveNodes,
    removeNode,
    selectedNodeId,
    selectedNodeIds,
    toggleSelectNode,
    clearSelection,
    deleteSelected,
    startDrag,
    endDrag,
    connectingFrom,
    startConnection,
    completeConnection,
    cancelConnection,
    setTool,
    boxSelectStart,
    boxSelectEnd,
    boxSelectDirection,
    startBoxSelect,
    updateBoxSelect,
    endBoxSelect,
    cancelBoxSelect,
    openContextMenu,
    closeContextMenu,
    undo,
    redo,
    collapsedNodes,
  } = useHarnessStore();

  const [dragState, setDragState] = useState<{
    nodeId: string;
    offsets: Map<string, { dx: number; dy: number }>;
  } | null>(null);
  const [panState, setPanState] = useState<{ startX: number; startY: number; origVB: { x: number; y: number; w: number; h: number } } | null>(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: harness.canvas.width, h: harness.canvas.height });
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // ── Compute connected pin IDs ────────────────────────────
  const connectedPinIds = useMemo(() => {
    const ids = new Set<string>();
    for (const conn of harness.connections) {
      ids.add(`${conn.from.componentId}:${conn.from.pinId}`);
      ids.add(`${conn.to.componentId}:${conn.to.pinId}`);
    }
    return ids;
  }, [harness.connections]);

  // ── Compute visual routes (pin-accurate, recomputed every render like draw.io) ──
  // No useMemo: routes must always reflect current node positions during drag.
  // Build a lookup map for O(1) node access instead of O(n) find per connection.
  const nodeMap = new Map(harness.nodes.map(n => [n.id, n]));
  const visualRoutes = harness.connections.map(conn => {
    const fromNode = nodeMap.get(conn.from.componentId);
    const toNode = nodeMap.get(conn.to.componentId);
    if (!fromNode || !toNode) return { connectionId: conn.id, path: [] };

    const fromPinIdx = fromNode.component.pins.findIndex(p => p.id === conn.from.pinId);
    const toPinIdx = toNode.component.pins.findIndex(p => p.id === conn.to.pinId);
    if (fromPinIdx === -1 || toPinIdx === -1) return { connectionId: conn.id, path: [] };

    const fromPin = fromNode.component.pins[fromPinIdx];
    const toPin = toNode.component.pins[toPinIdx];

    // Get visual pin positions matching ConnectorNode SVG layout
    const fromIsLeft = fromPin.direction === 'left' || fromPin.direction === 'top';
    const toIsLeft = toPin.direction === 'left' || toPin.direction === 'top';

    const fromX = fromNode.position.x + (fromIsLeft ? 0 : BLOCK_WIDTH);
    const fromY = fromNode.position.y + HEADER_HEIGHT + SUBHEADER_HEIGHT + fromPinIdx * PIN_ROW_HEIGHT + PIN_ROW_HEIGHT / 2;
    const toX = toNode.position.x + (toIsLeft ? 0 : BLOCK_WIDTH);
    const toY = toNode.position.y + HEADER_HEIGHT + SUBHEADER_HEIGHT + toPinIdx * PIN_ROW_HEIGHT + PIN_ROW_HEIGHT / 2;

    return {
      connectionId: conn.id,
      path: [{ x: fromX, y: fromY }, { x: toX, y: toY }],
      fromDir: fromIsLeft ? 'left' as const : 'right' as const,
      toDir: toIsLeft ? 'left' as const : 'right' as const,
    };
  });

  // ── SVG coordinate helper ────────────────────────────────
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

  // ── Snap helper ──────────────────────────────────────────
  const snap = useCallback(
    (pos: { x: number; y: number }) => {
      if (!harness.canvas.snapToGrid) return pos;
      const g = harness.canvas.gridSize;
      return {
        x: Math.round(pos.x / g) * g,
        y: Math.round(pos.y / g) * g,
      };
    },
    [harness.canvas.snapToGrid, harness.canvas.gridSize],
  );

  // ── Mouse down on canvas background ─────────────────────
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      closeContextMenu();

      if (tool === 'pan') {
        const pt = svgPoint(e.clientX, e.clientY);
        setPanState({ startX: pt.x, startY: pt.y, origVB: { ...viewBox } });
        return;
      }

      // Background click — start box select or deselect
      if (tool === 'select' && (e.target === svgRef.current || (e.target as SVGElement).classList?.contains('canvas-bg'))) {
        const pt = svgPoint(e.clientX, e.clientY);
        startBoxSelect(pt);
        if (!e.shiftKey && !e.ctrlKey) {
          clearSelection();
        }
      }
    },
    [tool, svgPoint, viewBox, clearSelection, startBoxSelect, closeContextMenu],
  );

  // ── Context menu ────────────────────────────────────────
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const pt = svgPoint(e.clientX, e.clientY);
      // Find which node is under the click
      let hitNodeId: string | undefined;
      for (const node of harness.nodes) {
        const nh = HEADER_HEIGHT + SUBHEADER_HEIGHT + node.component.pins.length * PIN_ROW_HEIGHT;
        if (pt.x >= node.position.x && pt.x <= node.position.x + BLOCK_WIDTH &&
            pt.y >= node.position.y && pt.y <= node.position.y + nh) {
          hitNodeId = node.id;
          break;
        }
      }
      openContextMenu({ x: e.clientX, y: e.clientY }, hitNodeId);
    },
    [harness.nodes, svgPoint, openContextMenu],
  );

  // ── Node mouse down (drag / multi-select) ───────────────
  const handleNodeMouseDown = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      if (tool !== 'select') return;
      e.stopPropagation();

      // Shift/Ctrl click toggles multi-select
      if (e.shiftKey || e.ctrlKey) {
        toggleSelectNode(nodeId);
        return;
      }

      // If clicking a node already in multi-selection, keep multi-selection for group drag
      if (!selectedNodeIds.has(nodeId)) {
        selectNode(nodeId);
      }

      const node = harness.nodes.find(n => n.id === nodeId);
      if (!node || node.locked) return;

      const pt = svgPoint(e.clientX, e.clientY);

      // Build offsets for all selected nodes (for group drag)
      const dragIds = selectedNodeIds.has(nodeId) && selectedNodeIds.size > 1
        ? selectedNodeIds
        : new Set([nodeId]);

      const offsets = new Map<string, { dx: number; dy: number }>();
      for (const nid of dragIds) {
        const n = harness.nodes.find(nd => nd.id === nid);
        if (n && !n.locked) {
          offsets.set(nid, { dx: pt.x - n.position.x, dy: pt.y - n.position.y });
        }
      }

      startDrag();
      setDragState({ nodeId, offsets });
    },
    [tool, harness.nodes, selectNode, toggleSelectNode, selectedNodeIds, svgPoint, startDrag],
  );

  // ── Mouse move (drag / pan / box-select / connecting line) ─
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const pt = svgPoint(e.clientX, e.clientY);

      // Track mouse for the connecting visual
      if (connectingFrom) {
        setMousePos(pt);
      }

      // Pan
      if (panState) {
        const dx = panState.startX - pt.x;
        const dy = panState.startY - pt.y;
        setViewBox({
          x: panState.origVB.x + dx,
          y: panState.origVB.y + dy,
          w: panState.origVB.w,
          h: panState.origVB.h,
        });
        return;
      }

      // Box select
      if (boxSelectStart && !dragState) {
        updateBoxSelect(pt);
        return;
      }

      // Drag node(s)
      if (dragState) {
        const moves: Array<{ nodeId: string; pos: { x: number; y: number } }> = [];
        for (const [nid, off] of dragState.offsets) {
          moves.push({ nodeId: nid, pos: snap({ x: pt.x - off.dx, y: pt.y - off.dy }) });
        }
        if (moves.length === 1) {
          moveNode(moves[0].nodeId, moves[0].pos);
        } else {
          moveNodes(moves);
        }
      }
    },
    [dragState, panState, connectingFrom, boxSelectStart, moveNode, moveNodes, svgPoint, snap, updateBoxSelect],
  );

  // ── Mouse up ────────────────────────────────────────────
  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (dragState) {
        endDrag();
        setDragState(null);
      }
      if (boxSelectStart) {
        endBoxSelect(e.shiftKey || e.ctrlKey);
      }
      setPanState(null);
    },
    [dragState, boxSelectStart, endDrag, endBoxSelect],
  );

  // ── Zoom ────────────────────────────────────────────────
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

  // ── Pin click handler (connect mode or pin selection) ──
  const handlePinClick = useCallback(
    (nodeId: string, pinId: string) => {
      if (tool === 'connect' || connectingFrom) {
        if (!connectingFrom) {
          startConnection({ componentId: nodeId, pinId });
        } else {
          completeConnection({ componentId: nodeId, pinId });
        }
        return;
      }
      // In select mode, select pin for pin editor
      if (tool === 'select') {
        useHarnessStore.getState().selectPin(nodeId, pinId);
      }
    },
    [tool, connectingFrom, startConnection, completeConnection],
  );

  // ── Compute source pin position for connecting visual ───
  const connectingLineStart = useMemo(() => {
    if (!connectingFrom) return null;
    const node = harness.nodes.find(n => n.id === connectingFrom.componentId);
    if (!node) return null;
    const pinIdx = node.component.pins.findIndex(p => p.id === connectingFrom.pinId);
    if (pinIdx === -1) return null;
    const pin = node.component.pins[pinIdx];
    const isLeft = pin.direction === 'left' || pin.direction === 'top';
    const circleX = isLeft ? 0 : BLOCK_WIDTH;
    const circleCY = HEADER_HEIGHT + SUBHEADER_HEIGHT + pinIdx * PIN_ROW_HEIGHT + PIN_ROW_HEIGHT / 2;
    return {
      x: node.position.x + circleX,
      y: node.position.y + circleCY,
    };
  }, [connectingFrom, harness.nodes]);

  // ── Keyboard shortcuts ──────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Ctrl+Z / Ctrl+Y undo/redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); redo(); return; }
      // Ctrl+A select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        useHarnessStore.getState().selectNodes(harness.nodes.map(n => n.id));
        return;
      }

      switch (e.key) {
        case 'v':
        case 'V':
          setTool('select');
          break;
        case 'c':
        case 'C':
          if (!e.ctrlKey && !e.metaKey) setTool('connect');
          break;
        case 'h':
        case 'H':
          setTool('pan');
          break;
        case 'Escape':
          if (connectingFrom) cancelConnection();
          else if (boxSelectStart) cancelBoxSelect();
          else clearSelection();
          break;
        case 'Delete':
        case 'Backspace':
          deleteSelected();
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setTool, connectingFrom, cancelConnection, clearSelection, deleteSelected, undo, redo, boxSelectStart, cancelBoxSelect, harness.nodes]);

  // ── Cursor style ────────────────────────────────────────
  let cursor = 'default';
  if (tool === 'pan') cursor = panState ? 'grabbing' : 'grab';
  if (tool === 'connect') cursor = 'crosshair';
  if (boxSelectStart) cursor = 'crosshair';

  // ── Box select rectangle ────────────────────────────────
  const boxRect = useMemo(() => {
    if (!boxSelectStart || !boxSelectEnd) return null;
    return {
      x: Math.min(boxSelectStart.x, boxSelectEnd.x),
      y: Math.min(boxSelectStart.y, boxSelectEnd.y),
      w: Math.abs(boxSelectEnd.x - boxSelectStart.x),
      h: Math.abs(boxSelectEnd.y - boxSelectStart.y),
    };
  }, [boxSelectStart, boxSelectEnd]);

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
      onContextMenu={handleContextMenu}
      style={{ width: '100%', height: '100%', cursor }}
    >
      <defs>
        <pattern id="grid" width={harness.canvas.gridSize} height={harness.canvas.gridSize} patternUnits="userSpaceOnUse">
          <path d={`M ${harness.canvas.gridSize} 0 L 0 0 0 ${harness.canvas.gridSize}`} fill="none" stroke="#334155" strokeWidth="0.3" />
        </pattern>
      </defs>

      {/* Background – dark canvas */}
      <rect
        className="canvas-bg"
        x={viewBox.x}
        y={viewBox.y}
        width={viewBox.w}
        height={viewBox.h}
        fill={harness.canvas.showGrid ? 'url(#grid)' : '#1e293b'}
      />
      {harness.canvas.showGrid && (
        <rect
          className="canvas-bg"
          x={viewBox.x}
          y={viewBox.y}
          width={viewBox.w}
          height={viewBox.h}
          fill="#1e293b"
          style={{ mixBlendMode: 'multiply' }}
        />
      )}

      {/* Wires */}
      {visualRoutes.map(route => (
        <WireConnection key={route.connectionId} route={route} connections={harness.connections} />
      ))}

      {/* Cable blocks */}
      {harness.cables.map((cable, idx) => {
        // Position cables after nodes, stacked vertically
        const cablePos = (cable as any)._position || { x: 40, y: 40 + idx * 120 };
        const assignedCount = harness.connections.filter(c => c.cableRef === cable.id).length;
        return (
          <CableBlock
            key={cable.id}
            cable={cable}
            position={cablePos}
            selected={false}
            onMouseDown={() => {}}
            assignedConnections={assignedCount}
          />
        );
      })}

      {/* Components */}
      {harness.nodes.map(node => (
        <ConnectorNode
          key={node.id}
          node={node}
          selected={selectedNodeIds.has(node.id) || node.id === selectedNodeId}
          onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
          onPinClick={(pinId) => handlePinClick(node.id, pinId)}
          connectedPinIds={connectedPinIds}
          collapsed={collapsedNodes.has(node.id)}
          connections={harness.connections}
        />
      ))}

      {/* Box select rectangle */}
      {boxRect && boxRect.w > 2 && boxRect.h > 2 && (
        <rect
          x={boxRect.x}
          y={boxRect.y}
          width={boxRect.w}
          height={boxRect.h}
          fill={boxSelectDirection === 'right' ? 'rgba(59,130,246,0.08)' : 'rgba(34,197,94,0.08)'}
          stroke={boxSelectDirection === 'right' ? '#3b82f6' : '#22c55e'}
          strokeWidth={1}
          strokeDasharray={boxSelectDirection === 'right' ? '6 3' : '3 3'}
          pointerEvents="none"
        />
      )}

      {/* Connecting visual – dashed line from source pin to mouse */}
      {connectingFrom && connectingLineStart && mousePos && (
        <line
          x1={connectingLineStart.x}
          y1={connectingLineStart.y}
          x2={mousePos.x}
          y2={mousePos.y}
          stroke="#3b82f6"
          strokeWidth={2}
          strokeDasharray="6 3"
          pointerEvents="none"
        />
      )}
    </svg>
  );
}
