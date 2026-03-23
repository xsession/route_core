import React from 'react';
import { HarnessCanvas } from '../canvas/HarnessCanvas';
import { CanvasToolbar } from '../canvas/CanvasToolbar';
import { Sidebar } from './Sidebar';
import { useHarnessStore } from '../../store/harness-store';
import { ExportManager } from '@route-core/core';

const exportManager = new ExportManager();

export function AppShell() {
  const { harness, issues } = useHarnessStore();

  const handleExportSvg = () => {
    const result = exportManager.exportSvg(harness);
    downloadFile(result.content, result.filename, result.mimeType);
  };

  const handleExportJson = () => {
    const result = exportManager.exportJson(harness);
    downloadFile(result.content, result.filename, result.mimeType);
  };

  const handleExportNetlist = () => {
    const result = exportManager.exportNetlist(harness);
    downloadFile(result.content, result.filename, result.mimeType);
  };

  const handleImportJson = () => {
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
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <h1>Route Core</h1>
          <span className="app-subtitle">Cable Harness Designer</span>
        </div>
        <div className="app-actions">
          <button onClick={handleImportJson}>Import</button>
          <button onClick={handleExportJson}>Save JSON</button>
          <button onClick={handleExportSvg}>Export SVG</button>
          <button onClick={handleExportNetlist}>Export Netlist</button>
        </div>
      </header>

      <div className="app-body">
        <Sidebar />
        <main className="app-main">
          <CanvasToolbar />
          <div className="canvas-container">
            <HarnessCanvas />
          </div>
          {issues.length > 0 && (
            <div className="issues-panel">
              <h4>Validation Issues</h4>
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
        </main>
      </div>
    </div>
  );
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
