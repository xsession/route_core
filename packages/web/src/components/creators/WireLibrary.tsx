import React from 'react';
import { useHarnessStore } from '../../store/harness-store';
import { AWG_SPECS } from '@route-core/core';

const WIRE_COLORS = [
  { name: 'Black', value: '#1f2937' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Green', value: '#059669' },
  { name: 'Orange', value: '#d97706' },
  { name: 'White', value: '#e5e7eb' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Brown', value: '#78350f' },
  { name: 'Violet', value: '#7c3aed' },
  { name: 'Gray', value: '#6b7280' },
  { name: 'Pink', value: '#ec4899' },
];

const AWG_VALUES = [30, 28, 26, 24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 4, 2];

export function WireLibrary() {
  const {
    tool,
    setTool,
    selectedWireGauge,
    selectedWireColor,
    setSelectedWireGauge,
    setSelectedWireColor,
    connectingFrom,
    cancelConnection,
  } = useHarnessStore();

  const awgSpec = AWG_SPECS[selectedWireGauge];
  const isConnecting = tool === 'connect';

  return (
    <div className="wire-library">
      <h3>Wire Library</h3>
      <p className="panel-hint">
        {connectingFrom
          ? 'Click target pin to complete connection'
          : 'Select wire properties, then click pins to connect'}
      </p>

      <div className="wire-config">
        <label>
          Wire Gauge
          <select
            value={selectedWireGauge}
            onChange={e => setSelectedWireGauge(Number(e.target.value))}
          >
            {AWG_VALUES.map(g => (
              <option key={g} value={g}>
                {g} AWG {awgSpec ? `(${AWG_SPECS[g]?.currentRating ?? '?'}A)` : ''}
              </option>
            ))}
          </select>
        </label>

        <label>
          Wire Color
          <div className="color-grid">
            {WIRE_COLORS.map(c => (
              <button
                key={c.value}
                className={`color-swatch ${selectedWireColor === c.value ? 'active' : ''}`}
                style={{ backgroundColor: c.value }}
                onClick={() => setSelectedWireColor(c.value)}
                title={c.name}
              />
            ))}
          </div>
        </label>

        {awgSpec && (
          <div className="wire-specs">
            <div className="spec-row">
              <span>Diameter:</span>
              <span>{awgSpec.diameter_mm} mm</span>
            </div>
            <div className="spec-row">
              <span>Current Rating:</span>
              <span>{awgSpec.currentRating} A</span>
            </div>
            <div className="spec-row">
              <span>Resistance:</span>
              <span>{awgSpec.resistance_ohm_per_m.toFixed(4)} Ω/m</span>
            </div>
          </div>
        )}

        <div className="wire-actions">
          {!isConnecting ? (
            <button
              className="create-btn"
              onClick={() => setTool('connect')}
            >
              &#9889; Start Connecting
            </button>
          ) : (
            <button
              className="create-btn danger"
              onClick={() => {
                cancelConnection();
                setTool('select');
              }}
            >
              &#10005; Cancel Connection
            </button>
          )}
        </div>

        {connectingFrom && (
          <div className="connecting-status">
            <span className="status-dot" />
            Connecting from pin...
            <br />
            <small>Click target pin to complete</small>
          </div>
        )}
      </div>

      <h4>Common Wire Types</h4>
      <div className="wire-presets">
        {[
          { name: 'Power (12V)', gauge: 16, color: '#dc2626' },
          { name: 'Power (5V)', gauge: 20, color: '#dc2626' },
          { name: 'Ground', gauge: 16, color: '#1f2937' },
          { name: 'Signal', gauge: 22, color: '#2563eb' },
          { name: 'Data (SDA)', gauge: 24, color: '#2563eb' },
          { name: 'Data (SCL)', gauge: 24, color: '#7c3aed' },
          { name: 'CAN High', gauge: 22, color: '#059669' },
          { name: 'CAN Low', gauge: 22, color: '#d97706' },
        ].map(preset => (
          <button
            key={preset.name}
            className="wire-preset"
            onClick={() => {
              setSelectedWireGauge(preset.gauge);
              setSelectedWireColor(preset.color);
              setTool('connect');
            }}
          >
            <span
              className="preset-color"
              style={{ backgroundColor: preset.color }}
            />
            <span className="preset-info">
              <span className="preset-name">{preset.name}</span>
              <span className="preset-spec">{preset.gauge} AWG</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
