import React, { useMemo, useState } from 'react';
import { DESIGNATOR_PREFIX } from '@route-core/core';
import type { ComponentCategory, Connection } from '@route-core/core';
import { useHarnessStore } from '../../store/harness-store';

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
      <button className="tree-section-header" onClick={() => setOpen((current) => !current)}>
        <span className="tree-chevron">{open ? 'v' : '>'}</span>
        <span className="tree-section-title">{title}</span>
        <span className="tree-section-count">{count}</span>
      </button>
      {open && <div className="tree-section-body">{children}</div>}
    </div>
  );
}

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

  const node = harness.nodes.find((item) => item.id === selectedPinId.nodeId);
  if (!node) return null;

  const pin = node.component.pins.find((item) => item.id === selectedPinId.pinId);
  if (!pin) return null;

  const pinIndex = node.component.pins.indexOf(pin);
  const designator = node.label || `${DESIGNATOR_PREFIX[node.component.category as ComponentCategory] ?? 'U'}?`;

  const pinConnections = harness.connections.filter(
    (connection) =>
      (connection.from.componentId === selectedPinId.nodeId && connection.from.pinId === selectedPinId.pinId) ||
      (connection.to.componentId === selectedPinId.nodeId && connection.to.pinId === selectedPinId.pinId),
  );

  const getOtherEnd = (connection: Connection) => {
    const isFromSide =
      connection.from.componentId === selectedPinId.nodeId && connection.from.pinId === selectedPinId.pinId;
    const endpoint = isFromSide ? connection.to : connection.from;
    const otherNode = harness.nodes.find((item) => item.id === endpoint.componentId);
    const otherPin = otherNode?.component.pins.find((item) => item.id === endpoint.pinId);
    const otherPinIndex = otherNode?.component.pins.indexOf(otherPin!) ?? -1;
    return `${otherNode?.label || '?'}:${otherPinIndex + 1}`;
  };

  return (
    <div className="pin-editor">
      <div className="pin-editor-header">
        <div className="pin-editor-title">
          <span className="pin-editor-designator">{designator}</span>
          <span className="pin-editor-pin">Pin {pinIndex + 1}</span>
          {pin.label && <span className="pin-editor-label">{pin.label}</span>}
        </div>
        <button className="btn-close-sm" onClick={clearPinSelection} aria-label="Close pin details">
          x
        </button>
      </div>

      <div className="pin-editor-connections">
        <div className="pin-editor-section-header">
          <span>Connections ({pinConnections.length})</span>
          <button
            className="btn-add-conn"
            onClick={() => startConnection({ componentId: selectedPinId.nodeId, pinId: selectedPinId.pinId })}
          >
            Add
          </button>
        </div>

        {pinConnections.length === 0 && <p className="pin-editor-empty">No connections on this pin yet.</p>}

        {pinConnections.map((connection) => {
          const cable = connection.cableRef ? harness.cables.find((item) => item.id === connection.cableRef) : null;

          return (
            <div className="pin-conn-item" key={connection.id}>
              <div className="pin-conn-row">
                <span className="pin-conn-color" style={{ backgroundColor: connection.colorCode || '#6b7280' }} />
                <span className="pin-conn-signal">{connection.signalLabel}</span>
                <span className="pin-conn-target">To {getOtherEnd(connection)}</span>
              </div>

              <div className="pin-conn-details">
                <div className="pin-conn-badges">
                  {connection.length != null && <span className="wire-badge">{connection.length} mm</span>}
                  {cable && (
                    <span className="wire-badge cable">
                      {cable.name} core {(connection.conductorIndex ?? 0) + 1}
                    </span>
                  )}
                </div>

                <input
                  className="pin-conn-signal-input"
                  value={connection.signalLabel}
                  onChange={(event) => updateConnectionProps(connection.id, { signalLabel: event.target.value })}
                  placeholder="Signal label"
                />

                <div className="pin-conn-cable-row">
                  <select
                    className="pin-conn-cable-select"
                    value={connection.cableRef || ''}
                    onChange={(event) => {
                      if (event.target.value) {
                        assignCableToConnection(connection.id, event.target.value, connection.conductorIndex ?? 0);
                        return;
                      }
                      unassignCableFromConnection(connection.id);
                    }}
                  >
                    <option value="">No cable</option>
                    {harness.cables.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>

                  {connection.cableRef && cable && (
                    <select
                      className="pin-conn-conductor-select"
                      value={connection.conductorIndex ?? 0}
                      onChange={(event) =>
                        assignCableToConnection(connection.id, connection.cableRef!, Number(event.target.value))
                      }
                    >
                      {cable.conductors.map((conductor, index) => (
                        <option key={index} value={index}>
                          {conductor.label || `Core ${index + 1}`}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="pin-conn-actions">
                  <button className="btn-xs danger" onClick={() => disconnect(connection.id)}>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Sidebar({
  isCompact = false,
  isOpen = true,
  onRequestClose,
}: {
  isCompact?: boolean;
  isOpen?: boolean;
  onRequestClose?: () => void;
}) {
  const { harness, selectNode, selectedNodeId } = useHarnessStore();

  const wireBundles = useMemo(() => {
    const groups = new Map<string, typeof harness.connections>();

    for (const connection of harness.connections) {
      const pair = [connection.from.componentId, connection.to.componentId].sort().join('|');
      if (!groups.has(pair)) groups.set(pair, []);
      groups.get(pair)!.push(connection);
    }

    return Array.from(groups.entries()).map(([key, connections]) => {
      const [idA, idB] = key.split('|');
      const labelA = harness.nodes.find((node) => node.id === idA)?.label ?? '?';
      const labelB = harness.nodes.find((node) => node.id === idB)?.label ?? '?';
      return { key, labelA, labelB, connections };
    });
  }, [harness]);

  return (
    <aside className={`sidebar${isCompact ? ' compact-panel' : ''}${isOpen ? ' open' : ''}`}>
      <div className="sidebar-header">
        <div>
          <span className="sidebar-title">{harness.name || 'Harness'}</span>
          <span className="sidebar-subtitle">{harness.description || 'Wire harness design'}</span>
        </div>
        {isCompact && onRequestClose && (
          <button className="toolbar-btn compact-close-btn" onClick={onRequestClose}>
            Close
          </button>
        )}
      </div>

      <div className="sidebar-tree">
        <TreeSection title="Components" count={harness.nodes.length}>
          {harness.nodes.map((node) => {
            const designator = node.label || `${DESIGNATOR_PREFIX[node.component.category as ComponentCategory] ?? 'U'}?`;
            const isActive = selectedNodeId === node.id;

            return (
              <button key={node.id} className={`tree-item${isActive ? ' active' : ''}`} onClick={() => selectNode(node.id)}>
                <span className="tree-item-icon">C</span>
                <span className="tree-item-label">{designator}</span>
                <span className="tree-item-meta">{node.component.pins.length} pins</span>
              </button>
            );
          })}
        </TreeSection>

        <TreeSection title="Bundles" count={wireBundles.length}>
          {wireBundles.map((bundle) => (
            <div key={bundle.key} className="tree-item bundle">
              <span className="tree-item-icon">W</span>
              <span className="tree-item-label">
                {bundle.labelA} to {bundle.labelB}
              </span>
              <span className="tree-item-meta">{bundle.connections.length} wires</span>
            </div>
          ))}
          {wireBundles.length === 0 && <p className="tree-empty">No wire bundles yet.</p>}
        </TreeSection>

        <TreeSection title="Cables" count={harness.cables.length}>
          {harness.cables.map((cable) => {
            const assignedCount = harness.connections.filter((connection) => connection.cableRef === cable.id).length;

            return (
              <div key={cable.id} className="tree-item cable">
                <span className="tree-item-icon">K</span>
                <span className="tree-item-label">{cable.name}</span>
                <span className="tree-item-meta">
                  {cable.conductors.length} cores / {assignedCount} assigned
                </span>
              </div>
            );
          })}
          {harness.cables.length === 0 && <p className="tree-empty">No cables in this harness.</p>}
        </TreeSection>
      </div>

      <PinEditorPanel />
    </aside>
  );
}
