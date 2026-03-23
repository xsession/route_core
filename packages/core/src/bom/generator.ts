import type { Harness } from '../models/harness.js';

export interface BomEntry {
  refDesignator: string;
  partNumber: string;
  manufacturer: string;
  description: string;
  category: string;
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
  notes: string;
}

export interface BomSummary {
  title: string;
  harnessName: string;
  version: number;
  generatedAt: string;
  entries: BomEntry[];
  totalParts: number;
  totalUniquePartNumbers: number;
  estimatedCost?: number;
}

/**
 * BomGenerator: produces a Bill of Materials from a harness design.
 * Aggregates connectors, wires, cables, and terminals with quantities.
 */
export class BomGenerator {
  generate(harness: Harness): BomSummary {
    const entries: BomEntry[] = [];

    // Component entries
    entries.push(...this.collectComponentEntries(harness));

    // Wire entries
    entries.push(...this.collectWireEntries(harness));

    // Cable entries
    entries.push(...this.collectCableEntries(harness));

    // Consolidate duplicates by partNumber
    const consolidated = this.consolidate(entries);

    const estimatedCost = consolidated.reduce(
      (sum, e) => sum + (e.totalPrice ?? 0),
      0
    );

    return {
      title: `BOM - ${harness.name}`,
      harnessName: harness.name,
      version: harness.version,
      generatedAt: new Date().toISOString(),
      entries: consolidated,
      totalParts: consolidated.reduce((sum, e) => sum + e.quantity, 0),
      totalUniquePartNumbers: new Set(consolidated.map(e => e.partNumber).filter(Boolean)).size,
      estimatedCost: estimatedCost > 0 ? estimatedCost : undefined,
    };
  }

  /**
   * Export BOM as CSV string.
   */
  toCSV(summary: BomSummary): string {
    const headers = [
      'Ref Designator',
      'Part Number',
      'Manufacturer',
      'Description',
      'Category',
      'Quantity',
      'Unit Price',
      'Total Price',
      'Notes',
    ];

    const rows = summary.entries.map(e => [
      e.refDesignator,
      e.partNumber,
      e.manufacturer,
      csvEscape(e.description),
      e.category,
      String(e.quantity),
      e.unitPrice != null ? e.unitPrice.toFixed(2) : '',
      e.totalPrice != null ? e.totalPrice.toFixed(2) : '',
      csvEscape(e.notes),
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  /**
   * Export BOM as a simple text table.
   */
  toTextTable(summary: BomSummary): string {
    const lines: string[] = [];
    lines.push(`= ${summary.title} =`);
    lines.push(`Version: ${summary.version}`);
    lines.push(`Generated: ${summary.generatedAt}`);
    lines.push('');

    const colWidths = { ref: 8, pn: 20, mfr: 18, desc: 30, cat: 14, qty: 5 };
    const header =
      pad('Ref', colWidths.ref) +
      pad('Part Number', colWidths.pn) +
      pad('Manufacturer', colWidths.mfr) +
      pad('Description', colWidths.desc) +
      pad('Category', colWidths.cat) +
      pad('Qty', colWidths.qty);

    lines.push(header);
    lines.push('-'.repeat(header.length));

    for (const e of summary.entries) {
      lines.push(
        pad(e.refDesignator, colWidths.ref) +
        pad(e.partNumber || '-', colWidths.pn) +
        pad(e.manufacturer || '-', colWidths.mfr) +
        pad(e.description, colWidths.desc) +
        pad(e.category, colWidths.cat) +
        pad(String(e.quantity), colWidths.qty)
      );
    }

    lines.push('');
    lines.push(`Total parts: ${summary.totalParts}`);
    lines.push(`Unique part numbers: ${summary.totalUniquePartNumbers}`);
    if (summary.estimatedCost != null) {
      lines.push(`Estimated cost: $${summary.estimatedCost.toFixed(2)}`);
    }

    return lines.join('\n');
  }

  // --- Internal ---

  private collectComponentEntries(harness: Harness): BomEntry[] {
    return harness.nodes.map(node => ({
      refDesignator: node.label,
      partNumber: node.component.partNumber,
      manufacturer: node.component.manufacturer,
      description: node.component.name,
      category: node.component.category,
      quantity: 1,
      notes: node.component.custom ? 'Custom component' : '',
    }));
  }

  private collectWireEntries(harness: Harness): BomEntry[] {
    // Group wires by gauge + color
    const wireGroups = new Map<string, { wire: typeof harness.wires[0]; count: number }>();

    for (const wire of harness.wires) {
      const key = `${wire.gauge}AWG-${wire.color}-${wire.material}`;
      const group = wireGroups.get(key);
      if (group) {
        group.count++;
      } else {
        wireGroups.set(key, { wire, count: 1 });
      }
    }

    return Array.from(wireGroups.values()).map(({ wire, count }) => ({
      refDesignator: 'W',
      partNumber: '',
      manufacturer: '',
      description: `${wire.gauge} AWG ${wire.color} ${wire.material} wire`,
      category: 'wire',
      quantity: count,
      notes: `${wire.insulationType} insulation, ${wire.currentRating}A rating`,
    }));
  }

  private collectCableEntries(harness: Harness): BomEntry[] {
    return harness.cables.map(cable => ({
      refDesignator: 'CBL',
      partNumber: cable.partNumber ?? '',
      manufacturer: cable.manufacturer ?? '',
      description: `${cable.name} (${cable.conductors.length}C)`,
      category: 'cable',
      quantity: 1,
      notes: cable.shielding ? `Shielded (${cable.shielding.type})` : '',
    }));
  }

  private consolidate(entries: BomEntry[]): BomEntry[] {
    // Group by partNumber when available, otherwise keep individual
    const groups = new Map<string, BomEntry>();

    for (const entry of entries) {
      const key = entry.partNumber
        ? `pn:${entry.partNumber}`
        : `unique:${entry.refDesignator}:${entry.description}`;

      const existing = groups.get(key);
      if (existing) {
        existing.quantity += entry.quantity;
        if (existing.refDesignator !== entry.refDesignator) {
          existing.refDesignator += `, ${entry.refDesignator}`;
        }
      } else {
        groups.set(key, { ...entry });
      }
    }

    return Array.from(groups.values());
  }
}

function pad(str: string, width: number): string {
  return str.length >= width ? str.slice(0, width) : str + ' '.repeat(width - str.length);
}

function csvEscape(str: string): string {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
