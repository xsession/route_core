import React from 'react';
import { useHarnessStore } from '../../store/harness-store';

export function CanvasToolbar() {
  const { tool, setTool, harness, validate, issues, saveRevision } = useHarnessStore();

  return (
    <div className="canvas-toolbar">
      <div className="toolbar-group">
        <button
          className={`toolbar-btn ${tool === 'select' ? 'active' : ''}`}
          onClick={() => setTool('select')}
          title="Select & Move (V)"
        >
          &#9755; Select
        </button>
        <button
          className={`toolbar-btn ${tool === 'connect' ? 'active' : ''}`}
          onClick={() => setTool('connect')}
          title="Connect Pins (C)"
        >
          &#8651; Connect
        </button>
        <button
          className={`toolbar-btn ${tool === 'pan' ? 'active' : ''}`}
          onClick={() => setTool('pan')}
          title="Pan Canvas (H)"
        >
          &#9995; Pan
        </button>
      </div>

      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={validate} title="Validate Design">
          &#10003; Validate
        </button>
        <button
          className="toolbar-btn"
          onClick={() => saveRevision('Manual save')}
          title="Save Revision"
        >
          &#128190; Save
        </button>
      </div>

      <div className="toolbar-info">
        <span>{harness.name} v{harness.version}</span>
        <span>{harness.nodes.length} components</span>
        <span>{harness.connections.length} connections</span>
        {issues.length > 0 && (
          <span className="toolbar-issues">
            {issues.filter(i => i.severity === 'error').length} errors,{' '}
            {issues.filter(i => i.severity === 'warning').length} warnings
          </span>
        )}
      </div>
    </div>
  );
}
