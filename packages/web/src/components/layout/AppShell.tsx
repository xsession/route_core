import React from 'react';
import { ExportManager, type CanvasState } from '@route-core/core';
import { HarnessCanvas } from '../canvas/HarnessCanvas';
import { ContextMenu } from '../canvas/ContextMenu';
import { SignalEditorDialog } from '../canvas/SignalEditorDialog';
import { CableCreatorPanel } from '../creators/CableCreator';
import { ComponentCreatorPanel } from '../creators/ComponentCreator';
import { WireLibrary } from '../creators/WireLibrary';
import { PartsLibrary } from '../parts/PartsLibrary';
import { useHarnessStore } from '../../store/harness-store';
import { Sidebar } from './Sidebar';

const exportManager = new ExportManager();
const COMPACT_BREAKPOINT = '(max-width: 1100px)';

function useCompactLayout() {
  const getMatches = () => window.matchMedia(COMPACT_BREAKPOINT).matches;
  const [isCompact, setIsCompact] = React.useState(getMatches);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(COMPACT_BREAKPOINT);
    const handleChange = (event: MediaQueryListEvent) => setIsCompact(event.matches);

    setIsCompact(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isCompact;
}

function BulkConnectDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { harness, bulkConnect } = useHarnessStore();
  const [componentA, setComponentA] = React.useState('');
  const [componentB, setComponentB] = React.useState('');
  const [pattern, setPattern] = React.useState<'straight' | 'crossover'>('straight');

  React.useEffect(() => {
    if (!open) return;

    const first = harness.nodes[0]?.id ?? '';
    const second = harness.nodes.find((node) => node.id !== first)?.id ?? '';

    setComponentA(first);
    setComponentB(second);
    setPattern('straight');
  }, [open, harness.nodes]);

  if (!open) return null;

  const canSubmit = Boolean(componentA && componentB && componentA !== componentB);

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="signal-editor app-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="signal-editor-header">
          <h3>Bulk Connect</h3>
          <button className="btn-close" onClick={onClose} aria-label="Close bulk connect dialog">
            x
          </button>
        </div>

        <div className="signal-editor-body">
          <p className="panel-hint">
            Connect matching pins between two components without typing raw node IDs.
          </p>

          <label>
            First component
            <select value={componentA} onChange={(event) => setComponentA(event.target.value)}>
              <option value="">Select component</option>
              {harness.nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.label} ({node.component.type})
                </option>
              ))}
            </select>
          </label>

          <label>
            Second component
            <select value={componentB} onChange={(event) => setComponentB(event.target.value)}>
              <option value="">Select component</option>
              {harness.nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.label} ({node.component.type})
                </option>
              ))}
            </select>
          </label>

          <label>
            Pattern
            <select value={pattern} onChange={(event) => setPattern(event.target.value as 'straight' | 'crossover')}>
              <option value="straight">Straight through</option>
              <option value="crossover">Crossover</option>
            </select>
          </label>
        </div>

        <div className="signal-editor-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return;
              bulkConnect(componentA, componentB, pattern);
              onClose();
            }}
          >
            Connect pins
          </button>
        </div>
      </div>
    </div>
  );
}

function MainToolbar({
  isCompact,
  onToggleSidebar,
  onToggleRightPanel,
}: {
  isCompact: boolean;
  onToggleSidebar: () => void;
  onToggleRightPanel: () => void;
}) {
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
    toggleLabels,
    fitToView,
    rightPanel,
  } = useHarnessStore();

  const [exportOpen, setExportOpen] = React.useState(false);
  const [bulkConnectOpen, setBulkConnectOpen] = React.useState(false);
  const exportRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!exportOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!exportRef.current?.contains(event.target as Node)) {
        setExportOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExportOpen(false);
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [exportOpen]);

  const handleExport = (mode: 'json' | 'svg' | 'netlist') => {
    const result =
      mode === 'json'
        ? exportManager.exportJson(harness)
        : mode === 'svg'
          ? exportManager.exportSvg(harness)
          : exportManager.exportNetlist(harness);

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
    <>
      <div className="main-toolbar dark">
        <div className="toolbar-group toolbar-group-wrap">
          {isCompact && (
            <button className="toolbar-btn" onClick={onToggleSidebar} title="Open navigator">
              Navigator
            </button>
          )}
          <span className="toolbar-brand">Route Core</span>
          <span className="toolbar-separator-dot">/</span>
          <span className="toolbar-harness-name">{harness.name}</span>
          {harnessModified && <span className="modified-dot" title="Unsaved changes" />}
        </div>

        <div className="toolbar-separator" />

        <div className="toolbar-group toolbar-group-wrap">
          <button
            className={`toolbar-btn${tool === 'select' ? ' active' : ''}`}
            onClick={() => setTool('select')}
            title="Select (V)"
          >
            Select
          </button>
          <button
            className={`toolbar-btn${tool === 'connect' ? ' active' : ''}`}
            onClick={() => setTool('connect')}
            title="Connect (C)"
          >
            Connect
          </button>
          <button
            className={`toolbar-btn${tool === 'pan' ? ' active' : ''}`}
            onClick={() => setTool('pan')}
            title="Pan (H)"
          >
            Pan
          </button>
        </div>

        <div className="toolbar-separator toolbar-separator-desktop" />

        <div className="toolbar-group toolbar-group-wrap toolbar-actions">
          <button className="toolbar-btn" onClick={() => useHarnessStore.getState().collapseAll()} title="Collapse all nodes">
            Collapse
          </button>
          <button className="toolbar-btn" onClick={() => useHarnessStore.getState().expandAll()} title="Expand all nodes">
            Expand
          </button>
          <button className="toolbar-btn" onClick={() => newHarness('Untitled Harness', 'User')} title="New harness">
            New
          </button>
          <button className="toolbar-btn" onClick={() => saveRevision('Manual save')} title="Save revision">
            Save
          </button>
          <button className="toolbar-btn" onClick={undo} disabled={undoStack.length === 0} title="Undo">
            Undo
          </button>
          <button className="toolbar-btn" onClick={redo} disabled={redoStack.length === 0} title="Redo">
            Redo
          </button>
          <button className="toolbar-btn" onClick={validate} title="Validate harness">
            Validate
          </button>
          <button
            className="toolbar-btn"
            onClick={() => setBulkConnectOpen(true)}
            title="Bulk connect two components"
            disabled={harness.nodes.length < 2}
          >
            Bulk connect
          </button>
          <button className="toolbar-btn" onClick={toggleLabels} title="Toggle labels">
            Labels
          </button>
          <button className="toolbar-btn" onClick={fitToView} title="Fit to view">
            Fit
          </button>

          <div className="export-wrapper" ref={exportRef}>
            <button className="toolbar-btn" onClick={() => setExportOpen((current) => !current)} aria-expanded={exportOpen}>
              Export
            </button>
            {exportOpen && (
              <div className="export-dropdown">
                <button onClick={() => handleExport('json')}>Save JSON</button>
                <button onClick={() => handleExport('svg')}>Export SVG</button>
                <button onClick={() => handleExport('netlist')}>Export netlist</button>
                <div className="dropdown-divider" />
                <button onClick={handleImportJson}>Import JSON</button>
              </div>
            )}
          </div>

          <button
            className={`toolbar-btn${rightPanel === 'settings' ? ' active' : ''}`}
            onClick={() => useHarnessStore.getState().setRightPanel('settings')}
            title="Settings"
          >
            Settings
          </button>

          {isCompact && (
            <button className="toolbar-btn" onClick={onToggleRightPanel} title="Open tools">
              Tools
            </button>
          )}
        </div>
      </div>

      <BulkConnectDialog open={bulkConnectOpen} onClose={() => setBulkConnectOpen(false)} />
    </>
  );
}

export function AppShell() {
  const { issues } = useHarnessStore();
  const isCompact = useCompactLayout();
  const [leftPanelOpen, setLeftPanelOpen] = React.useState(false);
  const [rightPanelOpen, setRightPanelOpen] = React.useState(false);

  React.useEffect(() => {
    if (!isCompact) {
      setLeftPanelOpen(false);
      setRightPanelOpen(false);
    }
  }, [isCompact]);

  const closePanels = React.useCallback(() => {
    setLeftPanelOpen(false);
    setRightPanelOpen(false);
  }, []);

  return (
    <div className={`app-shell${isCompact ? ' compact-layout' : ''}`}>
      <MainToolbar
        isCompact={isCompact}
        onToggleSidebar={() => setLeftPanelOpen((current) => !current)}
        onToggleRightPanel={() => setRightPanelOpen((current) => !current)}
      />

      <div className="app-body">
        <Sidebar isCompact={isCompact} isOpen={!isCompact || leftPanelOpen} onRequestClose={closePanels} />

        <div className="app-canvas">
          <HarnessCanvas />

          {issues.length > 0 && (
            <div className="issues-panel">
              <h4>Validation issues</h4>
              <ul>
                {issues.map((issue, index) => (
                  <li key={`${issue.severity}-${index}`} className={`issue-${issue.severity}`}>
                    <span className="issue-badge">{issue.severity}</span>
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <RightToolbar isCompact={isCompact} isOpen={!isCompact || rightPanelOpen} onRequestClose={closePanels} />
      </div>

      {isCompact && (leftPanelOpen || rightPanelOpen) && <button className="panel-backdrop" onClick={closePanels} aria-label="Close panel overlay" />}

      <BottomBar />

      <ContextMenu />
      <SignalEditorDialog />
    </div>
  );
}

function RightToolbar({
  isCompact,
  isOpen,
  onRequestClose,
}: {
  isCompact: boolean;
  isOpen: boolean;
  onRequestClose: () => void;
}) {
  const { rightPanel, setRightPanel, harness } = useHarnessStore();

  const toggle = (panel: typeof rightPanel) => {
    setRightPanel(rightPanel === panel ? null : panel);
  };

  return (
    <div className={`right-toolbar${isCompact ? ' compact-panel' : ''}${isOpen ? ' open' : ''}`}>
      <div className="right-icons">
        {isCompact && (
          <button className="toolbar-btn compact-close-btn" onClick={onRequestClose} title="Close tools">
            Close
          </button>
        )}
        <button className={`toolbar-btn icon-stack${rightPanel === 'components' ? ' active' : ''}`} onClick={() => toggle('components')} title="Components">
          Parts
        </button>
        <button className={`toolbar-btn icon-stack${rightPanel === 'wires' ? ' active' : ''}`} onClick={() => toggle('wires')} title="Wires">
          Wires
        </button>
        <button className={`toolbar-btn icon-stack${rightPanel === 'cables' ? ' active' : ''}`} onClick={() => toggle('cables')} title="Cables">
          Cables
        </button>
        <button className={`toolbar-btn icon-stack${rightPanel === 'settings' ? ' active' : ''}`} onClick={() => toggle('settings')} title="Settings">
          Settings
        </button>
      </div>

      {rightPanel && (
        <div className="right-panel">
          {rightPanel === 'components' && (
            <>
              <PartsLibrary />
              <div className="panel-divider">
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

      <label className="checkbox-label">
        <input type="checkbox" checked={canvas.showGrid} onChange={toggleGrid} />
        <span>Show grid</span>
      </label>

      <label>
        Grid size
        <input
          type="number"
          value={canvas.gridSize}
          min={5}
          max={50}
          onChange={(event) => setGridSize(Number(event.target.value))}
        />
      </label>

      <label className="checkbox-label">
        <input type="checkbox" checked={canvas.snapToGrid} onChange={toggleSnapToGrid} />
        <span>Snap to grid</span>
      </label>

      <label className="checkbox-label">
        <input type="checkbox" checked={canvas.showLabels} onChange={toggleLabels} />
        <span>Show labels</span>
      </label>

      <label className="checkbox-label">
        <input type="checkbox" checked={canvas.showPinNumbers} onChange={togglePinNumbers} />
        <span>Show pin numbers</span>
      </label>

      <label>
        Wire units
        <select value={canvas.wireUnits} onChange={(event) => setWireUnits(event.target.value as 'awg' | 'mm2')}>
          <option value="awg">AWG</option>
          <option value="mm2">mm2</option>
        </select>
      </label>

      <label>
        Length units
        <select value={canvas.lengthUnits} onChange={(event) => setLengthUnits(event.target.value as 'imperial' | 'metric')}>
          <option value="imperial">Imperial (in)</option>
          <option value="metric">Metric (mm)</option>
        </select>
      </label>
    </div>
  );
}

function BottomBar() {
  const {
    selectedNodeId,
    selectedConnectionId,
    selectedNodeIds,
    harness,
    updateConnectionProps,
    connectingFrom,
    selectedWireGauge,
    selectedWireColor,
    selectedWireSignal,
  } = useHarnessStore();

  let status = 'Ready';
  let connForEdit: typeof harness.connections[0] | undefined;

  if (connectingFrom) {
    const fromNode = harness.nodes.find((node) => node.id === connectingFrom.componentId);
    status = `Connecting from ${fromNode?.label ?? '?'}:${connectingFrom.pinId}. Choose a target pin.`;
  } else if (selectedConnectionId) {
    connForEdit = harness.connections.find((connection) => connection.id === selectedConnectionId);
    if (connForEdit) {
      const fromNode = harness.nodes.find((node) => node.id === connForEdit.from.componentId);
      const toNode = harness.nodes.find((node) => node.id === connForEdit.to.componentId);
      status = `Connection ${connForEdit.signalLabel} from ${fromNode?.label ?? '?'}:${connForEdit.from.pinId} to ${toNode?.label ?? '?'}:${connForEdit.to.pinId}`;
    }
  } else if (selectedNodeIds.size > 1) {
    status = `${selectedNodeIds.size} nodes selected`;
  } else if (selectedNodeId) {
    const node = harness.nodes.find((item) => item.id === selectedNodeId);
    if (node) {
      status = `Selected ${node.label}: ${node.component.type} with ${node.component.pins.length} pins`;
    }
  }

  return (
    <div className="bottom-bar dark">
      <div className="bottom-bar-status">
        <span>{status}</span>

        {connectingFrom && (
          <div className="bottom-bar-props">
            <span className="wire-badge">{selectedWireGauge} AWG</span>
            <span
              className="pin-conn-color"
              style={{
                backgroundColor: selectedWireColor,
                width: 14,
                height: 14,
                borderRadius: '50%',
                display: 'inline-block',
                border: '1px solid rgba(255,255,255,0.3)',
              }}
            />
            {selectedWireSignal && <span className="wire-badge">{selectedWireSignal}</span>}
          </div>
        )}

        {connForEdit && (
          <div className="bottom-bar-props">
            <label>
              Signal
              <input
                type="text"
                className="bottom-input"
                value={connForEdit.signalLabel}
                onChange={(event) => updateConnectionProps(selectedConnectionId!, { signalLabel: event.target.value })}
              />
            </label>
            <label>
              Color
              <input
                type="color"
                className="bottom-color"
                value={connForEdit.colorCode || '#6b7280'}
                onChange={(event) => updateConnectionProps(selectedConnectionId!, { colorCode: event.target.value })}
              />
            </label>
            <label>
              Length (mm)
              <input
                type="number"
                className="bottom-input"
                value={connForEdit.length ?? ''}
                min={0}
                onChange={(event) =>
                  updateConnectionProps(selectedConnectionId!, {
                    length: event.target.value ? Number(event.target.value) : undefined,
                  })
                }
              />
            </label>
          </div>
        )}
      </div>

      <span className="bottom-bar-meta">
        v{harness.version} / {harness.nodes.length} nodes / {harness.connections.length} connections
      </span>
    </div>
  );
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
