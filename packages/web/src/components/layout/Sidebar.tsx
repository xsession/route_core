import React, { useState } from 'react';
import { PartsLibrary } from '../parts/PartsLibrary';
import { ComponentCreatorPanel } from '../creators/ComponentCreator';
import { CableCreatorPanel } from '../creators/CableCreator';
import { BomView } from '../bom/BomView';
import { useHarnessStore } from '../../store/harness-store';

type SidebarTab = 'parts' | 'component' | 'cable' | 'bom' | 'properties';

export function Sidebar() {
  const [tab, setTab] = useState<SidebarTab>('parts');
  const { harness, selectedNodeId, selectedConnectionId, removeNode, disconnect, renameNode, rotateNode } = useHarnessStore();

  const selectedNode = selectedNodeId ? harness.nodes.find(n => n.id === selectedNodeId) : null;
  const selectedConn = selectedConnectionId ? harness.connections.find(c => c.id === selectedConnectionId) : null;

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        <button className={tab === 'parts' ? 'active' : ''} onClick={() => setTab('parts')}>Parts</button>
        <button className={tab === 'component' ? 'active' : ''} onClick={() => setTab('component')}>Components</button>
        <button className={tab === 'cable' ? 'active' : ''} onClick={() => setTab('cable')}>Cables</button>
        <button className={tab === 'bom' ? 'active' : ''} onClick={() => setTab('bom')}>BOM</button>
        {(selectedNode || selectedConn) && (
          <button className={tab === 'properties' ? 'active' : ''} onClick={() => setTab('properties')}>Properties</button>
        )}
      </nav>

      <div className="sidebar-content">
        {tab === 'parts' && <PartsLibrary />}
        {tab === 'component' && <ComponentCreatorPanel />}
        {tab === 'cable' && <CableCreatorPanel />}
        {tab === 'bom' && <BomView />}
        {tab === 'properties' && selectedNode && (
          <div className="properties-panel">
            <h3>Component Properties</h3>
            <label>
              Label
              <input
                type="text"
                value={selectedNode.label}
                onChange={e => renameNode(selectedNode.id, e.target.value)}
              />
            </label>
            <div className="prop-row"><span>Name:</span> {selectedNode.component.name}</div>
            <div className="prop-row"><span>Category:</span> {selectedNode.component.category}</div>
            <div className="prop-row"><span>Manufacturer:</span> {selectedNode.component.manufacturer || '-'}</div>
            <div className="prop-row"><span>Part Number:</span> {selectedNode.component.partNumber || '-'}</div>
            <div className="prop-row"><span>Pins:</span> {selectedNode.component.pins.length}</div>
            <div className="prop-row">
              <span>Position:</span> ({Math.round(selectedNode.position.x)}, {Math.round(selectedNode.position.y)})
            </div>
            <div className="prop-row"><span>Rotation:</span> {selectedNode.rotation}°</div>

            <div className="prop-actions">
              <button onClick={() => rotateNode(selectedNode.id, 90)}>Rotate 90°</button>
              <button className="danger" onClick={() => removeNode(selectedNode.id)}>Remove</button>
            </div>
          </div>
        )}
        {tab === 'properties' && selectedConn && (
          <div className="properties-panel">
            <h3>Connection Properties</h3>
            <div className="prop-row"><span>Signal:</span> {selectedConn.signalLabel}</div>
            <div className="prop-row">
              <span>From:</span> {harness.nodes.find(n => n.id === selectedConn.from.componentId)?.label ?? '?'}
            </div>
            <div className="prop-row">
              <span>To:</span> {harness.nodes.find(n => n.id === selectedConn.to.componentId)?.label ?? '?'}
            </div>
            <div className="prop-actions">
              <button className="danger" onClick={() => disconnect(selectedConn.id)}>Remove Connection</button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
