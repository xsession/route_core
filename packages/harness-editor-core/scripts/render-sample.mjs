import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSampleDocument,
  deriveEditorScene,
  renderEditorSvg,
} from '../dist/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(here, '../examples');
fs.mkdirSync(outputDirectory, { recursive: true });

const scene = deriveEditorScene(createSampleDocument(), {
  autoRoute: true,
  validate: true,
});

const viewport = {
  x: scene.contentBounds.x - 40,
  y: scene.contentBounds.y - 40,
  width: scene.contentBounds.width + 80,
  height: scene.contentBounds.height + 80,
};

const svg = renderEditorSvg(scene.document, {
  geometries: scene.componentGeometries,
  labelPlacements: scene.labelPlacementList,
  options: {
    viewport,
    showGrid: true,
    showPorts: true,
    showLabels: true,
    showRouteHandles: false,
    showSelection: true,
    showDiagnostics: true,
    includeAccessibility: true,
  },
});

const svgPath = path.join(outputDirectory, 'sample-output.svg');
const htmlPath = path.join(outputDirectory, 'sample-output.html');

fs.writeFileSync(svgPath, svg);
fs.writeFileSync(
  htmlPath,
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>RouteCore editor core sample</title>
  <style>
    html, body { margin: 0; background: #eef2f7; }
    body { padding: 24px; font-family: system-ui, sans-serif; }
    main { max-width: 1400px; margin: auto; background: white; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 28px rgba(15, 23, 42, .12); }
    h1 { font-size: 18px; margin: 0; padding: 14px 18px; border-bottom: 1px solid #e2e8f0; }
    svg { display: block; width: 100%; height: auto; }
  </style>
</head>
<body>
  <main>
    <h1>RouteCore reusable harness editor core — deterministic sample</h1>
    ${svg}
  </main>
</body>
</html>`,
);

console.log(JSON.stringify({
  svgPath,
  htmlPath,
  components: scene.document.componentOrder.length,
  wires: scene.document.wireOrder.length,
  labels: scene.document.labelOrder.length,
  validationIssues: scene.validationIssues.length,
  svgBytes: Buffer.byteLength(svg),
}, null, 2));
