import type { Component, ComponentCategory, ComponentType, Footprint } from '../models/component.js';
import type { Pin, PinSignalType } from '../models/pin.js';
import { generateId } from '../models/harness.js';

export interface ComponentTemplate {
  name: string;
  category: ComponentCategory;
  pinCount: number;
  pinLayout: Footprint['pinLayout'];
  defaultPinSignal: PinSignalType;
}

// Pre-defined templates for common component types
export const COMPONENT_TEMPLATES: ComponentTemplate[] = [
  { name: '2-Pin Connector', category: 'connector', pinCount: 2, pinLayout: 'single_row', defaultPinSignal: 'power' },
  { name: '4-Pin Connector', category: 'connector', pinCount: 4, pinLayout: 'single_row', defaultPinSignal: 'signal' },
  { name: '6-Pin Connector', category: 'connector', pinCount: 6, pinLayout: 'dual_row', defaultPinSignal: 'signal' },
  { name: '8-Pin Connector', category: 'connector', pinCount: 8, pinLayout: 'dual_row', defaultPinSignal: 'signal' },
  { name: 'DB9', category: 'connector', pinCount: 9, pinLayout: 'dual_row', defaultPinSignal: 'data' },
  { name: 'DB15', category: 'connector', pinCount: 15, pinLayout: 'dual_row', defaultPinSignal: 'data' },
  { name: 'DB25', category: 'connector', pinCount: 25, pinLayout: 'dual_row', defaultPinSignal: 'data' },
  { name: 'Terminal Block 2P', category: 'terminal', pinCount: 2, pinLayout: 'single_row', defaultPinSignal: 'power' },
  { name: 'Terminal Block 4P', category: 'terminal', pinCount: 4, pinLayout: 'single_row', defaultPinSignal: 'power' },
  { name: 'Terminal Block 8P', category: 'terminal', pinCount: 8, pinLayout: 'single_row', defaultPinSignal: 'power' },
  { name: 'Terminal Block 12P', category: 'terminal', pinCount: 12, pinLayout: 'single_row', defaultPinSignal: 'power' },
  { name: 'Relay SPDT', category: 'relay', pinCount: 5, pinLayout: 'custom', defaultPinSignal: 'power' },
  { name: 'Relay DPDT', category: 'relay', pinCount: 8, pinLayout: 'custom', defaultPinSignal: 'power' },
  { name: 'Motor 3-Phase', category: 'motor', pinCount: 3, pinLayout: 'circular', defaultPinSignal: 'power' },
  { name: 'DC Motor', category: 'motor', pinCount: 2, pinLayout: 'single_row', defaultPinSignal: 'power' },
  { name: 'Fuse Holder', category: 'fuse', pinCount: 2, pinLayout: 'single_row', defaultPinSignal: 'power' },
  { name: 'Circuit Breaker 1P', category: 'circuit_breaker', pinCount: 2, pinLayout: 'single_row', defaultPinSignal: 'power' },
  { name: 'Circuit Breaker 2P', category: 'circuit_breaker', pinCount: 4, pinLayout: 'dual_row', defaultPinSignal: 'power' },
  { name: 'Power Supply', category: 'power_supply', pinCount: 4, pinLayout: 'single_row', defaultPinSignal: 'power' },
  { name: 'Sensor 3-Wire', category: 'sensor', pinCount: 3, pinLayout: 'single_row', defaultPinSignal: 'signal' },
  { name: 'Toggle Switch', category: 'switch', pinCount: 3, pinLayout: 'single_row', defaultPinSignal: 'power' },
  { name: 'M12 4-Pin', category: 'connector', pinCount: 4, pinLayout: 'circular', defaultPinSignal: 'signal' },
  { name: 'M12 8-Pin', category: 'connector', pinCount: 8, pinLayout: 'circular', defaultPinSignal: 'signal' },
];

/**
 * ComponentCreator: builds custom components with auto-generated
 * pin layouts and configurable properties.
 */
export class ComponentCreator {
  /**
   * Create a component from a pre-defined template.
   */
  fromTemplate(
    template: ComponentTemplate,
    overrides?: Partial<Component>
  ): Component {
    const pins = this.generatePins(
      template.pinCount,
      template.pinLayout,
      template.defaultPinSignal
    );

    const footprint = this.generateFootprint(
      template.pinCount,
      template.pinLayout
    );

    return {
      id: generateId(),
      name: template.name,
      manufacturer: '',
      partNumber: '',
      category: template.category,
      type: 'free_hanging',
      pins,
      footprint,
      description: '',
      tags: [],
      custom: true,
      ...overrides,
    };
  }

  /**
   * Create a fully custom component.
   */
  createCustom(config: {
    name: string;
    category: ComponentCategory;
    type: ComponentType;
    manufacturer?: string;
    partNumber?: string;
    description?: string;
    pins: Array<{
      label: string;
      signalType: PinSignalType;
      direction?: Pin['direction'];
      currentRating?: number;
      voltageRating?: number;
      gender?: Pin['gender'];
    }>;
    pinLayout: Footprint['pinLayout'];
  }): Component {
    const pinPositions = this.calculatePinPositions(
      config.pins.length,
      config.pinLayout
    );

    const pins: Pin[] = config.pins.map((p, i) => ({
      id: generateId(),
      label: p.label,
      position: pinPositions[i],
      direction: p.direction ?? this.defaultDirection(i, config.pins.length, config.pinLayout),
      signalType: p.signalType,
      currentRating: p.currentRating,
      voltageRating: p.voltageRating,
      gender: p.gender ?? 'neutral',
    }));

    return {
      id: generateId(),
      name: config.name,
      manufacturer: config.manufacturer ?? '',
      partNumber: config.partNumber ?? '',
      category: config.category,
      type: config.type,
      pins,
      footprint: this.generateFootprint(config.pins.length, config.pinLayout),
      description: config.description ?? '',
      tags: [],
      custom: true,
    };
  }

  /**
   * Clone an existing component with a new ID.
   */
  clone(component: Component, newName?: string): Component {
    return {
      ...structuredClone(component),
      id: generateId(),
      name: newName ?? `${component.name} (copy)`,
      custom: true,
    };
  }

  /**
   * Add pins to an existing component.
   */
  addPins(
    component: Component,
    newPins: Array<{ label: string; signalType: PinSignalType }>
  ): Component {
    const updated = structuredClone(component);
    const startIndex = updated.pins.length;

    for (let i = 0; i < newPins.length; i++) {
      const pos = this.pinPosition(
        startIndex + i,
        updated.pins.length + newPins.length,
        updated.footprint.pinLayout
      );

      updated.pins.push({
        id: generateId(),
        label: newPins[i].label,
        position: pos,
        direction: 'right',
        signalType: newPins[i].signalType,
        gender: 'neutral',
      });
    }

    // Recalculate footprint
    updated.footprint = this.generateFootprint(
      updated.pins.length,
      updated.footprint.pinLayout
    );

    return updated;
  }

  // --- Pin layout generation ---

  private generatePins(
    count: number,
    layout: Footprint['pinLayout'],
    signalType: PinSignalType
  ): Pin[] {
    const positions = this.calculatePinPositions(count, layout);
    return positions.map((pos, i) => ({
      id: generateId(),
      label: `${i + 1}`,
      position: pos,
      direction: this.defaultDirection(i, count, layout),
      signalType,
      gender: 'neutral',
    }));
  }

  private calculatePinPositions(
    count: number,
    layout: Footprint['pinLayout']
  ): Array<{ x: number; y: number }> {
    const spacing = 10; // mm between pins

    switch (layout) {
      case 'single_row':
        return Array.from({ length: count }, (_, i) => ({
          x: 0,
          y: i * spacing,
        }));

      case 'dual_row': {
        const positions: Array<{ x: number; y: number }> = [];
        const halfRows = Math.ceil(count / 2);
        for (let i = 0; i < count; i++) {
          const row = i % halfRows;
          const col = Math.floor(i / halfRows);
          positions.push({ x: col * spacing * 2, y: row * spacing });
        }
        return positions;
      }

      case 'grid': {
        const cols = Math.ceil(Math.sqrt(count));
        return Array.from({ length: count }, (_, i) => ({
          x: (i % cols) * spacing,
          y: Math.floor(i / cols) * spacing,
        }));
      }

      case 'circular': {
        const radius = Math.max(15, count * 3);
        return Array.from({ length: count }, (_, i) => {
          const angle = (2 * Math.PI * i) / count - Math.PI / 2;
          return {
            x: Math.round(radius * Math.cos(angle)),
            y: Math.round(radius * Math.sin(angle)),
          };
        });
      }

      default:
        return this.calculatePinPositions(count, 'single_row');
    }
  }

  private pinPosition(
    index: number,
    total: number,
    layout: Footprint['pinLayout']
  ): { x: number; y: number } {
    const positions = this.calculatePinPositions(total, layout);
    return positions[index] ?? { x: 0, y: index * 10 };
  }

  private defaultDirection(
    index: number,
    total: number,
    layout: Footprint['pinLayout']
  ): Pin['direction'] {
    if (layout === 'dual_row') {
      return index < Math.ceil(total / 2) ? 'left' : 'right';
    }
    if (layout === 'circular') {
      const quarter = Math.floor((4 * index) / total);
      return (['right', 'bottom', 'left', 'top'] as const)[quarter];
    }
    return 'left';
  }

  private generateFootprint(
    pinCount: number,
    layout: Footprint['pinLayout']
  ): Footprint {
    const spacing = 10;
    let width: number;
    let height: number;

    switch (layout) {
      case 'single_row':
        width = 20;
        height = pinCount * spacing + 10;
        break;
      case 'dual_row':
        width = 30;
        height = Math.ceil(pinCount / 2) * spacing + 10;
        break;
      case 'grid': {
        const cols = Math.ceil(Math.sqrt(pinCount));
        width = cols * spacing + 10;
        height = Math.ceil(pinCount / cols) * spacing + 10;
        break;
      }
      case 'circular': {
        const d = Math.max(40, pinCount * 7);
        width = d;
        height = d;
        break;
      }
      default:
        width = 20;
        height = pinCount * spacing + 10;
    }

    return { width, height, pinLayout: layout };
  }
}
