import type { HarnessNode } from '../models/harness.js';
import type { Connection } from '../models/connection.js';

export interface RoutePoint {
  x: number;
  y: number;
}

export interface RoutedWire {
  connectionId: string;
  path: RoutePoint[];
}

/**
 * WireRouter: calculates visual paths for wire connections between
 * component pins on the canvas. Uses Manhattan routing (orthogonal segments).
 */
export class WireRouter {
  private margin = 20; // clearance around components

  /**
   * Route a single connection between two nodes.
   * Uses Manhattan (L-shaped or Z-shaped) routing.
   */
  routeConnection(
    connection: Connection,
    nodes: HarnessNode[]
  ): RoutedWire {
    const fromNode = nodes.find(n => n.id === connection.from.componentId);
    const toNode = nodes.find(n => n.id === connection.to.componentId);

    if (!fromNode || !toNode) {
      return { connectionId: connection.id, path: [] };
    }

    const fromPin = fromNode.component.pins.find(p => p.id === connection.from.pinId);
    const toPin = toNode.component.pins.find(p => p.id === connection.to.pinId);

    if (!fromPin || !toPin) {
      return { connectionId: connection.id, path: [] };
    }

    const start = this.pinWorldPosition(fromNode, fromPin.position);
    const end = this.pinWorldPosition(toNode, toPin.position);

    const path = this.manhattanRoute(start, end, fromPin.direction, toPin.direction);

    return { connectionId: connection.id, path };
  }

  /**
   * Route all connections in the harness.
   */
  routeAll(connections: Connection[], nodes: HarnessNode[]): RoutedWire[] {
    return connections.map(c => this.routeConnection(c, nodes));
  }

  private manhattanRoute(
    start: RoutePoint,
    end: RoutePoint,
    fromDir: string,
    toDir: string
  ): RoutePoint[] {
    const m = this.margin;
    const points: RoutePoint[] = [start];

    // Extend from pin direction
    const exitPoint = this.extendFromPin(start, fromDir, m);
    points.push(exitPoint);

    // Extend toward target pin direction
    const entryPoint = this.extendFromPin(end, toDir, m);

    // Connect exit to entry with an L or Z bend
    if (Math.abs(exitPoint.x - entryPoint.x) < 1) {
      // Vertically aligned — direct vertical segment
      points.push(entryPoint);
    } else if (Math.abs(exitPoint.y - entryPoint.y) < 1) {
      // Horizontally aligned — direct horizontal segment
      points.push(entryPoint);
    } else {
      // Z-shaped routing: horizontal then vertical
      const midX = (exitPoint.x + entryPoint.x) / 2;
      points.push({ x: midX, y: exitPoint.y });
      points.push({ x: midX, y: entryPoint.y });
      points.push(entryPoint);
    }

    points.push(end);
    return points;
  }

  private extendFromPin(
    point: RoutePoint,
    direction: string,
    distance: number
  ): RoutePoint {
    switch (direction) {
      case 'left':  return { x: point.x - distance, y: point.y };
      case 'right': return { x: point.x + distance, y: point.y };
      case 'top':   return { x: point.x, y: point.y - distance };
      case 'bottom':return { x: point.x, y: point.y + distance };
      default:      return { x: point.x + distance, y: point.y };
    }
  }

  private pinWorldPosition(
    node: HarnessNode,
    pinPos: { x: number; y: number }
  ): RoutePoint {
    // Apply node position offset (rotation ignored for simplicity in v1)
    return {
      x: node.position.x + pinPos.x,
      y: node.position.y + pinPos.y,
    };
  }
}
