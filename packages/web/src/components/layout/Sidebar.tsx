import React, { useState, useMemo } from 'react';
import { BomGenerator, type BomSummary, DESIGNATOR_PREFIX } from '@route-core/core';
import type { Connection, ComponentCategory } from '@route-core/core';
import { useHarnessStore } from '../../store/harness-store';

const bomGenerator = new BomGenerator();

// ─── Tree Section Header ───────────────────────────────
function TreeSection({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="tree-section">
      <button className="tree-section-header" onClick={() => setOpen(!open)}>
        <span className="tree-chevron">{open ? '▾' : '▸'}</span>
        <span className="tree-section-title">{title}</span>
        <span className="tree-section-count">{count}</span>
      </button>
      {open && <div className="tree-section-body">{children}</div>}
    </div>
  );
}

// ─── Pin Editor Panel ──────────────────────────────────
function PinEditorPanel() {
  const {
    harness,
    selectedPinId,
    clearPinSelection,
    updateConnectionProps,
    disconnect,
    assignCableToConnection,
    unassignCableFromConnection,
    startConnection,
  } = useHarnessStore();

  if (!selectedPinId) return null;

  const node = harness.nodes.find(n => n.id === selectedPinId.nodeId);
  if (!node) return null;

  const pin = node.component.pins.find(p => p.id === selectedPinId.pinId);
  if (!pin) return null;

  const pinIdx = node.component.pins.indexOf(pin);
  const designator = node.label || `${DESIGNATOR_PREFIX[node.component.category as ComponentCategory] ?? 'U'}?`;

  // Find connections involving this pin
  const pinConnections = harness.connections.filter(
    c =>
      (c.from.componentId === selectedPinId.nodeId && c.from.pinId === selectedPinId.pinId) ||
      (c.to.componentId === selectedPinId.nodeId && c.to.pinId === selectedPinId.pinId)
  );

  const getOtherEnd = (conn: Connection) => {
    const isFrom = conn.from.componentId === selectedPinId!.nodeId && conn.from.pinId === selectedPinId!.pinId;
    const ep = isFrom ? conn.to : conn.from;
    const otherNode = harness.nodes.find(n => n.id === ep.componentId);
    const otherDesig = otherNode?.label || '?';
    const otherPin = otherNode?.component.pins.find(p => p.id === ep.pinId);
    const otherPinIdx = otherNode?.component.pins.indexOf(otherPin!) ?? -1;
    return { label: `${otherDesig}:${otherPinIdx + 1}`, node: otherNode };
  };

  return (
    <div className="pin-editor">
      <div className="pin-editor-header">
        <div className="pin-editor-title">
          <span className="pin-editor-designator">{designator}</span>
          <span className="pin-editor-pin">Pin {pinIdx + 1}</span>
          {pin.label && <span className="pin-editor-label">{pin.label}</span>}
        </div>
        <button className="btn-close-sm" onClick={clearPinSelection}>✕</button>
      </div>

      <div className="pin-editor-connections">
        <div className="pin-editor-section-header">
          <span>Connections ({pinConnections.length})</span>
          <button
            className="btn-add-conn"
            onClick={() => startConnection({ componentId: selectedPinId!.nodeId, pinId: selectedPinId!.pinId })}
          >
            + Add
          </button>
        </div>

        {pinConnections.length === 0 && (
          <p className="pin-editor-empty">No connections on this pin</p>
        )}

        {pinConnections.map(conn => {
          const other = getOtherEnd(conn);
          const cable = conn.cableRef ? harness.cables.find(c => c.id === conn.cableRef) : null;

          return (
            <div className="pin-conn-item" key={conn.id}>
              <div className="pin-conn-row">
                <span
                  className="pin-conn-color"
                  style={{ backgroundColor: conn.colorCode || '#6b7280' }}
                />
                <span className="pin-conn-signal">{conn.signalLabel}</span>
                <span className="pin-conn-target">→ {other.label}</span>
              </div>

              <div className="pin-conn-details">
                {/* Wire type badges */}
                <div className="pin-conn-badges">
                  {conn.length != null && (
                    <span className="wire-badge">{conn.length}mm</span>
                  )}
                  {cable && (
                    <span className="wire-badge cable">{cable.name}:{(conn.conductorIndex ?? 0) + 1}</span>
                  )}
                </div>

                {/* Signal edit */}
                <input
                  className="pin-conn-signal-input"
                  value={conn.signalLabel}
                  onChange={e => updateConnectionProps(conn.id, { signalLabel: e.target.value })}
                  placeholder="Signal label"
                />

                {/* Cable assignment */}
                <div className="pin-conn-cable-row">
                  <select
                    className="pin-conn-cable-select"
                    value={conn.cableRef || ''}
                    onChange={e => {
                      if (e.target.value) {
                        assignCableToConnection(conn.id, e.target.value, conn.conductorIndex ?? 0);
                      } else {
                        unassignCableFromConnection(conn.id);
                      }
                    }}
                  >
                    <option value="">No cable</option>
                    {harness.cables.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>

                  {conn.cableRef && cable && (
                    <select
                      className="pin-conn-conductor-select"
                      value={conn.conductorIndex ?? 0}
                      onChange={e => assignCableToConnection(conn.id, conn.cableRef!, Number(e.target.value))}
                    >
                      {cable.conductors.map((cond, i) => (
                        <option key={i} value={i}>{cond.label || `Core ${i + 1}`}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Actions */}
                <div className="pin-conn-actions">
                  <button className="btn-xs danger" onClick={() => disconnect(conn.id)}>Remove</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Sidebar ──────────────────────────────────────
export function Sidebar() {
  const { harness, selectNode, selectedNodeId, selectPin, selectedPinId } = useHarnessStore();

  // Group connections into wire bundles by component pair
  const wireBundles = useMemo(() => {
    const groups = new Map<string, typeof harness.connections>();
    for (const conn of harness.connections) {
      const pair = [conn.from.componentId, conn.to.componentId].sort().join('|');
      if (!groups.has(pair)) groups.set(pair, []);
      groups.get(pair)!.push(conn);
    }
    return Array.from(groups.entries()).map(([key, conns]) => {
      const [idA, idB] = key.split('|');
      const labelA = harness.nodes.find(n => n.id === idA)?.label ?? '?';
      const labelB = harness.nodes.find(n => n.id === idB)?.label ?? '?';
      return { key, labelA, labelB, connections: conns };
    });
  }, [harness]);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">{harness.name || 'Harness'}</span>
        <span className="sidebar-subtitle">{harness.description || 'Wire harness design'}</span>
      </div>

      <div className="sidebar-tree">
        {/* Components section */}
        <TreeSection title="Components" count={harness.nodes.length}>
          {harness.nodes.map(node => {
            const designator = node.label || `${DESIGNATOR_PREFIX[node.component.category as ComponentCategory] ?? 'U'}?`;
            const isActive = selectedNodeId === node.id;
            return (
              <button
                key={node.id}
                className={`tree-item${isActive ? ' active' : ''}`}
                onClick={() => selectNode(node.id)}
              >
                <span className="tree-item-icon">🔌</span>
                <span className="tree-item-label">{designator}</span>
                <span className="tree-item-meta">{node.component.pins.length}p</span>
              </button>
            );
          })}
        </TreeSection>

        {/* Bundles section */}
        <TreeSection title="Bundles" count={wireBundles.length}>
          {wireBundles.map(bundle => (
            <div key={bundle.key} className="tree-item bundle">
              <span className="tree-item-icon">〰</span>
              <span className="tree-item-label">{bundle.labelA} ↔ {bundle.labelB}</span>
              <span className="tree-item-meta">{bundle.connections.length}w</span>
            </div>
          ))}
          {wireBundles.length === 0 && (
            <p className="tree-empty">No wire bundles</p>
          )}
        </TreeSection>

        {/* Cables section */}
        <TreeSection title="Cables" count={harness.cables.length}>
          {harness.cables.map(cable => {
            const assignedCount = harness.connections.filter(c => c.cableRef === cable.id).length;
            return (
              <div key={cable.id} className="tree-item cable">
                <span className="tree-item-icon">🔗</span>
                <span className="tree-item-label">{cable.name}</span>
                <span className="tree-item-meta">{cable.conductors.length}c · {assignedCount} assigned</span>
              </div>
            );
          })}
          {harness.cables.length === 0 && (
            <p className="tree-empty">No cables in harness</p>
          )}
        </TreeSection>
      </div>

      {/* Pin editor panel at bottom */}
      <PinEditorPanel />
    </aside>
  );
}
