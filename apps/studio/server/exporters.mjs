import {
  DEFAULT_EDITOR_THEME,
  deriveEditorScene,
  renderEditorSvg,
} from '../../../packages/harness-editor-core/dist/index.js';

function csvCell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function csv(rows) {
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function endpointName(document, endpoint) {
  if (endpoint.kind === 'port') {
    const component = document.components[endpoint.componentId];
    const port = component?.ports.find((candidate) => candidate.id === endpoint.portId);
    const componentName = component?.designator || endpoint.componentId;
    const portName = port?.label || endpoint.portId;
    const fn = port?.function ? ` (${port.function})` : '';
    return `${componentName}.${portName}${fn}`;
  }
  if (endpoint.kind === 'off-page') return `OFF-PAGE:${endpoint.reference}`;
  if (endpoint.kind === 'junction') return `JUNCTION:${endpoint.junctionId}`;
  return `FREE:${endpoint.point.x},${endpoint.point.y}`;
}

function wireLength(wire) {
  const points = wire.route?.points || [];
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return length;
}

function autoBomRows(document, explicitItems) {
  const assigned = new Map(explicitItems.map((item) => [`${item.entityKind}:${item.entityId}:${item.role}`, item]));
  const rows = [];
  for (const componentId of document.componentOrder) {
    const component = document.components[componentId];
    if (!component) continue;
    const item = assigned.get(`component:${componentId}:primary`);
    rows.push({
      item: rows.length + 1,
      entityKind: 'component',
      entityId: componentId,
      designator: component.designator,
      manufacturer: item?.manufacturer || component.labels?.manufacturer || '',
      partNumber: item?.partNumber || component.labels?.partNumber || '',
      description: item?.description || component.labels?.description || component.labels?.title || component.kind,
      quantity: item?.quantity ?? 1,
      unit: item?.unit || 'each',
      supplier: item?.supplier || '',
      notes: item?.notes || '',
    });
  }
  for (const wireId of document.wireOrder) {
    const wire = document.wires[wireId];
    if (!wire) continue;
    const item = assigned.get(`conductor:${wireId}:primary`);
    rows.push({
      item: rows.length + 1,
      entityKind: 'conductor',
      entityId: wireId,
      designator: wireId,
      manufacturer: item?.manufacturer || '',
      partNumber: item?.partNumber || '',
      description: item?.description || `${wire.label || wire.signal || wireId} wire`,
      quantity: item?.quantity ?? Number(wireLength(wire).toFixed(2)),
      unit: item?.unit || 'mm',
      supplier: item?.supplier || '',
      notes: item?.notes || '',
    });
  }
  for (const item of explicitItems) {
    const key = `${item.entityKind}:${item.entityId}:${item.role}`;
    if (assigned.get(key) !== item || item.role === 'primary') continue;
    rows.push({
      item: rows.length + 1,
      entityKind: item.entityKind,
      entityId: item.entityId,
      designator: item.entityId,
      manufacturer: item.manufacturer,
      partNumber: item.partNumber,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      supplier: item.supplier,
      notes: item.notes,
    });
  }
  return rows;
}

export function availableExports() {
  return [
    { id: 'editor-json', label: 'Editor document JSON', extension: 'json', mediaType: 'application/json' },
    { id: 'project-json', label: 'Complete project interchange JSON', extension: 'json', mediaType: 'application/json' },
    { id: 'svg', label: 'Vector drawing SVG', extension: 'svg', mediaType: 'image/svg+xml' },
    { id: 'bom-csv', label: 'Bill of materials CSV', extension: 'csv', mediaType: 'text/csv' },
    { id: 'cut-list-csv', label: 'Wire cut list CSV', extension: 'csv', mediaType: 'text/csv' },
    { id: 'pinout-csv', label: 'Component pinout CSV', extension: 'csv', mediaType: 'text/csv' },
    { id: 'continuity-csv', label: 'Continuity schedule CSV', extension: 'csv', mediaType: 'text/csv' },
    { id: 'netlist-json', label: 'Connectivity netlist JSON', extension: 'json', mediaType: 'application/json' },
  ];
}

export function generateExport(project, format, options = {}) {
  const editor = project.loadEditorDocument({
    modelId: options.modelId,
    pageId: options.pageId,
    viewKind: options.viewKind,
  });
  const document = editor.document;
  const meta = project.getMeta();
  const safeName = meta.name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'routecore-project';

  if (format === 'editor-json') {
    return {
      filename: `${safeName}-${editor.viewKind}.json`,
      mediaType: 'application/json; charset=utf-8',
      body: `${JSON.stringify(document, null, 2)}\n`,
    };
  }

  if (format === 'project-json') {
    const payload = {
      schema: 'routecore-project-interchange/1',
      exportedAt: new Date().toISOString(),
      meta,
      modelsAndPages: project.listModelsAndPages(),
      documents: project.listEditorDocuments(),
      bom: project.listBomItems(),
      revisions: project.listRevisions(),
      commandLog: project.getCommandLog(250),
    };
    return {
      filename: `${safeName}.routecore.json`,
      mediaType: 'application/json; charset=utf-8',
      body: `${JSON.stringify(payload, null, 2)}\n`,
    };
  }

  if (format === 'svg') {
    const scene = deriveEditorScene(document, { autoRoute: true, validate: true, contentPadding: 60 });
    const svg = renderEditorSvg(scene.document, {
      geometries: scene.componentGeometries,
      labelPlacements: scene.labelPlacementList,
      selection: { items: [] },
      theme: DEFAULT_EDITOR_THEME,
      options: {
        viewport: scene.contentBounds,
        showGrid: options.showGrid === true,
        showRouteHandles: false,
        showDiagnostics: options.showDiagnostics === true,
        includeAccessibility: true,
      },
    });
    return {
      filename: `${safeName}-${editor.viewKind}.svg`,
      mediaType: 'image/svg+xml; charset=utf-8',
      body: svg,
    };
  }

  if (format === 'bom-csv') {
    const rows = autoBomRows(document, project.listBomItems(editor.modelId));
    return {
      filename: `${safeName}-bom.csv`,
      mediaType: 'text/csv; charset=utf-8',
      body: csv([
        ['Item', 'Entity type', 'Entity ID', 'Designator', 'Manufacturer', 'Part number', 'Description', 'Quantity', 'Unit', 'Supplier', 'Notes'],
        ...rows.map((row) => [row.item, row.entityKind, row.entityId, row.designator, row.manufacturer, row.partNumber, row.description, row.quantity, row.unit, row.supplier, row.notes]),
      ]),
    };
  }

  if (format === 'cut-list-csv') {
    const rows = document.wireOrder.map((wireId, index) => {
      const wire = document.wires[wireId];
      return [
        index + 1,
        wireId,
        wire.label || '',
        wire.signal || '',
        wire.kind,
        endpointName(document, wire.source),
        endpointName(document, wire.target),
        wireLength(wire).toFixed(2),
        document.metadata?.units || 'mm',
        wire.style?.pattern?.kind || 'solid',
        wire.routing?.pattern || 'orthogonal',
        wire.route?.status || 'unrouted',
      ];
    });
    return {
      filename: `${safeName}-cut-list.csv`,
      mediaType: 'text/csv; charset=utf-8',
      body: csv([
        ['Item', 'Wire ID', 'Label', 'Signal', 'Kind', 'From', 'To', 'Calculated length', 'Unit', 'Color pattern', 'Routing pattern', 'Route status'],
        ...rows,
      ]),
    };
  }

  if (format === 'pinout-csv') {
    const rows = [];
    for (const componentId of document.componentOrder) {
      const component = document.components[componentId];
      component.ports.forEach((port, index) => rows.push([
        component.designator,
        component.labels?.title || '',
        component.kind,
        index + 1,
        port.label,
        port.function || '',
        port.detail || '',
        port.electricalClass,
        port.side,
        port.visible,
        port.connectionPolicy?.maximumConnections ?? 1,
      ]));
    }
    return {
      filename: `${safeName}-pinout.csv`,
      mediaType: 'text/csv; charset=utf-8',
      body: csv([
        ['Component', 'Name', 'Kind', 'Index', 'Pin', 'Function', 'Detail', 'Electrical class', 'Side', 'Visible', 'Maximum connections'],
        ...rows,
      ]),
    };
  }

  if (format === 'continuity-csv') {
    const rows = document.wireOrder.map((wireId, index) => {
      const wire = document.wires[wireId];
      return [
        index + 1,
        wireId,
        wire.signal || wire.label || '',
        endpointName(document, wire.source),
        endpointName(document, wire.target),
        'OPEN/CLOSED',
        '',
      ];
    });
    return {
      filename: `${safeName}-continuity.csv`,
      mediaType: 'text/csv; charset=utf-8',
      body: csv([
        ['Test', 'Wire ID', 'Signal', 'Point A', 'Point B', 'Expected', 'Measured/result'],
        ...rows,
      ]),
    };
  }

  if (format === 'netlist-json') {
    const payload = {
      schema: 'routecore-netlist/1',
      project: meta.name,
      modelId: editor.modelId,
      viewKind: editor.viewKind,
      components: document.componentOrder.map((id) => {
        const component = document.components[id];
        return {
          id,
          designator: component.designator,
          name: component.labels?.title || '',
          kind: component.kind,
          ports: component.ports.map((port) => ({ id: port.id, label: port.label, function: port.function || '', electricalClass: port.electricalClass })),
        };
      }),
      conductors: document.wireOrder.map((id) => {
        const wire = document.wires[id];
        return {
          id,
          label: wire.label || '',
          signal: wire.signal || '',
          kind: wire.kind,
          source: wire.source,
          target: wire.target,
        };
      }),
    };
    return {
      filename: `${safeName}-netlist.json`,
      mediaType: 'application/json; charset=utf-8',
      body: `${JSON.stringify(payload, null, 2)}\n`,
    };
  }

  throw new Error(`Unsupported export format: ${format}`);
}
