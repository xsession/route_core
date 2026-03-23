import { describe, it, expect } from 'vitest';
import { SvgExporter } from '../svg.js';
import { HarnessBuilder } from '../../harness/builder.js';
import { createHarness } from '../../models/harness.js';
import type { Component } from '../../models/component.js';

function makeComponent(id = 'c1'): Component {
  return {
    id,
    name: 'Connector',
    manufacturer: '',
    partNumber: '',
    category: 'connector',
    type: 'free_hanging',
    pins: [
      { id: 'p1', label: '1', position: { x: 0, y: 5 }, direction: 'left', signalType: 'signal', gender: 'neutral' },
      { id: 'p2', label: '2', position: { x: 0, y: 15 }, direction: 'left', signalType: 'power', gender: 'neutral' },
    ],
    footprint: { width: 20, height: 30, pinLayout: 'single_row' },
    description: '',
    tags: [],
    custom: false,
  };
}

describe('SvgExporter', () => {
  const exporter = new SvgExporter();

  it('generates valid SVG markup', () => {
    const harness = createHarness('SVG Test', 'T');
    const svg = exporter.export(harness);

    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('includes harness title in SVG', () => {
    const harness = createHarness('My Harness', 'T');
    const svg = exporter.export(harness);
    expect(svg).toContain('My Harness');
  });

  it('renders component nodes', () => {
    const harness = createHarness('Render Test', 'T');
    const builder = new HarnessBuilder(harness);
    builder.placeComponent(makeComponent(), { x: 100, y: 200 });

    const svg = exporter.export(harness);
    expect(svg).toContain('translate(100, 200)');
    expect(svg).toContain('comp-body');
  });

  it('renders wire connections', () => {
    const harness = createHarness('Wire Test', 'T');
    const builder = new HarnessBuilder(harness);
    const n1 = builder.placeComponent(makeComponent('c1'), { x: 0, y: 0 });
    const n2 = builder.placeComponent(makeComponent('c2'), { x: 200, y: 0 });

    builder.connect(
      { componentId: n1.id, pinId: 'p1' },
      { componentId: n2.id, pinId: 'p1' },
      'SIG'
    );

    const svg = exporter.export(harness);
    expect(svg).toContain('<path class="wire"');
  });

  it('shows grid when option is enabled', () => {
    const harness = createHarness('Grid Test', 'T');
    const svg = exporter.export(harness, { showGrid: true });
    expect(svg).toContain('grid-line');
  });

  it('does not show grid by default', () => {
    const harness = createHarness('No Grid', 'T');
    const svg = exporter.export(harness);
    expect(svg).not.toContain('grid-line');
  });

  it('shows signal labels when enabled', () => {
    const harness = createHarness('Label Test', 'T');
    const builder = new HarnessBuilder(harness);
    const n1 = builder.placeComponent(makeComponent('c1'), { x: 0, y: 0 });
    const n2 = builder.placeComponent(makeComponent('c2'), { x: 200, y: 0 });

    builder.connect(
      { componentId: n1.id, pinId: 'p1' },
      { componentId: n2.id, pinId: 'p1' },
      'DATA_BUS'
    );

    const svg = exporter.export(harness, { showLabels: true });
    expect(svg).toContain('DATA_BUS');
  });

  it('renders splice points', () => {
    const harness = createHarness('Splice Test', 'T');
    const builder = new HarnessBuilder(harness);
    builder.addSplice({ x: 100, y: 100 }, [], 'crimp', 'SP1');

    const svg = exporter.export(harness);
    expect(svg).toContain('SP1');
  });

  it('uses custom background color', () => {
    const harness = createHarness('BG Test', 'T');
    const svg = exporter.export(harness, { backgroundColor: '#f0f0f0' });
    expect(svg).toContain('#f0f0f0');
  });

  it('respects custom dimensions', () => {
    const harness = createHarness('Dim Test', 'T');
    const svg = exporter.export(harness, { width: 800, height: 600, padding: 20 });
    expect(svg).toContain('width="840"');
    expect(svg).toContain('height="640"');
  });

  it('escapes XML special characters', () => {
    const harness = createHarness('Test <&> "Design"', 'T');
    const svg = exporter.export(harness);
    expect(svg).toContain('&lt;');
    expect(svg).toContain('&amp;');
    expect(svg).toContain('&gt;');
  });
});
