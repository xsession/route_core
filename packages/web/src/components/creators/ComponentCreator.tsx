import React, { useState } from 'react';
import {
  ComponentCreator,
  COMPONENT_TEMPLATES,
  type ComponentCategory,
  type ComponentType,
  type ComponentShape,
  type PinSignalType,
} from '@route-core/core';
import { useHarnessStore } from '../../store/harness-store';

const creator = new ComponentCreator();

export function ComponentCreatorPanel() {
  const { placeComponent, harness } = useHarnessStore();
  const [mode, setMode] = useState<'template' | 'custom'>('template');

  // Custom form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ComponentCategory>('connector');
  const [type, setType] = useState<ComponentType>('free_hanging');
  const [manufacturer, setManufacturer] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [pinCount, setPinCount] = useState(2);
  const [pinLayout, setPinLayout] = useState<'single_row' | 'dual_row' | 'grid' | 'circular'>('single_row');
  const [pinSignal, setPinSignal] = useState<PinSignalType>('signal');
  const [shape, setShape] = useState<ComponentShape>('rectangular');

  const handleTemplatePlace = (templateIndex: number) => {
    const template = COMPONENT_TEMPLATES[templateIndex];
    const comp = creator.fromTemplate(template);
    const cx = harness.canvas.width / 2 + Math.random() * 100 - 50;
    const cy = harness.canvas.height / 2 + Math.random() * 100 - 50;
    placeComponent(comp, { x: cx, y: cy });
  };

  const handleCustomCreate = () => {
    if (!name.trim()) return;

    const pins = Array.from({ length: pinCount }, (_, i) => ({
      label: `${i + 1}`,
      signalType: pinSignal,
    }));

    const comp = creator.createCustom({
      name,
      category,
      type,
      manufacturer: manufacturer || undefined,
      partNumber: partNumber || undefined,
      pins,
      pinLayout,
      shape,
    });

    const cx = harness.canvas.width / 2;
    const cy = harness.canvas.height / 2;
    placeComponent(comp, { x: cx, y: cy });
  };

  return (
    <div className="creator-panel">
      <h3>Component Creator</h3>

      <div className="tab-bar">
        <button className={mode === 'template' ? 'active' : ''} onClick={() => setMode('template')}>
          Templates
        </button>
        <button className={mode === 'custom' ? 'active' : ''} onClick={() => setMode('custom')}>
          Custom
        </button>
      </div>

      {mode === 'template' ? (
        <div className="template-list">
          {COMPONENT_TEMPLATES.map((tmpl, i) => (
            <div key={i} className="template-item" onClick={() => handleTemplatePlace(i)}>
              <span className="template-name">{tmpl.name}</span>
              <span className="template-meta">{tmpl.pinCount} pins &middot; {tmpl.category}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="custom-form">
          <label>
            Name
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="My Component" />
          </label>

          <label>
            Category
            <select value={category} onChange={e => setCategory(e.target.value as ComponentCategory)}>
              <option value="connector">Connector</option>
              <option value="terminal">Terminal</option>
              <option value="motor">Motor</option>
              <option value="relay">Relay</option>
              <option value="contactor">Contactor</option>
              <option value="power_supply">Power Supply</option>
              <option value="sensor">Sensor</option>
              <option value="switch">Switch</option>
              <option value="fuse">Fuse</option>
              <option value="circuit_breaker">Circuit Breaker</option>
              <option value="controller">Controller</option>
              <option value="device">Device</option>
              <option value="push_button">Push Button</option>
              <option value="timer">Timer</option>
              <option value="fan">Fan</option>
              <option value="pcb">PCB</option>
              <option value="resistor">Resistor</option>
              <option value="capacitor">Capacitor</option>
              <option value="diode">Diode</option>
              <option value="inductor">Inductor</option>
              <option value="transformer">Transformer</option>
              <option value="inverter">Inverter</option>
              <option value="battery">Battery</option>
              <option value="solar_cell">Solar Cell</option>
              <option value="splice">Splice</option>
            </select>
          </label>

          <label>
            Mounting Type
            <select value={type} onChange={e => setType(e.target.value as ComponentType)}>
              <option value="free_hanging">Free Hanging</option>
              <option value="panel_mount">Panel Mount</option>
              <option value="pcb_mount">PCB Mount</option>
              <option value="din_rail">DIN Rail</option>
              <option value="inline">Inline</option>
              <option value="bulkhead">Bulkhead</option>
            </select>
          </label>

          <label>
            Manufacturer
            <input type="text" value={manufacturer} onChange={e => setManufacturer(e.target.value)} />
          </label>

          <label>
            Part Number
            <input type="text" value={partNumber} onChange={e => setPartNumber(e.target.value)} />
          </label>

          <label>
            Pin Count
            <input type="number" min={1} max={200} value={pinCount} onChange={e => setPinCount(Number(e.target.value))} />
          </label>

          <label>
            Pin Layout
            <select value={pinLayout} onChange={e => setPinLayout(e.target.value as any)}>
              <option value="single_row">Single Row</option>
              <option value="dual_row">Dual Row</option>
              <option value="grid">Grid</option>
              <option value="circular">Circular</option>
            </select>
          </label>

          <label>
            Default Pin Signal
            <select value={pinSignal} onChange={e => setPinSignal(e.target.value as PinSignalType)}>
              <option value="signal">Signal</option>
              <option value="power">Power</option>
              <option value="ground">Ground</option>
              <option value="data">Data</option>
              <option value="analog">Analog</option>
              <option value="digital">Digital</option>
            </select>
          </label>

          <label>
            Shape
            <select value={shape} onChange={e => setShape(e.target.value as ComponentShape)}>
              <option value="rectangular">Rectangular</option>
              <option value="circular">Circular</option>
              <option value="usb">USB</option>
              <option value="d_sub">D-Sub</option>
              <option value="ferrule">Ferrule</option>
              <option value="quick_disconnect">Quick Disconnect</option>
              <option value="ring_terminal">Ring Terminal</option>
              <option value="terminal_block">Terminal Block</option>
              <option value="generic">Generic</option>
            </select>
          </label>

          <button className="create-btn" onClick={handleCustomCreate} disabled={!name.trim()}>
            Create & Place
          </button>
        </div>
      )}
    </div>
  );
}
