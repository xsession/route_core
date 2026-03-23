import { describe, it, expect, beforeEach } from 'vitest';
import { HarnessBuilder } from '../builder.js';
import { createHarness } from '../../models/harness.js';
import type { Component } from '../../models/component.js';
import type { Wire } from '../../models/wire.js';
import type { Cable } from '../../models/cable.js';

function makeComponent(overrides: Partial<Component> = {}): Component {
  return {
    id: 'comp-1',
    name: 'Connector',
    manufacturer: 'Mfr',
    partNumber: 'PN-01',
    category: 'connector',
    type: 'free_hanging',
    pins: [
      { id: 'pin-a', label: '1', position: { x: 0, y: 5 }, direction: 'left', signalType: 'signal', gender: 'neutral' },
      { id: 'pin-b', label: '2', position: { x: 0, y: 15 }, direction: 'left', signalType: 'power', gender: 'neutral' },
    ],
    footprint: { width: 20, height: 30, pinLayout: 'single_row' },
    description: 'Test connector',
    tags: [],
    custom: false,
    ...overrides,
  };
}

describe('HarnessBuilder', () => {
  let builder: HarnessBuilder;

  beforeEach(() => {
    const harness = createHarness('Test', 'Engineer');
    builder = new HarnessBuilder(harness);
  });

  describe('placeComponent', () => {
    it('adds a node to the harness', () => {
      const comp = makeComponent();
      const node = builder.placeComponent(comp, { x: 100, y: 200 });

      expect(node.componentId).toBe(comp.id);
      expect(node.position).toEqual({ x: 100, y: 200 });
      expect(builder.getHarness().nodes.length).toBe(1);
    });

    it('auto-labels based on component category', () => {
      const connector = makeComponent({ category: 'connector' });
      const motor = makeComponent({ id: 'c2', category: 'motor' });

      const n1 = builder.placeComponent(connector, { x: 0, y: 0 });
      const n2 = builder.placeComponent(motor, { x: 100, y: 0 });

      expect(n1.label).toBe('J1');
      expect(n2.label).toBe('M1');
    });

    it('increments label counter per category', () => {
      const c1 = makeComponent({ id: 'c1' });
      const c2 = makeComponent({ id: 'c2' });

      const n1 = builder.placeComponent(c1, { x: 0, y: 0 });
      const n2 = builder.placeComponent(c2, { x: 100, y: 0 });

      expect(n1.label).toBe('J1');
      expect(n2.label).toBe('J2');
    });

    it('uses custom label when provided', () => {
      const comp = makeComponent();
      const node = builder.placeComponent(comp, { x: 0, y: 0 }, 'P1');
      expect(node.label).toBe('P1');
    });

    it('creates a deep copy of the component', () => {
      const comp = makeComponent();
      const node = builder.placeComponent(comp, { x: 0, y: 0 });
      comp.name = 'MODIFIED';
      expect(node.component.name).toBe('Connector');
    });

    it('initializes node with rotation=0 and locked=false', () => {
      const comp = makeComponent();
      const node = builder.placeComponent(comp, { x: 0, y: 0 });
      expect(node.rotation).toBe(0);
      expect(node.locked).toBe(false);
    });

    it('updates the harness updatedAt timestamp', () => {
      const before = builder.getHarness().updatedAt;
      const comp = makeComponent();
      builder.placeComponent(comp, { x: 0, y: 0 });
      expect(builder.getHarness().updatedAt >= before).toBe(true);
    });
  });

  describe('removeNode', () => {
    it('removes the node from the harness', () => {
      const comp = makeComponent();
      const node = builder.placeComponent(comp, { x: 0, y: 0 });
      expect(builder.removeNode(node.id)).toBe(true);
      expect(builder.getHarness().nodes.length).toBe(0);
    });

    it('returns false for non-existent node', () => {
      expect(builder.removeNode('nonexistent')).toBe(false);
    });

    it('removes connections referencing the node', () => {
      const c1 = makeComponent({ id: 'c1' });
      const c2 = makeComponent({ id: 'c2' });
      const n1 = builder.placeComponent(c1, { x: 0, y: 0 });
      const n2 = builder.placeComponent(c2, { x: 100, y: 0 });

      builder.connect(
        { componentId: n1.id, pinId: 'pin-a' },
        { componentId: n2.id, pinId: 'pin-a' },
        'SIG'
      );

      expect(builder.getHarness().connections.length).toBe(1);
      builder.removeNode(n1.id);
      expect(builder.getHarness().connections.length).toBe(0);
    });
  });

  describe('moveNode', () => {
    it('updates node position', () => {
      const comp = makeComponent();
      const node = builder.placeComponent(comp, { x: 0, y: 0 });
      builder.moveNode(node.id, { x: 50, y: 60 });

      const moved = builder.findNode(node.id)!;
      // With snapToGrid=true (default gridSize=10), position should be snapped
      expect(moved.position.x).toBe(50);
      expect(moved.position.y).toBe(60);
    });

    it('snaps to grid when enabled', () => {
      const comp = makeComponent();
      const node = builder.placeComponent(comp, { x: 0, y: 0 });
      builder.moveNode(node.id, { x: 53, y: 67 });

      const moved = builder.findNode(node.id)!;
      expect(moved.position.x).toBe(50);
      expect(moved.position.y).toBe(70);
    });

    it('returns false for non-existent node', () => {
      expect(builder.moveNode('nonexistent', { x: 0, y: 0 })).toBe(false);
    });
  });

  describe('rotateNode', () => {
    it('rotates the node by the given degrees', () => {
      const comp = makeComponent();
      const node = builder.placeComponent(comp, { x: 0, y: 0 });
      builder.rotateNode(node.id, 90);

      expect(builder.findNode(node.id)!.rotation).toBe(90);
    });

    it('accumulates rotation', () => {
      const comp = makeComponent();
      const node = builder.placeComponent(comp, { x: 0, y: 0 });
      builder.rotateNode(node.id, 90);
      builder.rotateNode(node.id, 90);

      expect(builder.findNode(node.id)!.rotation).toBe(180);
    });

    it('wraps at 360 degrees', () => {
      const comp = makeComponent();
      const node = builder.placeComponent(comp, { x: 0, y: 0 });
      builder.rotateNode(node.id, 270);
      builder.rotateNode(node.id, 180);

      expect(builder.findNode(node.id)!.rotation).toBe(90);
    });
  });

  describe('renameNode', () => {
    it('changes the label', () => {
      const comp = makeComponent();
      const node = builder.placeComponent(comp, { x: 0, y: 0 });
      builder.renameNode(node.id, 'X99');
      expect(builder.findNode(node.id)!.label).toBe('X99');
    });
  });

  describe('lockNode', () => {
    it('toggles lock state', () => {
      const comp = makeComponent();
      const node = builder.placeComponent(comp, { x: 0, y: 0 });
      builder.lockNode(node.id, true);
      expect(builder.findNode(node.id)!.locked).toBe(true);

      builder.lockNode(node.id, false);
      expect(builder.findNode(node.id)!.locked).toBe(false);
    });
  });

  describe('connect / disconnect', () => {
    it('creates a connection between two pins', () => {
      const c1 = makeComponent({ id: 'c1' });
      const c2 = makeComponent({ id: 'c2' });
      const n1 = builder.placeComponent(c1, { x: 0, y: 0 });
      const n2 = builder.placeComponent(c2, { x: 100, y: 0 });

      const conn = builder.connect(
        { componentId: n1.id, pinId: 'pin-a' },
        { componentId: n2.id, pinId: 'pin-a' },
        'SIG1'
      );

      expect(conn).not.toBeNull();
      expect(conn!.signalLabel).toBe('SIG1');
      expect(builder.getHarness().connections.length).toBe(1);
    });

    it('prevents duplicate connections', () => {
      const c1 = makeComponent({ id: 'c1' });
      const c2 = makeComponent({ id: 'c2' });
      const n1 = builder.placeComponent(c1, { x: 0, y: 0 });
      const n2 = builder.placeComponent(c2, { x: 100, y: 0 });

      builder.connect(
        { componentId: n1.id, pinId: 'pin-a' },
        { componentId: n2.id, pinId: 'pin-a' },
        'SIG1'
      );
      const dup = builder.connect(
        { componentId: n1.id, pinId: 'pin-a' },
        { componentId: n2.id, pinId: 'pin-a' },
        'SIG1'
      );

      expect(dup).toBeNull();
      expect(builder.getHarness().connections.length).toBe(1);
    });

    it('prevents reverse-duplicate connections', () => {
      const c1 = makeComponent({ id: 'c1' });
      const c2 = makeComponent({ id: 'c2' });
      const n1 = builder.placeComponent(c1, { x: 0, y: 0 });
      const n2 = builder.placeComponent(c2, { x: 100, y: 0 });

      builder.connect(
        { componentId: n1.id, pinId: 'pin-a' },
        { componentId: n2.id, pinId: 'pin-a' },
        'SIG1'
      );
      const dup = builder.connect(
        { componentId: n2.id, pinId: 'pin-a' },
        { componentId: n1.id, pinId: 'pin-a' },
        'SIG1'
      );

      expect(dup).toBeNull();
    });

    it('returns null for invalid endpoints', () => {
      const comp = makeComponent();
      builder.placeComponent(comp, { x: 0, y: 0 });

      const conn = builder.connect(
        { componentId: 'nonexistent', pinId: 'pin-a' },
        { componentId: 'nonexistent2', pinId: 'pin-a' },
        'SIG'
      );

      expect(conn).toBeNull();
    });

    it('disconnects a connection', () => {
      const c1 = makeComponent({ id: 'c1' });
      const c2 = makeComponent({ id: 'c2' });
      const n1 = builder.placeComponent(c1, { x: 0, y: 0 });
      const n2 = builder.placeComponent(c2, { x: 100, y: 0 });

      const conn = builder.connect(
        { componentId: n1.id, pinId: 'pin-a' },
        { componentId: n2.id, pinId: 'pin-a' },
        'SIG1'
      )!;

      expect(builder.disconnect(conn.id)).toBe(true);
      expect(builder.getHarness().connections.length).toBe(0);
    });

    it('returns false for non-existent connection disconnect', () => {
      expect(builder.disconnect('nonexistent')).toBe(false);
    });
  });

  describe('getConnectionsForNode', () => {
    it('returns connections involving a node', () => {
      const c1 = makeComponent({ id: 'c1' });
      const c2 = makeComponent({ id: 'c2' });
      const c3 = makeComponent({ id: 'c3' });
      const n1 = builder.placeComponent(c1, { x: 0, y: 0 });
      const n2 = builder.placeComponent(c2, { x: 100, y: 0 });
      const n3 = builder.placeComponent(c3, { x: 200, y: 0 });

      builder.connect({ componentId: n1.id, pinId: 'pin-a' }, { componentId: n2.id, pinId: 'pin-a' }, 'A');
      builder.connect({ componentId: n2.id, pinId: 'pin-b' }, { componentId: n3.id, pinId: 'pin-a' }, 'B');

      const conns = builder.getConnectionsForNode(n2.id);
      expect(conns.length).toBe(2);
    });
  });

  describe('getConnectionsForPin', () => {
    it('returns connections for a specific pin', () => {
      const c1 = makeComponent({ id: 'c1' });
      const c2 = makeComponent({ id: 'c2' });
      const n1 = builder.placeComponent(c1, { x: 0, y: 0 });
      const n2 = builder.placeComponent(c2, { x: 100, y: 0 });

      builder.connect({ componentId: n1.id, pinId: 'pin-a' }, { componentId: n2.id, pinId: 'pin-a' }, 'A');
      builder.connect({ componentId: n1.id, pinId: 'pin-b' }, { componentId: n2.id, pinId: 'pin-b' }, 'B');

      const conns = builder.getConnectionsForPin(n1.id, 'pin-a');
      expect(conns.length).toBe(1);
      expect(conns[0].signalLabel).toBe('A');
    });
  });

  describe('splice operations', () => {
    it('adds and removes splices', () => {
      const splice = builder.addSplice({ x: 50, y: 50 }, [], 'crimp', 'SP1');
      expect(builder.getHarness().splices.length).toBe(1);
      expect(splice.label).toBe('SP1');

      expect(builder.removeSplice(splice.id)).toBe(true);
      expect(builder.getHarness().splices.length).toBe(0);
    });

    it('returns false when removing non-existent splice', () => {
      expect(builder.removeSplice('nope')).toBe(false);
    });
  });

  describe('addWire / addCable', () => {
    it('adds wires to the harness', () => {
      const wire: Wire = {
        id: 'w1', gauge: 22, color: 'red', material: 'copper',
        insulationType: 'PVC', currentRating: 3, voltageRating: 300, temperatureRating: 105,
      };
      builder.addWire(wire);
      expect(builder.getHarness().wires.length).toBe(1);
    });

    it('adds cables to the harness', () => {
      const cable: Cable = {
        id: 'cb1', name: 'Test', conductors: [], jacket: { material: 'PVC', color: 'black', outerDiameter: 5 },
        outerDiameter: 6, bendRadius: 24, weightPerMeter: 50,
        temperatureRange: { min: -20, max: 105 }, description: '', custom: false,
      };
      builder.addCable(cable);
      expect(builder.getHarness().cables.length).toBe(1);
    });
  });

  describe('saveRevision', () => {
    it('increments the version number', () => {
      expect(builder.getHarness().version).toBe(1);
      builder.saveRevision('First save');
      expect(builder.getHarness().version).toBe(2);
    });

    it('stores the revision snapshot', () => {
      builder.saveRevision('Checkpoint');
      const revisions = builder.getHarness().revisions;
      expect(revisions.length).toBe(1);
      expect(revisions[0].message).toBe('Checkpoint');
      expect(revisions[0].snapshot).toBeTruthy();
    });

    it('stores parseable snapshot', () => {
      const comp = makeComponent();
      builder.placeComponent(comp, { x: 10, y: 20 });
      builder.saveRevision('With component');

      const snapshot = JSON.parse(builder.getHarness().revisions[0].snapshot);
      expect(snapshot.nodes.length).toBe(1);
    });
  });
});
