import { performance } from 'node:perf_hooks';
import {
  DEFAULT_WIRE_STYLE,
  HarnessEditorEngine,
  createEmptyDocument,
} from '../packages/harness-editor-core/dist/index.js';

const requested = process.argv.slice(2).map(Number).filter((value) => Number.isInteger(value) && value >= 100);
const scales = requested.length ? requested : [1_000, 10_000, 50_000];

function buildDocument(entityCount) {
  const componentCount = 0;
  const wireCount = entityCount;
  const document = createEmptyDocument(`routecore-scale-${entityCount}`);
  for (let index = 0; index < wireCount; index += 1) {
    const id = `W${index}`;
    const sx = (index % 500) * 8;
    const sy = Math.floor(index / 500) * 10;
    const tx = sx + 6;
    const ty = sy + 4;
    document.wires[id] = {
      id,
      kind: 'discrete',
      label: id,
      signal: `NET_${index % 128}`,
      source: { kind: 'free', point: { x: sx, y: sy } },
      target: { kind: 'free', point: { x: tx, y: ty } },
      routing: { ...document.settings.defaultRouting, constraints: [] },
      style: { ...DEFAULT_WIRE_STYLE, zIndex: index },
      route: {
        points: [{ x: sx, y: sy }, { x: tx, y: ty }],
        segments: [{ start: { x: sx, y: sy }, end: { x: tx, y: ty }, axis: sx === tx ? 'vertical' : sy === ty ? 'horizontal' : 'diagonal', length: Math.hypot(tx - sx, ty - sy) }],
        cornerRadii: [], length: Math.hypot(tx - sx, ty - sy), bends: 0, crossings: 0,
        obstacleViolations: [], status: 'valid', diagnostics: [], generatedAtRevision: 0,
      },
      locked: false,
      hidden: false,
    };
    document.wireOrder.push(id);
  }
  return document;
}

const results = [];
for (const entities of scales) {
  const document = buildDocument(entities);
  const start = performance.now();
  const engine = new HarnessEditorEngine(document, { autoRoute: false, validateOnChange: false, findCrossings: false });
  const initializeMs = performance.now() - start;
  const mutationStart = performance.now();
  const impact = engine.updateWire('W0', (wire) => {
    wire.signal = `${wire.signal}-EDITED`;
  });
  const mutationMs = performance.now() - mutationStart;
  const dependencyReroutes = impact.dependencyReroutedWires?.length || impact.reroutedWires.length;
  results.push({
    entities,
    components: document.componentOrder.length,
    wires: document.wireOrder.length,
    initializeMs: Number(initializeMs.toFixed(2)),
    localizedMutationMs: Number(mutationMs.toFixed(2)),
    dependencyReroutes,
    rerouteScopePercent: Number((dependencyReroutes / Math.max(1, document.wireOrder.length) * 100).toFixed(3)),
    fullRebuild: Boolean(impact.fullRebuild),
  });
  console.error(`measured ${entities.toLocaleString()} entities`);
}

console.log(JSON.stringify({ benchmark: 'RouteCore HarnessEditorEngine', generatedAt: new Date().toISOString(), results }, null, 2));
