import type { Harness, HarnessNode } from '../models/harness.js';
import type { Connection } from '../models/connection.js';

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  nodeId?: string;
  connectionId?: string;
  message: string;
  code: string;
}

/**
 * HarnessValidator: checks a harness design for errors and warnings.
 */
export class HarnessValidator {
  validate(harness: Harness): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    issues.push(...this.checkUnconnectedPins(harness));
    issues.push(...this.checkDuplicateLabels(harness));
    issues.push(...this.checkCurrentRatings(harness));
    issues.push(...this.checkOverlappingNodes(harness));
    issues.push(...this.checkSelfConnections(harness));

    return issues;
  }

  private checkUnconnectedPins(harness: Harness): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const node of harness.nodes) {
      for (const pin of node.component.pins) {
        if (pin.signalType === 'nc') continue;

        const connected = harness.connections.some(
          c =>
            (c.from.componentId === node.id && c.from.pinId === pin.id) ||
            (c.to.componentId === node.id && c.to.pinId === pin.id)
        );

        if (!connected) {
          issues.push({
            severity: 'warning',
            nodeId: node.id,
            message: `Pin "${pin.label}" on ${node.label} is not connected`,
            code: 'UNCONNECTED_PIN',
          });
        }
      }
    }

    return issues;
  }

  private checkDuplicateLabels(harness: Harness): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const labels = new Map<string, HarnessNode[]>();

    for (const node of harness.nodes) {
      const existing = labels.get(node.label) ?? [];
      existing.push(node);
      labels.set(node.label, existing);
    }

    for (const [label, nodes] of labels) {
      if (nodes.length > 1) {
        for (const node of nodes) {
          issues.push({
            severity: 'error',
            nodeId: node.id,
            message: `Duplicate component label "${label}"`,
            code: 'DUPLICATE_LABEL',
          });
        }
      }
    }

    return issues;
  }

  private checkCurrentRatings(harness: Harness): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const conn of harness.connections) {
      if (!conn.wireRef) continue;

      const wire = harness.wires.find(w => w.id === conn.wireRef);
      if (!wire) continue;

      // Check both endpoints for current rating compatibility
      for (const ep of [conn.from, conn.to]) {
        const node = harness.nodes.find(n => n.id === ep.componentId);
        if (!node) continue;

        const pin = node.component.pins.find(p => p.id === ep.pinId);
        if (!pin?.currentRating) continue;

        if (wire.currentRating < pin.currentRating) {
          issues.push({
            severity: 'error',
            connectionId: conn.id,
            message: `Wire gauge ${wire.gauge} AWG (${wire.currentRating}A) may be insufficient for pin "${pin.label}" on ${node.label} (rated ${pin.currentRating}A)`,
            code: 'CURRENT_RATING_EXCEEDED',
          });
        }
      }
    }

    return issues;
  }

  private checkOverlappingNodes(harness: Harness): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const nodes = harness.nodes;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dist = Math.hypot(
          a.position.x - b.position.x,
          a.position.y - b.position.y
        );

        const minDist = Math.max(
          a.component.footprint.width,
          b.component.footprint.width
        );

        if (dist < minDist * 0.5) {
          issues.push({
            severity: 'warning',
            nodeId: a.id,
            message: `Components "${a.label}" and "${b.label}" overlap`,
            code: 'OVERLAPPING_NODES',
          });
        }
      }
    }

    return issues;
  }

  private checkSelfConnections(harness: Harness): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const conn of harness.connections) {
      if (conn.from.componentId === conn.to.componentId &&
          conn.from.pinId === conn.to.pinId) {
        issues.push({
          severity: 'error',
          connectionId: conn.id,
          message: `Connection "${conn.signalLabel}" connects a pin to itself`,
          code: 'SELF_CONNECTION',
        });
      }
    }

    return issues;
  }
}
