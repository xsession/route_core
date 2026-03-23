import type { Harness, HarnessNode } from '../models/harness.js';
import type { Connection } from '../models/connection.js';
import { WireRouter } from '../harness/router.js';

export interface SvgExportOptions {
  width?: number;
  height?: number;
  showGrid?: boolean;
  showLabels?: boolean;
  showPinNumbers?: boolean;
  backgroundColor?: string;
  wireColorMap?: Record<string, string>; // signalLabel -> color
  fontSize?: number;
  padding?: number;
}

const DEFAULT_WIRE_COLORS: Record<string, string> = {
  power: '#cc0000',
  ground: '#000000',
  signal: '#0066cc',
  data: '#009933',
  default: '#555555',
};

/**
 * SvgExporter: renders a harness design to SVG markup.
 */
export class SvgExporter {
  private router = new WireRouter();

  export(harness: Harness, options: SvgExportOptions = {}): string {
    const {
      width = harness.canvas.width,
      height = harness.canvas.height,
      showGrid = false,
      showLabels = harness.canvas.showLabels,
      showPinNumbers = harness.canvas.showPinNumbers,
      backgroundColor = '#ffffff',
      wireColorMap = {},
      fontSize = 11,
      padding = 40,
    } = options;

    const parts: string[] = [];

    // SVG header
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" ` +
      `viewBox="0 0 ${width + padding * 2} ${height + padding * 2}" ` +
      `width="${width + padding * 2}" height="${height + padding * 2}">`
    );

    // Styles
    parts.push(`<defs><style>
      .comp-body { fill: #f8f9fa; stroke: #333; stroke-width: 1.5; rx: 4; }
      .pin-dot { fill: #333; }
      .pin-label { font-family: monospace; font-size: ${fontSize - 2}px; fill: #555; }
      .comp-label { font-family: sans-serif; font-size: ${fontSize}px; font-weight: bold; fill: #222; }
      .wire { fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
      .signal-label { font-family: sans-serif; font-size: ${fontSize - 1}px; fill: #666; }
      .grid-line { stroke: #e8e8e8; stroke-width: 0.5; }
      .title { font-family: sans-serif; font-size: 16px; font-weight: bold; fill: #111; }
    </style></defs>`
    );

    // Background
    parts.push(
      `<rect width="100%" height="100%" fill="${backgroundColor}" />`
    );

    // Grid
    if (showGrid) {
      parts.push(this.renderGrid(width, height, harness.canvas.gridSize, padding));
    }

    // Content group with padding offset
    parts.push(`<g transform="translate(${padding}, ${padding})">`);

    // Title
    parts.push(
      `<text class="title" x="0" y="-10">${escapeXml(harness.name)} v${harness.version}</text>`
    );

    // Wires (rendered behind components)
    const routes = this.router.routeAll(harness.connections, harness.nodes);
    for (const route of routes) {
      const conn = harness.connections.find(c => c.id === route.connectionId);
      if (!conn || route.path.length < 2) continue;

      const color = wireColorMap[conn.signalLabel]
        ?? this.signalColor(conn, harness);

      const pathData = route.path
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
        .join(' ');

      parts.push(`<path class="wire" d="${pathData}" stroke="${color}" />`);

      // Signal label at midpoint
      if (showLabels && conn.signalLabel) {
        const mid = route.path[Math.floor(route.path.length / 2)];
        parts.push(
          `<text class="signal-label" x="${mid.x}" y="${mid.y - 5}">${escapeXml(conn.signalLabel)}</text>`
        );
      }
    }

    // Components
    for (const node of harness.nodes) {
      parts.push(this.renderNode(node, showLabels, showPinNumbers, fontSize));
    }

    // Splice points
    for (const splice of harness.splices) {
      parts.push(
        `<circle cx="${splice.position.x}" cy="${splice.position.y}" r="4" fill="#333" />` +
        `<text class="signal-label" x="${splice.position.x + 6}" y="${splice.position.y + 4}">${escapeXml(splice.label)}</text>`
      );
    }

    parts.push('</g>');
    parts.push('</svg>');

    return parts.join('\n');
  }

  private renderNode(
    node: HarnessNode,
    showLabels: boolean,
    showPinNumbers: boolean,
    fontSize: number
  ): string {
    const { position, component } = node;
    const { footprint, pins } = component;
    const parts: string[] = [];

    parts.push(`<g transform="translate(${position.x}, ${position.y}) rotate(${node.rotation})">`);

    // Component body
    parts.push(
      `<rect class="comp-body" x="0" y="0" width="${footprint.width}" height="${footprint.height}" />`
    );

    // Component label
    if (showLabels) {
      parts.push(
        `<text class="comp-label" x="${footprint.width / 2}" y="-6" text-anchor="middle">${escapeXml(node.label)}</text>`
      );
      parts.push(
        `<text class="signal-label" x="${footprint.width / 2}" y="${footprint.height + fontSize + 4}" text-anchor="middle">${escapeXml(component.name)}</text>`
      );
    }

    // Pins
    for (const pin of pins) {
      parts.push(
        `<circle class="pin-dot" cx="${pin.position.x}" cy="${pin.position.y}" r="2.5" />`
      );

      if (showPinNumbers) {
        const labelOffset = pin.direction === 'left' ? -8 : pin.direction === 'right' ? 8 : 0;
        const anchor = pin.direction === 'left' ? 'end' : pin.direction === 'right' ? 'start' : 'middle';
        parts.push(
          `<text class="pin-label" x="${pin.position.x + labelOffset}" y="${pin.position.y + 3}" text-anchor="${anchor}">${escapeXml(pin.label)}</text>`
        );
      }
    }

    parts.push('</g>');
    return parts.join('\n');
  }

  private renderGrid(width: number, height: number, gridSize: number, padding: number): string {
    const lines: string[] = [];
    for (let x = 0; x <= width; x += gridSize) {
      lines.push(`<line class="grid-line" x1="${x + padding}" y1="${padding}" x2="${x + padding}" y2="${height + padding}" />`);
    }
    for (let y = 0; y <= height; y += gridSize) {
      lines.push(`<line class="grid-line" x1="${padding}" y1="${y + padding}" x2="${width + padding}" y2="${y + padding}" />`);
    }
    return lines.join('\n');
  }

  private signalColor(conn: Connection, harness: Harness): string {
    // Try to infer color from wire or pin type
    if (conn.wireRef) {
      const wire = harness.wires.find(w => w.id === conn.wireRef);
      if (wire?.color) {
        return this.cssColor(wire.color);
      }
    }

    // Try pin signal type
    const fromNode = harness.nodes.find(n => n.id === conn.from.componentId);
    if (fromNode) {
      const pin = fromNode.component.pins.find(p => p.id === conn.from.pinId);
      if (pin) {
        return DEFAULT_WIRE_COLORS[pin.signalType] ?? DEFAULT_WIRE_COLORS.default;
      }
    }

    return DEFAULT_WIRE_COLORS.default;
  }

  private cssColor(name: string): string {
    const map: Record<string, string> = {
      black: '#222222',
      red: '#cc0000',
      white: '#aaaaaa',
      green: '#228B22',
      blue: '#0066cc',
      yellow: '#ccaa00',
      orange: '#cc6600',
      brown: '#8B4513',
      violet: '#7B2D8B',
      gray: '#888888',
      pink: '#cc6699',
    };
    return map[name.toLowerCase()] ?? DEFAULT_WIRE_COLORS.default;
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
