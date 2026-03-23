import type { Harness } from '../models/harness.js';
import type { BomSummary } from '../bom/generator.js';
import { SvgExporter, type SvgExportOptions } from './svg.js';
import { BomGenerator } from '../bom/generator.js';

export interface ExportResult {
  filename: string;
  mimeType: string;
  content: string;
}

/**
 * ExportManager: coordinates exporting harness designs
 * in multiple formats (SVG, CSV BOM, JSON).
 */
export class ExportManager {
  private svgExporter = new SvgExporter();
  private bomGenerator = new BomGenerator();

  /**
   * Export harness schematic as SVG.
   */
  exportSvg(harness: Harness, options?: SvgExportOptions): ExportResult {
    const content = this.svgExporter.export(harness, options);
    return {
      filename: `${sanitizeFilename(harness.name)}_v${harness.version}.svg`,
      mimeType: 'image/svg+xml',
      content,
    };
  }

  /**
   * Export Bill of Materials as CSV.
   */
  exportBomCsv(harness: Harness): ExportResult {
    const bom = this.bomGenerator.generate(harness);
    const content = this.bomGenerator.toCSV(bom);
    return {
      filename: `${sanitizeFilename(harness.name)}_BOM_v${harness.version}.csv`,
      mimeType: 'text/csv',
      content,
    };
  }

  /**
   * Export Bill of Materials as formatted text.
   */
  exportBomText(harness: Harness): ExportResult {
    const bom = this.bomGenerator.generate(harness);
    const content = this.bomGenerator.toTextTable(bom);
    return {
      filename: `${sanitizeFilename(harness.name)}_BOM_v${harness.version}.txt`,
      mimeType: 'text/plain',
      content,
    };
  }

  /**
   * Export full harness design as JSON (for save/load).
   */
  exportJson(harness: Harness): ExportResult {
    const content = JSON.stringify(harness, null, 2);
    return {
      filename: `${sanitizeFilename(harness.name)}_v${harness.version}.json`,
      mimeType: 'application/json',
      content,
    };
  }

  /**
   * Import harness design from JSON.
   */
  importJson(json: string): Harness {
    return JSON.parse(json) as Harness;
  }

  /**
   * Export a connection list / net list.
   */
  exportNetlist(harness: Harness): ExportResult {
    const lines: string[] = [];
    lines.push(`* Netlist: ${harness.name} v${harness.version}`);
    lines.push(`* Generated: ${new Date().toISOString()}`);
    lines.push('');

    // Group connections by signal label
    const signals = new Map<string, typeof harness.connections>();
    for (const conn of harness.connections) {
      const label = conn.signalLabel || 'UNNAMED';
      const list = signals.get(label) ?? [];
      list.push(conn);
      signals.set(label, list);
    }

    for (const [signal, conns] of signals) {
      lines.push(`NET: ${signal}`);
      for (const conn of conns) {
        const fromNode = harness.nodes.find(n => n.id === conn.from.componentId);
        const toNode = harness.nodes.find(n => n.id === conn.to.componentId);
        const fromPin = fromNode?.component.pins.find(p => p.id === conn.from.pinId);
        const toPin = toNode?.component.pins.find(p => p.id === conn.to.pinId);

        lines.push(
          `  ${fromNode?.label ?? '?'}.${fromPin?.label ?? '?'} -> ${toNode?.label ?? '?'}.${toPin?.label ?? '?'}`
        );
      }
      lines.push('');
    }

    return {
      filename: `${sanitizeFilename(harness.name)}_netlist_v${harness.version}.txt`,
      mimeType: 'text/plain',
      content: lines.join('\n'),
    };
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-. ]/g, '_').replace(/\s+/g, '_');
}
