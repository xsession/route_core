export type { Pin, PinSignalType } from './pin.js';
export type { Component, ComponentCategory, ComponentType, ComponentShape, ComponentFastening, ComponentTermination, Footprint } from './component.js';
export { DESIGNATOR_PREFIX } from './component.js';
export type { Wire, WireMaterial, InsulationType } from './wire.js';
export { AWG_SPECS } from './wire.js';
export type { Cable, CableConductor, JacketSpec, JacketMaterial, ShieldingSpec } from './cable.js';
export type { Connection, ConnectionEndpoint, SplicePoint } from './connection.js';
export type { Harness, HarnessNode, CanvasState, Revision } from './harness.js';
export { createHarness, createDefaultCanvas, generateId } from './harness.js';
