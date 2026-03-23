import { describe, it, expect } from 'vitest';
import { WireRouter } from '../router.js';
import type { Connection } from '../../models/connection.js';
import type { HarnessNode } from '../../models/harness.js';
import type { Component } from '../../models/component.js';

function makeNode(id: string, x: number, y: number, pins: Component['pins'] = []): HarnessNode {
  const comp: Component = {
    id: `comp-${id}`,
    name: 'Test',
    manufacturer: '',
    partNumber: '',
    category: 'connector',
    type: 'free_hanging',
    shape: 'rectangular',
    pins,
    footprint: { width: 20, height: 30, pinLayout: 'single_row' },
    description: '',
    tags: [],
    custom: false,
  };
  return {
    id,
    componentId: comp.id,
    component: comp,
    position: { x, y },
    rotation: 0,
    label: `J${id}`,
    locked: false,
  };
}

describe('WireRouter', () => {
  const router = new WireRouter();

  describe('routeConnection', () => {
    it('returns empty path when from-node is missing', () => {
      const conn: Connection = {
        id: 'c1',
        from: { componentId: 'missing', pinId: 'p1' },
        to: { componentId: 'n2', pinId: 'p1' },
        signalLabel: 'SIG',
      };
      const result = router.routeConnection(conn, []);
      expect(result.path).toEqual([]);
    });

    it('returns empty path when to-node is missing', () => {
      const n1 = makeNode('n1', 0, 0, [
        { id: 'p1', label: '1', position: { x: 0, y: 5 }, direction: 'left', signalType: 'signal', gender: 'neutral' },
      ]);
      const conn: Connection = {
        id: 'c1',
        from: { componentId: 'n1', pinId: 'p1' },
        to: { componentId: 'missing', pinId: 'p1' },
        signalLabel: 'SIG',
      };
      const result = router.routeConnection(conn, [n1]);
      expect(result.path).toEqual([]);
    });

    it('routes between two nodes with left-direction pins', () => {
      const pins = [
        { id: 'p1', label: '1', position: { x: 0, y: 5 }, direction: 'left' as const, signalType: 'signal' as const, gender: 'neutral' as const },
      ];
      const n1 = makeNode('n1', 0, 0, pins);
      const n2 = makeNode('n2', 200, 100, pins);
      const conn: Connection = {
        id: 'c1',
        from: { componentId: 'n1', pinId: 'p1' },
        to: { componentId: 'n2', pinId: 'p1' },
        signalLabel: 'SIG',
      };

      const result = router.routeConnection(conn, [n1, n2]);
      expect(result.connectionId).toBe('c1');
      expect(result.path.length).toBeGreaterThanOrEqual(2);

      // First point should be at pin world position
      expect(result.path[0]).toEqual({ x: 0, y: 5 });
      // Last point should be at target pin world position
      expect(result.path[result.path.length - 1]).toEqual({ x: 200, y: 105 });
    });

    it('creates Manhattan (orthogonal) routing', () => {
      const pins = [
        { id: 'p1', label: '1', position: { x: 0, y: 5 }, direction: 'left' as const, signalType: 'signal' as const, gender: 'neutral' as const },
      ];
      const n1 = makeNode('n1', 0, 0, pins);
      const n2 = makeNode('n2', 200, 100, pins);
      const conn: Connection = {
        id: 'c1',
        from: { componentId: 'n1', pinId: 'p1' },
        to: { componentId: 'n2', pinId: 'p1' },
        signalLabel: 'SIG',
      };

      const result = router.routeConnection(conn, [n1, n2]);

      // Verify Manhattan routing: each segment should be horizontal or vertical
      for (let i = 1; i < result.path.length; i++) {
        const prev = result.path[i - 1];
        const curr = result.path[i];
        const isHorizontal = Math.abs(prev.y - curr.y) < 0.01;
        const isVertical = Math.abs(prev.x - curr.x) < 0.01;
        expect(isHorizontal || isVertical).toBe(true);
      }
    });
  });

  describe('routeAll', () => {
    it('routes multiple connections', () => {
      const pins = [
        { id: 'p1', label: '1', position: { x: 0, y: 5 }, direction: 'left' as const, signalType: 'signal' as const, gender: 'neutral' as const },
        { id: 'p2', label: '2', position: { x: 0, y: 15 }, direction: 'left' as const, signalType: 'signal' as const, gender: 'neutral' as const },
      ];
      const n1 = makeNode('n1', 0, 0, pins);
      const n2 = makeNode('n2', 200, 0, pins);
      const connections: Connection[] = [
        { id: 'c1', from: { componentId: 'n1', pinId: 'p1' }, to: { componentId: 'n2', pinId: 'p1' }, signalLabel: 'A' },
        { id: 'c2', from: { componentId: 'n1', pinId: 'p2' }, to: { componentId: 'n2', pinId: 'p2' }, signalLabel: 'B' },
      ];

      const routes = router.routeAll(connections, [n1, n2]);
      expect(routes.length).toBe(2);
      expect(routes[0].connectionId).toBe('c1');
      expect(routes[1].connectionId).toBe('c2');
    });

    it('returns empty array for no connections', () => {
      const routes = router.routeAll([], []);
      expect(routes).toEqual([]);
    });
  });
});
