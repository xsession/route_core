import {
  ComponentBuilder,
  createEmptyDocument,
  createSampleDocument,
} from '../../../packages/harness-editor-core/dist/index.js';

export function createProjectDocument(template = 'sample') {
  if (template === 'blank') {
    const document = createEmptyDocument('layout-document');
    document.metadata = { title: 'Layout', units: 'mm', template: 'blank' };
    return document;
  }
  if (template === 'starter') {
    const document = createEmptyDocument('layout-document');
    const left = new ComponentBuilder('J1', 'J1', 'connector')
      .at(120, 150)
      .withLabels({ title: 'J1', subtitle: 'INPUT' })
      .addBank({ id: 'J1:east', side: 'east', flow: 'forward', rowGap: 2, edgePadding: 12, collapseEmpty: false })
      .addPort({ id: 'J1:1', label: '1', function: 'POWER', side: 'east', bankId: 'J1:east', electricalClass: 'power-output' })
      .addPort({ id: 'J1:2', label: '2', function: 'GROUND', side: 'east', bankId: 'J1:east', electricalClass: 'ground' })
      .addPort({ id: 'J1:3', label: '3', function: 'SIGNAL', side: 'east', bankId: 'J1:east', electricalClass: 'bidirectional' })
      .build();
    const right = new ComponentBuilder('J2', 'J2', 'connector')
      .at(560, 150)
      .withLabels({ title: 'J2', subtitle: 'OUTPUT' })
      .addBank({ id: 'J2:west', side: 'west', flow: 'forward', rowGap: 2, edgePadding: 12, collapseEmpty: false })
      .addPort({ id: 'J2:1', label: '1', function: 'POWER', side: 'west', bankId: 'J2:west', electricalClass: 'power-input' })
      .addPort({ id: 'J2:2', label: '2', function: 'GROUND', side: 'west', bankId: 'J2:west', electricalClass: 'ground' })
      .addPort({ id: 'J2:3', label: '3', function: 'SIGNAL', side: 'west', bankId: 'J2:west', electricalClass: 'bidirectional' })
      .build();
    for (const component of [left, right]) {
      document.components[component.id] = component;
      document.componentOrder.push(component.id);
    }
    document.metadata = { title: 'Starter Layout', units: 'mm', template: 'starter' };
    return document;
  }
  const document = createSampleDocument();
  document.id = 'layout-document';
  document.metadata = { ...(document.metadata || {}), title: 'Demonstration Layout', units: 'mm', template: 'sample' };
  return document;
}

export function createSchematicFromLayout(layoutDocument) {
  const schematic = structuredClone(layoutDocument);
  schematic.id = 'schematic-document';
  schematic.revision = 0;
  schematic.metadata = { ...(schematic.metadata || {}), title: 'Schematic', projection: 'schematic' };
  let index = 0;
  for (const componentId of schematic.componentOrder) {
    const component = schematic.components[componentId];
    component.position = {
      x: 120 + (index % 3) * 300,
      y: 100 + Math.floor(index / 3) * 240,
    };
    component.rotation = 0;
    component.mirrorX = false;
    component.mirrorY = false;
    index += 1;
  }
  for (const wire of Object.values(schematic.wires)) {
    wire.routing.pattern = 'orthogonal';
    wire.routing.constraints = [];
    delete wire.route;
  }
  return schematic;
}

export function defaultComponentLibrary() {
  const definitions = [];
  const add = (component, category, tags) => definitions.push({
    id: component.id,
    name: component.labels.title || component.designator,
    category,
    manufacturer: component.labels.manufacturer || '',
    partNumber: component.labels.partNumber || '',
    tags,
    component,
  });

  add(new ComponentBuilder('LIB-CONN-2', 'J?', 'connector')
    .withLabels({ title: '2-way Connector', subtitle: 'POWER' })
    .addBank({ id: 'LIB-CONN-2:east', side: 'east', flow: 'forward', rowGap: 2, edgePadding: 12, collapseEmpty: false })
    .addPort({ id: 'LIB-CONN-2:1', label: '1', function: 'POWER', side: 'east', bankId: 'LIB-CONN-2:east', electricalClass: 'power-input' })
    .addPort({ id: 'LIB-CONN-2:2', label: '2', function: 'GROUND', side: 'east', bankId: 'LIB-CONN-2:east', electricalClass: 'ground' })
    .build(), 'connector', ['2-way', 'power']);

  add(new ComponentBuilder('LIB-CONN-6', 'J?', 'connector')
    .withLabels({ title: '6-way Connector', subtitle: 'SIGNAL / POWER' })
    .addBank({ id: 'LIB-CONN-6:east', side: 'east', flow: 'forward', rowGap: 2, edgePadding: 12, collapseEmpty: false })
    .addPort({ id: 'LIB-CONN-6:1', label: '1', function: 'VBAT', side: 'east', bankId: 'LIB-CONN-6:east', electricalClass: 'power-input' })
    .addPort({ id: 'LIB-CONN-6:2', label: '2', function: 'GND', side: 'east', bankId: 'LIB-CONN-6:east', electricalClass: 'ground' })
    .addPort({ id: 'LIB-CONN-6:3', label: '3', function: 'CAN_H', side: 'east', bankId: 'LIB-CONN-6:east', electricalClass: 'bidirectional' })
    .addPort({ id: 'LIB-CONN-6:4', label: '4', function: 'CAN_L', side: 'east', bankId: 'LIB-CONN-6:east', electricalClass: 'bidirectional' })
    .addPort({ id: 'LIB-CONN-6:5', label: '5', function: 'IO_1', side: 'east', bankId: 'LIB-CONN-6:east', electricalClass: 'bidirectional' })
    .addPort({ id: 'LIB-CONN-6:6', label: '6', function: 'IO_2', side: 'east', bankId: 'LIB-CONN-6:east', electricalClass: 'bidirectional' })
    .build(), 'connector', ['6-way', 'can', 'signal']);

  add(new ComponentBuilder('LIB-ECU-8', 'A?', 'device')
    .withLabels({ title: 'Control Module', subtitle: '8 I/O', manufacturer: 'Local Library' })
    .addBank({ id: 'LIB-ECU-8:west', side: 'west', flow: 'forward', rowGap: 2, edgePadding: 12, collapseEmpty: false })
    .addBank({ id: 'LIB-ECU-8:east', side: 'east', flow: 'forward', rowGap: 2, edgePadding: 12, collapseEmpty: false })
    .addPort({ id: 'LIB-ECU-8:1', label: '1', function: 'VBAT', side: 'west', bankId: 'LIB-ECU-8:west', electricalClass: 'power-input' })
    .addPort({ id: 'LIB-ECU-8:2', label: '2', function: 'GND', side: 'west', bankId: 'LIB-ECU-8:west', electricalClass: 'ground' })
    .addPort({ id: 'LIB-ECU-8:3', label: '3', function: 'CAN_H', side: 'west', bankId: 'LIB-ECU-8:west', electricalClass: 'bidirectional' })
    .addPort({ id: 'LIB-ECU-8:4', label: '4', function: 'CAN_L', side: 'west', bankId: 'LIB-ECU-8:west', electricalClass: 'bidirectional' })
    .addPort({ id: 'LIB-ECU-8:5', label: '5', function: 'OUT_1', side: 'east', bankId: 'LIB-ECU-8:east', electricalClass: 'signal-output' })
    .addPort({ id: 'LIB-ECU-8:6', label: '6', function: 'OUT_2', side: 'east', bankId: 'LIB-ECU-8:east', electricalClass: 'signal-output' })
    .addPort({ id: 'LIB-ECU-8:7', label: '7', function: 'IN_1', side: 'east', bankId: 'LIB-ECU-8:east', electricalClass: 'signal-input' })
    .addPort({ id: 'LIB-ECU-8:8', label: '8', function: 'IN_2', side: 'east', bankId: 'LIB-ECU-8:east', electricalClass: 'signal-input' })
    .build(), 'device', ['ecu', 'controller', '8-pin']);

  add(new ComponentBuilder('LIB-SPLICE-3', 'S?', 'branch-point')
    .withLabels({ title: '3-way Splice', subtitle: 'ULTRASONIC' })
    .addBank({ id: 'LIB-SPLICE-3:west', side: 'west', flow: 'forward', rowGap: 2, edgePadding: 10, collapseEmpty: false })
    .addBank({ id: 'LIB-SPLICE-3:east', side: 'east', flow: 'forward', rowGap: 2, edgePadding: 10, collapseEmpty: false })
    .addPort({ id: 'LIB-SPLICE-3:1', label: '1', function: 'COMMON', side: 'west', bankId: 'LIB-SPLICE-3:west', electricalClass: 'passive', maximumConnections: 1 })
    .addPort({ id: 'LIB-SPLICE-3:2', label: '2', function: 'BRANCH_A', side: 'east', bankId: 'LIB-SPLICE-3:east', electricalClass: 'passive', maximumConnections: 1 })
    .addPort({ id: 'LIB-SPLICE-3:3', label: '3', function: 'BRANCH_B', side: 'east', bankId: 'LIB-SPLICE-3:east', electricalClass: 'passive', maximumConnections: 1 })
    .build(), 'splice', ['splice', 'branch']);

  add(new ComponentBuilder('LIB-TERM-1', 'T?', 'termination')
    .withLabels({ title: 'Ring Terminal', subtitle: 'M6' })
    .addBank({ id: 'LIB-TERM-1:west', side: 'west', flow: 'forward', rowGap: 2, edgePadding: 10, collapseEmpty: false })
    .addPort({ id: 'LIB-TERM-1:1', label: '1', function: 'TERMINAL', side: 'west', bankId: 'LIB-TERM-1:west', electricalClass: 'passive' })
    .build(), 'termination', ['ring', 'terminal', 'm6']);

  return definitions;
}

export function defaultCableLibrary() {
  return [
    {
      id: 'CABLE-CAN-2C',
      name: 'CAN twisted pair',
      manufacturer: 'Local Library',
      partNumber: 'OH-CAN-2C-022',
      tags: ['can', 'twisted-pair', 'shielded'],
      definition: {
        kind: 'shielded-twisted-pair',
        nominalOuterDiameterMm: 5.4,
        impedanceOhm: 120,
        cores: [
          { id: 'core-1', label: 'CAN_H', color: '#16a34a', gaugeAwg: 22 },
          { id: 'core-2', label: 'CAN_L', color: '#facc15', stripe: '#16a34a', gaugeAwg: 22 },
        ],
        shield: { kind: 'foil', drain: true },
      },
    },
    {
      id: 'CABLE-POWER-4C',
      name: '4-core power/control cable',
      manufacturer: 'Local Library',
      partNumber: 'OH-PWR-4C-018',
      tags: ['power', 'control', '4-core'],
      definition: {
        kind: 'multi-core',
        nominalOuterDiameterMm: 8.2,
        cores: [
          { id: 'core-1', label: '1', color: '#dc2626', gaugeAwg: 18 },
          { id: 'core-2', label: '2', color: '#111827', gaugeAwg: 18 },
          { id: 'core-3', label: '3', color: '#2563eb', gaugeAwg: 18 },
          { id: 'core-4', label: '4', color: '#f97316', gaugeAwg: 18 },
        ],
      },
    },
  ];
}
