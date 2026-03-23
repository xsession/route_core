import React, { useState, useMemo } from 'react';
import { useHarnessStore, type SignalEdit } from '../../store/harness-store';

export function SignalEditorDialog() {
  const {
    editingSignalsNodeId,
    closeSignalEditor,
    updateSignals,
    harness,
  } = useHarnessStore();

  const node = useMemo(() => {
    if (!editingSignalsNodeId) return null;
    return harness.nodes.find(n => n.id === editingSignalsNodeId) ?? null;
  }, [editingSignalsNodeId, harness.nodes]);

  // Build initial edits from current connections
  const connections = useMemo(() => {
    if (!editingSignalsNodeId) return [];
    return harness.connections.filter(
      c => c.from.componentId === editingSignalsNodeId || c.to.componentId === editingSignalsNodeId,
    );
  }, [editingSignalsNodeId, harness.connections]);

  const [edits, setEdits] = useState<Record<string, string>>({});

  // Reset edits when node changes
  React.useEffect(() => {
    if (editingSignalsNodeId) {
      const init: Record<string, string> = {};
      for (const conn of connections) {
        const pinId = conn.from.componentId === editingSignalsNodeId
          ? conn.from.pinId
          : conn.to.pinId;
        init[pinId] = conn.signalLabel;
      }
      setEdits(init);
    }
  }, [editingSignalsNodeId, connections]);

  if (!node || !editingSignalsNodeId) return null;

  const handleSave = () => {
    const signalEdits: SignalEdit[] = Object.entries(edits).map(([pinId, label]) => ({ pinId, label }));
    updateSignals(editingSignalsNodeId, signalEdits);
    closeSignalEditor();
  };

  // Find connected pin info
  const getPinConnection = (pinId: string) => {
    return connections.find(
      c => (c.from.componentId === editingSignalsNodeId && c.from.pinId === pinId)
        || (c.to.componentId === editingSignalsNodeId && c.to.pinId === pinId),
    );
  };

  // Get the other end label
  const getOtherEnd = (conn: typeof connections[0]) => {
    const otherId = conn.from.componentId === editingSignalsNodeId ? conn.to.componentId : conn.from.componentId;
    const otherPin = conn.from.componentId === editingSignalsNodeId ? conn.to.pinId : conn.from.pinId;
    const otherNode = harness.nodes.find(n => n.id === otherId);
    return `${otherNode?.label ?? '?'}:${otherPin}`;
  };

  return (
    <div className="dialog-overlay" onClick={closeSignalEditor}>
      <div className="signal-editor" onClick={e => e.stopPropagation()}>
        <div className="signal-editor-header">
          <h3>Edit Signals — {node.label}</h3>
          <button className="btn-close" onClick={closeSignalEditor}>✕</button>
        </div>

        <div className="signal-editor-body">
          <table className="signal-table">
            <thead>
              <tr>
                <th>Pin</th>
                <th>Signal</th>
                <th>Connected To</th>
              </tr>
            </thead>
            <tbody>
              {node.component.pins.map((pin, idx) => {
                const conn = getPinConnection(pin.id);
                return (
                  <tr key={pin.id}>
                    <td className="pin-num">{idx + 1} — {pin.label}</td>
                    <td>
                      {conn ? (
                        <input
                          type="text"
                          className="signal-input"
                          value={edits[pin.id] ?? conn.signalLabel}
                          onChange={e => setEdits({ ...edits, [pin.id]: e.target.value })}
                        />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="text-muted">
                      {conn ? getOtherEnd(conn) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="signal-editor-footer">
          <button className="btn-secondary" onClick={closeSignalEditor}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>Save Signals</button>
        </div>
      </div>
    </div>
  );
}
