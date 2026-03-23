import React, { useState } from 'react';
import { CableCreator as CableCreatorEngine } from '@route-core/core';
import type { JacketMaterial, WireMaterial, InsulationType } from '@route-core/core';
import { useHarnessStore } from '../../store/harness-store';

const engine = new CableCreatorEngine();

export function CableCreatorPanel() {
  const { addCable } = useHarnessStore();
  const [mode, setMode] = useState<'quick' | 'custom'>('quick');

  // Custom cable form
  const [name, setName] = useState('');
  const [conductorCount, setConductorCount] = useState(2);
  const [gauge, setGauge] = useState(22);
  const [wireMaterial, setWireMaterial] = useState<WireMaterial>('copper');
  const [wireInsulation, setWireInsulation] = useState<InsulationType>('PVC');
  const [jacketMaterial, setJacketMaterial] = useState<JacketMaterial>('PVC');
  const [jacketColor, setJacketColor] = useState('black');
  const [shielded, setShielded] = useState(false);

  const handleQuickCreate = (type: 'power' | 'signal' | 'ethernet') => {
    let cable;
    switch (type) {
      case 'power':
        cable = engine.createPowerCable(gauge);
        break;
      case 'signal':
        cable = engine.createSignalCable(conductorCount, gauge);
        break;
      case 'ethernet':
        cable = engine.createEthernetCable();
        break;
    }
    addCable(cable);
  };

  const handleCustomCreate = () => {
    if (!name.trim()) return;
    const cable = engine.createCable({
      name,
      conductorCount,
      gauge,
      wireMaterial,
      wireInsulation,
      jacketMaterial,
      jacketColor,
      shielded,
    });
    addCable(cable);
  };

  return (
    <div className="creator-panel">
      <h3>Cable Creator</h3>

      <div className="tab-bar">
        <button className={mode === 'quick' ? 'active' : ''} onClick={() => setMode('quick')}>
          Quick
        </button>
        <button className={mode === 'custom' ? 'active' : ''} onClick={() => setMode('custom')}>
          Custom
        </button>
      </div>

      {mode === 'quick' ? (
        <div className="quick-cables">
          <label>
            Wire Gauge (AWG)
            <select value={gauge} onChange={e => setGauge(Number(e.target.value))}>
              {[30, 28, 26, 24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 4, 2].map(g => (
                <option key={g} value={g}>{g} AWG</option>
              ))}
            </select>
          </label>

          <label>
            Conductor Count
            <input type="number" min={1} max={50} value={conductorCount} onChange={e => setConductorCount(Number(e.target.value))} />
          </label>

          <div className="quick-actions">
            <button onClick={() => handleQuickCreate('power')}>Power Cable</button>
            <button onClick={() => handleQuickCreate('signal')}>Shielded Signal</button>
            <button onClick={() => handleQuickCreate('ethernet')}>Ethernet Cat5e</button>
          </div>
        </div>
      ) : (
        <div className="custom-form">
          <label>
            Cable Name
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="My Cable" />
          </label>

          <label>
            Conductors
            <input type="number" min={1} max={50} value={conductorCount} onChange={e => setConductorCount(Number(e.target.value))} />
          </label>

          <label>
            Gauge (AWG)
            <select value={gauge} onChange={e => setGauge(Number(e.target.value))}>
              {[30, 28, 26, 24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 4, 2].map(g => (
                <option key={g} value={g}>{g} AWG</option>
              ))}
            </select>
          </label>

          <label>
            Wire Material
            <select value={wireMaterial} onChange={e => setWireMaterial(e.target.value as WireMaterial)}>
              <option value="copper">Copper</option>
              <option value="tinned_copper">Tinned Copper</option>
              <option value="aluminum">Aluminum</option>
              <option value="silver_plated">Silver Plated</option>
            </select>
          </label>

          <label>
            Insulation
            <select value={wireInsulation} onChange={e => setWireInsulation(e.target.value as InsulationType)}>
              <option value="PVC">PVC</option>
              <option value="PTFE">PTFE</option>
              <option value="silicone">Silicone</option>
              <option value="XLPE">XLPE</option>
              <option value="rubber">Rubber</option>
              <option value="kapton">Kapton</option>
              <option value="tefzel">Tefzel</option>
            </select>
          </label>

          <label>
            Jacket Material
            <select value={jacketMaterial} onChange={e => setJacketMaterial(e.target.value as JacketMaterial)}>
              <option value="PVC">PVC</option>
              <option value="TPE">TPE</option>
              <option value="PUR">PUR</option>
              <option value="silicone">Silicone</option>
              <option value="rubber">Rubber</option>
              <option value="neoprene">Neoprene</option>
              <option value="LSZH">LSZH</option>
            </select>
          </label>

          <label>
            Jacket Color
            <input type="text" value={jacketColor} onChange={e => setJacketColor(e.target.value)} />
          </label>

          <label className="checkbox-label">
            <input type="checkbox" checked={shielded} onChange={e => setShielded(e.target.checked)} />
            Shielded
          </label>

          <button className="create-btn" onClick={handleCustomCreate} disabled={!name.trim()}>
            Create Cable
          </button>
        </div>
      )}
    </div>
  );
}
