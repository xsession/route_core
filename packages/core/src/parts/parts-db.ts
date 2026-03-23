import type { Component, ComponentCategory } from '../models/component.js';
import type { Cable } from '../models/cable.js';
import type { Wire } from '../models/wire.js';
import { searchComponents, type SearchOptions, type SearchResult } from './search.js';

/**
 * PartsDatabase: in-memory parts catalog with search, filtering,
 * and CRUD operations. Acts as the central parts library.
 */
export class PartsDatabase {
  private components: Map<string, Component> = new Map();
  private cables: Map<string, Cable> = new Map();
  private wires: Map<string, Wire> = new Map();

  // --- Components ---

  addComponent(component: Component): void {
    this.components.set(component.id, component);
  }

  addComponents(components: Component[]): void {
    for (const c of components) this.addComponent(c);
  }

  getComponent(id: string): Component | undefined {
    return this.components.get(id);
  }

  removeComponent(id: string): boolean {
    return this.components.delete(id);
  }

  getAllComponents(): Component[] {
    return Array.from(this.components.values());
  }

  searchComponents(options: SearchOptions): SearchResult[] {
    return searchComponents(this.getAllComponents(), options);
  }

  getComponentsByCategory(category: ComponentCategory): Component[] {
    return this.getAllComponents().filter(c => c.category === category);
  }

  getManufacturers(): string[] {
    const set = new Set<string>();
    for (const c of this.components.values()) {
      if (c.manufacturer) set.add(c.manufacturer);
    }
    return Array.from(set).sort();
  }

  getCategories(): ComponentCategory[] {
    const set = new Set<ComponentCategory>();
    for (const c of this.components.values()) {
      set.add(c.category);
    }
    return Array.from(set).sort();
  }

  // --- Cables ---

  addCable(cable: Cable): void {
    this.cables.set(cable.id, cable);
  }

  getCable(id: string): Cable | undefined {
    return this.cables.get(id);
  }

  removeCable(id: string): boolean {
    return this.cables.delete(id);
  }

  getAllCables(): Cable[] {
    return Array.from(this.cables.values());
  }

  // --- Wires ---

  addWire(wire: Wire): void {
    this.wires.set(wire.id, wire);
  }

  getWire(id: string): Wire | undefined {
    return this.wires.get(id);
  }

  removeWire(id: string): boolean {
    return this.wires.delete(id);
  }

  getAllWires(): Wire[] {
    return Array.from(this.wires.values());
  }

  // --- Serialization ---

  toJSON(): { components: Component[]; cables: Cable[]; wires: Wire[] } {
    return {
      components: this.getAllComponents(),
      cables: this.getAllCables(),
      wires: this.getAllWires(),
    };
  }

  loadFromJSON(data: { components?: Component[]; cables?: Cable[]; wires?: Wire[] }): void {
    if (data.components) this.addComponents(data.components);
    if (data.cables) data.cables.forEach(c => this.addCable(c));
    if (data.wires) data.wires.forEach(w => this.addWire(w));
  }

  get stats() {
    return {
      components: this.components.size,
      cables: this.cables.size,
      wires: this.wires.size,
    };
  }
}
