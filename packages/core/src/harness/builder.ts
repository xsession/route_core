import type { Harness, HarnessNode } from '../models/harness.js';
import type { Component } from '../models/component.js';
import type { Connection, ConnectionEndpoint, SplicePoint } from '../models/connection.js';
import type { Wire } from '../models/wire.js';
import type { Cable } from '../models/cable.js';
import { generateId } from '../models/harness.js';

/**
 * HarnessBuilder: imperative API for constructing and modifying harness designs.
 * All mutations are performed through this builder to maintain consistency.
 */
export class HarnessBuilder {
  constructor(private harness: Harness) {}

  getHarness(): Harness {
    return this.harness;
  }

  // --- Node (placed component) operations ---

  placeComponent(
    component: Component,
    position: { x: number; y: number },
    label?: string
  ): HarnessNode {
    const node: HarnessNode = {
      id: generateId(),
      componentId: component.id,
      component: structuredClone(component),
      position,
      rotation: 0,
      label: label ?? this.autoLabel(component),
      locked: false,
    };
    this.harness.nodes.push(node);
    this.touch();
    return node;
  }

  removeNode(nodeId: string): boolean {
    const idx = this.harness.nodes.findIndex(n => n.id === nodeId);
    if (idx === -1) return false;

    // Remove all connections referencing this node
    this.harness.connections = this.harness.connections.filter(
      c => c.from.componentId !== nodeId && c.to.componentId !== nodeId
    );

    this.harness.nodes.splice(idx, 1);
    this.touch();
    return true;
  }

  moveNode(nodeId: string, position: { x: number; y: number }): boolean {
    const node = this.findNode(nodeId);
    if (!node) return false;

    if (this.harness.canvas.snapToGrid) {
      const grid = this.harness.canvas.gridSize;
      position.x = Math.round(position.x / grid) * grid;
      position.y = Math.round(position.y / grid) * grid;
    }

    node.position = position;
    this.touch();
    return true;
  }

  rotateNode(nodeId: string, degrees: number): boolean {
    const node = this.findNode(nodeId);
    if (!node) return false;
    node.rotation = (node.rotation + degrees) % 360;
    this.touch();
    return true;
  }

  renameNode(nodeId: string, label: string): boolean {
    const node = this.findNode(nodeId);
    if (!node) return false;
    node.label = label;
    this.touch();
    return true;
  }

  lockNode(nodeId: string, locked: boolean): boolean {
    const node = this.findNode(nodeId);
    if (!node) return false;
    node.locked = locked;
    return true;
  }

  findNode(nodeId: string): HarnessNode | undefined {
    return this.harness.nodes.find(n => n.id === nodeId);
  }

  // --- Connection operations ---

  connect(
    from: ConnectionEndpoint,
    to: ConnectionEndpoint,
    signalLabel: string,
    wireOrCable?: { wireRef?: string; cableRef?: string; conductorIndex?: number }
  ): Connection | null {
    // Validate endpoints exist
    if (!this.validateEndpoint(from) || !this.validateEndpoint(to)) {
      return null;
    }

    // Prevent duplicate connections
    const exists = this.harness.connections.some(
      c =>
        (c.from.componentId === from.componentId && c.from.pinId === from.pinId &&
         c.to.componentId === to.componentId && c.to.pinId === to.pinId) ||
        (c.from.componentId === to.componentId && c.from.pinId === to.pinId &&
         c.to.componentId === from.componentId && c.to.pinId === from.pinId)
    );
    if (exists) return null;

    const connection: Connection = {
      id: generateId(),
      from,
      to,
      signalLabel,
      wireRef: wireOrCable?.wireRef,
      cableRef: wireOrCable?.cableRef,
      conductorIndex: wireOrCable?.conductorIndex,
    };

    this.harness.connections.push(connection);
    this.touch();
    return connection;
  }

  disconnect(connectionId: string): boolean {
    const idx = this.harness.connections.findIndex(c => c.id === connectionId);
    if (idx === -1) return false;
    this.harness.connections.splice(idx, 1);
    this.touch();
    return true;
  }

  getConnectionsForNode(nodeId: string): Connection[] {
    return this.harness.connections.filter(
      c => c.from.componentId === nodeId || c.to.componentId === nodeId
    );
  }

  getConnectionsForPin(nodeId: string, pinId: string): Connection[] {
    return this.harness.connections.filter(
      c =>
        (c.from.componentId === nodeId && c.from.pinId === pinId) ||
        (c.to.componentId === nodeId && c.to.pinId === pinId)
    );
  }

  // --- Splice operations ---

  addSplice(
    position: { x: number; y: number },
    connectionIds: string[],
    method: SplicePoint['method'],
    label: string
  ): SplicePoint {
    const splice: SplicePoint = {
      id: generateId(),
      position,
      connectionIds,
      method,
      label,
    };
    this.harness.splices.push(splice);
    this.touch();
    return splice;
  }

  removeSplice(spliceId: string): boolean {
    const idx = this.harness.splices.findIndex(s => s.id === spliceId);
    if (idx === -1) return false;
    this.harness.splices.splice(idx, 1);
    this.touch();
    return true;
  }

  // --- Wire / Cable registration ---

  addWire(wire: Wire): void {
    this.harness.wires.push(wire);
    this.touch();
  }

  addCable(cable: Cable): void {
    this.harness.cables.push(cable);
    this.touch();
  }

  // --- Revision control ---

  saveRevision(message: string): void {
    const revision = {
      version: this.harness.version,
      timestamp: new Date().toISOString(),
      author: this.harness.author,
      message,
      snapshot: JSON.stringify(this.harness),
    };
    this.harness.revisions.push(revision);
    this.harness.version++;
    this.touch();
  }

  // --- Helpers ---

  private validateEndpoint(ep: ConnectionEndpoint): boolean {
    const node = this.findNode(ep.componentId);
    if (!node) return false;
    return node.component.pins.some(p => p.id === ep.pinId);
  }

  private autoLabel(component: Component): string {
    const prefixes: Record<string, string> = {
      connector: 'J',
      terminal: 'TB',
      motor: 'M',
      relay: 'K',
      contactor: 'K',
      power_supply: 'PS',
      sensor: 'S',
      switch: 'SW',
      fuse: 'F',
      circuit_breaker: 'CB',
      controller: 'U',
      device: 'X',
    };
    const prefix = prefixes[component.category] ?? 'X';
    const count = this.harness.nodes.filter(
      n => n.component.category === component.category
    ).length;
    return `${prefix}${count + 1}`;
  }

  private touch(): void {
    this.harness.updatedAt = new Date().toISOString();
  }
}
