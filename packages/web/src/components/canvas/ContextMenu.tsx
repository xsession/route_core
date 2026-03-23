import React, { useEffect, useRef } from 'react';
import { useHarnessStore } from '../../store/harness-store';

export function ContextMenu() {
  const ref = useRef<HTMLDivElement>(null);
  const {
    contextMenu,
    closeContextMenu,
    removeNode,
    disconnect,
    toggleCollapseNode,
    collapseAll,
    expandAll,
    openSignalEditor,
    deleteSelected,
    selectNode,
    selectedNodeIds,
    harness,
    collapsedNodes,
  } = useHarnessStore();

  // Close on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeContextMenu();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [contextMenu, closeContextMenu]);

  if (!contextMenu) return null;

  const { x, y, nodeId, connectionId } = contextMenu;
  const node = nodeId ? harness.nodes.find(n => n.id === nodeId) : null;
  const connection = connectionId ? harness.connections.find(c => c.id === connectionId) : null;
  const isCollapsed = nodeId ? collapsedNodes.has(nodeId) : false;
  const multiSelected = selectedNodeIds.size > 1;

  const item = (label: string, action: () => void, danger = false) => (
    <button
      className={`ctx-item${danger ? ' danger' : ''}`}
      onClick={() => { action(); closeContextMenu(); }}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: x, top: y }}
    >
      {node && (
        <>
          <div className="ctx-header">{node.label || 'Component'}</div>
          {item(isCollapsed ? '▼ Expand Pins' : '▶ Collapse Pins', () => toggleCollapseNode(nodeId!))}
          {item('✏ Edit Signals…', () => openSignalEditor(nodeId!))}
          {item('🗑 Delete', () => removeNode(nodeId!), true)}
          <div className="ctx-sep" />
        </>
      )}

      {connection && (
        <>
          <div className="ctx-header">Connection: {connection.signalLabel}</div>
          {item('🗑 Remove Connection', () => disconnect(connectionId!), true)}
          <div className="ctx-sep" />
        </>
      )}

      {multiSelected && (
        <>
          {item(`🗑 Delete ${selectedNodeIds.size} selected`, () => deleteSelected(), true)}
          <div className="ctx-sep" />
        </>
      )}

      {item('▶ Collapse All', () => collapseAll())}
      {item('▼ Expand All', () => expandAll())}
    </div>
  );
}
