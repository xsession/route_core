import React from 'react';
import { HarnessCanvas } from '../canvas/HarnessCanvas';
import { useHarnessStore } from '../../store/harness-store';
import { ExportManager, type CanvasState } from '@route-core/core';
import { Sidebar } from './Sidebar';
import { PartsLibrary } from '../parts/PartsLibrary';
import { ComponentCreatorPanel } from '../creators/ComponentCreator';
import { CableCreatorPanel } from '../creators/CableCreator';
import { WireLibrary } from '../creators/WireLibrary';
import { ContextMenu } from '../canvas/ContextMenu';
import { SignalEditorDialog } from '../canvas/SignalEditorDialog';

const exportManager = new ExportManager();

// ---------------------------------------------------------------------------
// MainToolbar
// ---------------------------------------------------------------------------
function MainToolbar() {
  const {
    harness,
    harnessModified,
    tool,
    setTool,
    newHarness,
    saveRevision,
    undo,
    redo,
    undoStack,
    redoStack,
    validate,
    bulkConnect,
    toggleLabels,
    fitToView,
  } = useHarnessStore();

  const [exportOpen, setExportOpen] = React.useState(false);

  const handleExportJson = () => {
    const result = exportManager.exportJson(harness);
    downloadFile(result.content, result.filename, result.mimeType);
    setExportOpen(false);
  };

  const handleExportSvg = () => {
    const result = exportManager.exportSvg(harness);
    downloadFile(result.content, result.filename, result.mimeType);
    setExportOpen(false);
  };

  const handleExportNetlist = () => {
    const result = exportManager.exportNetlist(harness);
    downloadFile(result.content, result.filename, result.mimeType);
    setExportOpen(false);
  };

  const handleImportJson = () => {
    setExportOpen(false);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const imported = exportManager.importJson(text);
      useHarnessStore.getState().loadHarness(imported);
    };
    input.click();
  };

  return (
    <div className="main-toolbar dark">
      {/* Left — harness identity */}
      <div className="toolbar-group">
        <span className="toolbar-brand">Route Core</span>
        <span className="toolbar-separator-dot">·</span>
        <span style={{ fontWeight: 500, fontSize: 13 }}>{harness.name}</span>
        {harnessModified && <span className="modified-dot" title="Unsaved changes" />}
      </div>

      <div className="toolbar-separator" />

      {/* Center — drawing tools */}
      <div className="toolbar-group">
        <button
          className={`toolbar-btn${tool === 'select' ? ' active' : ''}`}
          onClick={() => setTool('select')}
          title="Select (V)"
        >
          ▹ Select
        </button>
        <button
          className={`toolbar-btn${tool === 'connect' ? ' active' : ''}`}
          onClick={() => setTool('connect')}
          title="Connect (C)"
        >
          ⟶ Connect
        </button>
        <button
          className={`toolbar-btn${tool === 'pan' ? ' active' : ''}`}
          onClick={() => setTool('pan')}
          title="Pan (H)"
        >
          ✋ Pan
        </button>
      </div>

      <div className="toolbar-separator" />

      {/* Collapse/Expand */}
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={() => useHarnessStore.getState().collapseAll()} title="Collapse all nodes">
          ▶ Collapse
        </button>
        <button className="toolbar-btn" onClick={() => useHarnessStore.getState().expandAll()} title="Expand all nodes">
          ▼ Expand
        </button>
      </div>

      <div className="toolbar-separator" />

      {/* Right — actions */}
      <div className="toolbar-group" style={{ marginLeft: 'auto' }}>
        <button className="toolbar-btn" onClick={() => newHarness('Untitled Harness', 'User')} title="New harness">
          ✚ New
        </button>
        <button className="toolbar-btn" onClick={() => saveRevision('Manual save')} title="Save revision">
          💾 Save
        </button>

        <div className="toolbar-separator" />

        <button className="toolbar-btn" onClick={undo} disabled={undoStack.length === 0} title="Undo">
          ↩ Undo
        </button>
        <button className="toolbar-btn" onClick={redo} disabled={redoStack.length === 0} title="Redo">
          ↪ Redo
        </button>

        <div className="toolbar-separator" />

        <button className="toolbar-btn" onClick={validate} title="Validate harness">
          ✓ Validate
        </button>
        <button
          className="toolbar-btn"
          onClick={() => {
            const a = prompt('Component A node ID:');
            const b = prompt('Component B node ID:');
            if (a && b) bulkConnect(a, b, 'straight');
          }}
          title="Bulk connect two components"
        >
          ⚡ BulkConnect
        </button>
        <button className="toolbar-btn" onClick={toggleLabels} title="Toggle labels">
          🏷 Labels
        </button>
        <button className="toolbar-btn" onClick={fitToView} title="Fit to view">
          ⊞ Fit
        </button>

        <div className="toolbar-separator" />

        {/* Export dropdown */}
        <div style={{ position: 'relative' }}>
          <button className="toolbar-btn" onClick={() => setExportOpen(!exportOpen)}>
            ↗ Export ▾
          </button>
          {exportOpen && (
            <div className="export-dropdown">
              <button onClick={handleExportJson}>Save JSON</button>
              <button onClick={handleExportSvg}>Export SVG</button>
              <button onClick={handleExportNetlist}>Export Netlist</button>
              <button onClick={handleImportJson}>Import JSON…</button>
            </div>
          )}
        </div>

        <button className="toolbar-btn" onClick={() => useHarnessStore.getState().setRightPanel('settings')} title="Settings">
          ⚙
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AppShell
// ---------------------------------------------------------------------------
export function AppShell() {
  const { issues } = useHarnessStore();

  return (
    <div className="app-shell">
      <MainToolbar />

      <div className="app-body">
        <Sidebar />

        <div className="app-canvas">
          <HarnessCanvas />

          {issues.length > 0 && (
            <div className="issues-panel">
              <h4>⚠ Validation Issues</h4>
              <ul>
                {issues.map((issue, i) => (
                  <li key={i} className={`issue-${issue.severity}`}>
                    <span className="issue-badge">{issue.severity}</span>
                    {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <RightToolbar />
      </div>

      <BottomBar />

      {/* Overlays */}
      <ContextMenu />
      <SignalEditorDialog />
    </div>
  );
}
function RightToolbar() {
  const { rightPanel, setRightPanel, harness } = useHarnessStore();

  const toggle = (panel: typeof rightPanel) => {
    setRightPanel(rightPanel === panel ? null : panel);
  };

  return (
    <div className="right-toolbar">
      <div className="right-icons">
        <button className={`toolbar-btn${rightPanel === 'components' ? ' active' : ''}`} onClick={() => toggle('components')} title="Components">
          🔌
        </button>
        <button className={`toolbar-btn${rightPanel === 'wires' ? ' active' : ''}`} onClick={() => toggle('wires')} title="Wires">
          〰
        </button>
        <button className={`toolbar-btn${rightPanel === 'cables' ? ' active' : ''}`} onClick={() => toggle('cables')} title="Cables">
          🔗
        </button>
        <button className={`toolbar-btn${rightPanel === 'settings' ? ' active' : ''}`} onClick={() => toggle('settings')} title="Settings">
          ⚙
        </button>
      </div>

      {rightPanel && (
        <div className="right-panel">
          {rightPanel === 'components' && (
            <>
              <PartsLibrary />
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
                <ComponentCreatorPanel />
              </div>
            </>
          )}
          {rightPanel === 'wires' && <WireLibrary />}
          {rightPanel === 'cables' && <CableCreatorPanel />}
          {rightPanel === 'settings' && <SettingsPanel canvas={harness.canvas} />}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsPanel
// ---------------------------------------------------------------------------
function SettingsPanel({ canvas }: { canvas: CanvasState }) {
  const {
    toggleGrid,
    setGridSize,
    toggleSnapToGrid,
    toggleLabels,
    togglePinNumbers,
    setWireUnits,
    setLengthUnits,
  } = useHarnessStore();

  return (
    <div className="settings-panel">
      <h4>Canvas Settings</h4>

      <label>
        <input type="checkbox" checked={canvas.showGrid} onChange={toggleGrid} />
        Show grid
      </label>

      <label>
        Grid size
        <input
          type="number"
          value={canvas.gridSize}
          min={5}
          max={50}
          onChange={(e) => setGridSize(Number(e.target.value))}
          style={{ width: 60, marginLeft: 8 }}
        />
      </label>

      <label>
        <input type="checkbox" checked={canvas.snapToGrid} onChange={toggleSnapToGrid} />
        Snap to grid
      </label>

      <label>
        <input type="checkbox" checked={canvas.showLabels} onChange={toggleLabels} />
        Show labels
      </label>

      <label>
        <input type="checkbox" checked={canvas.showPinNumbers} onChange={togglePinNumbers} />
        Show pin numbers
      </label>

      <label>
        Wire units
        <select value={canvas.wireUnits} onChange={(e) => setWireUnits(e.target.value as 'awg' | 'mm2')} style={{ marginLeft: 8 }}>
          <option value="awg">AWG</option>
          <option value="mm2">mm²</option>
        </select>
      </label>

      <label>
        Length units
        <select value={canvas.lengthUnits} onChange={(e) => setLengthUnits(e.target.value as 'imperial' | 'metric')} style={{ marginLeft: 8 }}>
          <option value="imperial">Imperial (in)</option>
          <option value="metric">Metric (mm)</option>
        </select>
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BottomBar
// ---------------------------------------------------------------------------
function BottomBar() {
  const { selectedNodeId, selectedConnectionId, selectedNodeIds, harness, updateConnectionProps, connectingFrom, selectedWireGauge, selectedWireColor, selectedWireSignal } = useHarnessStore();

  let status = 'Ready';
  let connForEdit: typeof harness.connections[0] | undefined;

  if (connectingFrom) {
    const fromNode = harness.nodes.find(n => n.id === connectingFrom.componentId);
    status = `Connecting from ${fromNode?.label ?? '?'}:${connectingFrom.pinId} — click target pin`;
  } else if (selectedConnectionId) {
    connForEdit = harness.connections.find((c) => c.id === selectedConnectionId);
    if (connForEdit) {
      const fromNode = harness.nodes.find(n => n.id === connForEdit!.from.componentId);
      const toNode = harness.nodes.find(n => n.id === connForEdit!.to.componentId);
      status = `Connection: ${connForEdit.signalLabel} — ${fromNode?.label ?? '?'}:${connForEdit.from.pinId} → ${toNode?.label ?? '?'}:${connForEdit.to.pinId}`;
    }
  } else if (selectedNodeIds.size > 1) {
    status = `${selectedNodeIds.size} nodes selected`;
  } else if (selectedNodeId) {
    const node = harness.nodes.find((n) => n.id === selectedNodeId);
    if (node) {
      status = `Selected: ${node.label} — ${node.component.type} (${node.component.pins.length} pins)`;
    }
  }

  return (
    <div className="bottom-bar dark">
      <span>{status}</span>

      {/* Pending wire info when connecting */}
      {connectingFrom && (
        <div className="bottom-bar-props">
          <span className="wire-badge">{selectedWireGauge} AWG</span>
          <span className="pin-conn-color" style={{ backgroundColor: selectedWireColor, width: 14, height: 14, borderRadius: '50%', display: 'inline-block', border: '1px solid rgba(255,255,255,0.3)' }} />
          {selectedWireSignal && <span className="wire-badge">{selectedWireSignal}</span>}
        </div>
      )}

      {/* Inline property editor for selected connection */}
      {connForEdit && (
        <div className="bottom-bar-props">
          <label>
            Signal:
            <input
              type="text"
              className="bottom-input"
              value={connForEdit.signalLabel}
              onChange={e => updateConnectionProps(selectedConnectionId!, { signalLabel: e.target.value })}
            />
          </label>
          <label>
            Color:
            <input
              type="color"
              className="bottom-color"
              value={connForEdit.colorCode || '#6b7280'}
              onChange={e => updateConnectionProps(selectedConnectionId!, { colorCode: e.target.value })}
            />
          </label>
          <label>
            Length (mm):
            <input
              type="number"
              className="bottom-input"
              value={connForEdit.length ?? ''}
              min={0}
              onChange={e => updateConnectionProps(selectedConnectionId!, { length: e.target.value ? Number(e.target.value) : undefined })}
            />
          </label>
        </div>
      )}

      <span style={{ marginLeft: 'auto', opacity: 0.6 }}>
        v{harness.version} · {harness.nodes.length} nodes · {harness.connections.length} connections
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
