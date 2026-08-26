import {
  ComponentBuilder,
  DEFAULT_DARK_THEME,
  DEFAULT_EDITOR_THEME,
  EditorInteractionController,
  ViewportController,
  colorPatternDescription,
  createSampleEngine,
  rectCenter,
  renderEditorSvg,
  viewportWorldRect,
} from '../../dist/index.js';

const engine = createSampleEngine();
const shell = document.querySelector('#canvas-shell');
const canvas = document.querySelector('#canvas');
const status = document.querySelector('#status');
const diagnostics = document.querySelector('#diagnostics');
const inspector = document.querySelector('#inspector');
const tree = document.querySelector('#scene-tree');
let dark = false;
let overlay = {};
let pointerCapture;

const viewport = new ViewportController({ pan: { x: 0, y: 0 }, zoom: 1, width: 1000, height: 700 });
const interaction = new EditorInteractionController(engine, { zoom: () => viewport.state.zoom, enableTouchPan: false });

function resize() {
  const bounds = shell.getBoundingClientRect();
  viewport.resize(bounds.width, bounds.height);
  render();
}

function fit() {
  const all = Object.values(engine.geometries).map((geometry) => geometry.worldBounds);
  const minX = Math.min(...all.map((value) => value.x));
  const minY = Math.min(...all.map((value) => value.y));
  const maxX = Math.max(...all.map((value) => value.x + value.width));
  const maxY = Math.max(...all.map((value) => value.y + value.height));
  viewport.fit({ x: minX - 80, y: minY - 100, width: maxX - minX + 160, height: maxY - minY + 200 }, 28);
  render();
}

function pointerEvent(event) {
  const bounds = shell.getBoundingClientRect();
  const screenPoint = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  return {
    pointerId: event.pointerId,
    point: viewport.screenToWorld(screenPoint),
    screenPoint,
    button: event.button,
    buttons: event.buttons,
    pointerType: event.pointerType,
    pressure: event.pressure,
    modifiers: {
      shift: event.shiftKey,
      alt: event.altKey,
      ctrl: event.ctrlKey,
      meta: event.metaKey,
      space: spaceDown,
    },
    timestamp: event.timeStamp,
  };
}

function selectionKey(item) { return `${item.kind}:${item.id}:${item.subId ?? ''}`; }
function selected(kind, id) { return engine.selection.items.some((item) => item.kind === kind && item.id === id); }

function renderTree() {
  const componentItems = engine.document.componentOrder.map((id) => {
    const component = engine.document.components[id];
    return `<div class="tree-item ${selected('component', id) ? 'selected' : ''}" data-kind="component" data-id="${id}"><strong>${component.designator}</strong><span>${component.kind}</span></div>`;
  }).join('');
  const wireItems = engine.document.wireOrder.map((id) => {
    const wire = engine.document.wires[id];
    const pattern = wire.style.pattern;
    const color = pattern.kind === 'solid' ? pattern.color : pattern.kind === 'stripe' || pattern.kind === 'tracer' ? pattern.base : pattern.kind === 'dual' ? pattern.primary : pattern.kind === 'shield' ? pattern.sheath : '#64748b';
    return `<div class="tree-item ${selected('wire', id) ? 'selected' : ''}" data-kind="wire" data-id="${id}"><span class="swatch" style="background:${color}"></span><strong>${id}</strong><span>${wire.label ?? ''}</span></div>`;
  }).join('');
  tree.innerHTML = `<div class="tree-section"><strong>Components (${engine.document.componentOrder.length})</strong>${componentItems}</div><div class="tree-section"><strong>Wires (${engine.document.wireOrder.length})</strong>${wireItems}</div>`;
  tree.querySelectorAll('.tree-item').forEach((element) => element.addEventListener('click', () => {
    engine.select([{ kind: element.dataset.kind, id: element.dataset.id }]);
  }));
}

function field(label, value, id, type = 'text') {
  return `<label class="field"><span>${label}</span><input id="${id}" type="${type}" value="${String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"></label>`;
}

function renderComponentInspector(component) {
  inspector.innerHTML = `
    ${field('Designator', component.designator, 'component-designator')}
    ${field('Title', component.labels.title, 'component-title')}
    ${field('Subtitle', component.labels.subtitle ?? '', 'component-subtitle')}
    <div class="inline"><button id="add-pin">Add pin</button><button id="remove-pin">Remove last</button></div>
    <div class="inline"><button id="rotate-component">Rotate 90°</button><button id="duplicate-component">Duplicate</button></div>
    <table class="pin-table"><thead><tr><th>Pin</th><th>Function</th><th>Side</th></tr></thead><tbody>
    ${component.ports.map((port, index) => `<tr><td><input data-port-field="label" data-index="${index}" value="${port.label}"></td><td><input data-port-field="function" data-index="${index}" value="${port.function ?? ''}"></td><td>${port.side}</td></tr>`).join('')}
    </tbody></table>
    <div class="inline"><button id="delete-component">Delete</button></div>`;
  const updateText = () => engine.updateComponent(component.id, (draft) => {
    draft.designator = document.querySelector('#component-designator').value;
    draft.labels.title = document.querySelector('#component-title').value;
    draft.labels.subtitle = document.querySelector('#component-subtitle').value;
  });
  for (const id of ['component-designator', 'component-title', 'component-subtitle']) document.querySelector(`#${id}`).addEventListener('change', updateText);
  inspector.querySelectorAll('[data-port-field]').forEach((input) => input.addEventListener('change', () => {
    const index = Number(input.dataset.index);
    engine.updateComponent(component.id, (draft) => { draft.ports[index][input.dataset.portField] = input.value; });
  }));
  document.querySelector('#add-pin').addEventListener('click', () => engine.updateComponent(component.id, (draft) => {
    const bank = draft.pinBanks[0];
    const id = `${draft.id}:p${draft.ports.length + 1}`;
    const side = bank?.side ?? 'east';
    draft.ports.push({ id, label: String(draft.ports.length + 1), function: '', side, order: draft.ports.length, bankId: bank?.id, visible: true, electricalClass: 'unknown', connectionPolicy: { maximumConnections: 1, allowSelfConnection: false } });
    bank?.portIds.push(id);
  }));
  document.querySelector('#remove-pin').addEventListener('click', () => engine.updateComponent(component.id, (draft) => {
    const removed = draft.ports.at(-1);
    if (!removed) return;
    draft.ports.pop();
    for (const bank of draft.pinBanks) bank.portIds = bank.portIds.filter((id) => id !== removed.id);
  }, { connectedPortRemoval: 'detach' }));
  document.querySelector('#rotate-component').addEventListener('click', () => engine.rotateComponents([component.id]));
  document.querySelector('#duplicate-component').addEventListener('click', () => {
    const copy = structuredClone(component);
    copy.id = `${component.id}-copy-${Date.now().toString(36)}`;
    copy.designator = `${component.designator}_COPY`;
    copy.labels.title = copy.designator;
    copy.position.x += 70;
    copy.position.y += 70;
    const remap = new Map();
    copy.ports.forEach((port) => { const next = `${copy.id}:${port.id.split(':').at(-1)}`; remap.set(port.id, next); port.id = next; });
    copy.pinBanks.forEach((bank) => { bank.id = `${copy.id}:${bank.id.split(':').at(-1)}`; bank.portIds = bank.portIds.map((id) => remap.get(id)); });
    engine.addComponent(copy);
  });
  document.querySelector('#delete-component').addEventListener('click', () => engine.removeComponent(component.id, 'detach'));
}

function renderWireInspector(wire) {
  const patterns = ['solid', 'stripe', 'tracer', 'dual', 'shield'];
  inspector.innerHTML = `
    ${field('Label', wire.label ?? '', 'wire-label')}
    <label class="field"><span>Routing pattern</span><select id="route-pattern">${['orthogonal','horizontal-first','vertical-first','dogleg-horizontal','dogleg-vertical','trunk-horizontal','trunk-vertical','manual'].map((value) => `<option ${value === wire.routing.pattern ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
    ${field('Bend radius', wire.routing.requestedRadius, 'wire-radius', 'number')}
    ${field('Clearance', wire.routing.clearance, 'wire-clearance', 'number')}
    <label class="field"><span>Color pattern</span><select id="wire-pattern">${patterns.map((value) => `<option ${value === wire.style.pattern.kind ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
    ${field('Primary color', wire.style.pattern.kind === 'solid' ? wire.style.pattern.color : '#2563eb', 'wire-color', 'color')}
    <p>${colorPatternDescription(wire.style.pattern)}</p>
    <div class="inline"><button id="reroute-wire">Reset route</button><button id="delete-wire">Delete</button></div>`;
  const update = () => engine.updateWire(wire.id, (draft) => {
    draft.label = document.querySelector('#wire-label').value;
    draft.routing.pattern = document.querySelector('#route-pattern').value;
    draft.routing.requestedRadius = Number(document.querySelector('#wire-radius').value);
    draft.routing.clearance = Number(document.querySelector('#wire-clearance').value);
    const kind = document.querySelector('#wire-pattern').value;
    const color = document.querySelector('#wire-color').value;
    if (kind === 'solid') draft.style.pattern = { kind, color };
    if (kind === 'stripe') draft.style.pattern = { kind, base: color, stripe: '#ffffff', stripeWidth: 1.5, repeat: 14 };
    if (kind === 'tracer') draft.style.pattern = { kind, base: color, tracer: '#ffffff', repeat: 16, tracerLength: 5 };
    if (kind === 'dual') draft.style.pattern = { kind, primary: color, secondary: '#facc15', ratio: .55 };
    if (kind === 'shield') draft.style.pattern = { kind, sheath: '#94a3b8', core: color };
  });
  inspector.querySelectorAll('input,select').forEach((element) => element.addEventListener('change', update));
  document.querySelector('#reroute-wire').addEventListener('click', () => engine.autoRoute([wire.id]));
  document.querySelector('#delete-wire').addEventListener('click', () => engine.removeWire(wire.id));
}

function renderLabelInspector(label) {
  inspector.innerHTML = `${field('Text', label.text, 'label-text')} ${field('Secondary', label.secondaryText ?? '', 'label-secondary')}<div class="inline"><button id="reset-label">Auto-place</button><button id="delete-label">Delete</button></div>`;
  const update = () => engine.updateLabel(label.id, { text: document.querySelector('#label-text').value, secondaryText: document.querySelector('#label-secondary').value });
  inspector.querySelectorAll('input').forEach((element) => element.addEventListener('change', update));
  document.querySelector('#reset-label').addEventListener('click', () => engine.resetLabel(label.id));
  document.querySelector('#delete-label').addEventListener('click', () => engine.removeLabel(label.id));
}

function renderInspector() {
  const primary = engine.selection.primary;
  if (!primary) { inspector.innerHTML = '<div class="inspector-empty">Select a component, wire, or label.</div>'; return; }
  if (primary.kind === 'component') renderComponentInspector(engine.document.components[primary.id]);
  else if (primary.kind === 'wire') renderWireInspector(engine.document.wires[primary.id]);
  else if (primary.kind === 'label') renderLabelInspector(engine.document.labels[primary.id]);
  else inspector.innerHTML = `<div class="inspector-empty">${primary.kind}: ${primary.id}</div>`;
}

function renderDiagnostics() {
  const visible = engine.validationIssues.slice(0, 4);
  diagnostics.innerHTML = visible.length ? visible.map((issue) => `<div class="${issue.severity}">${issue.severity.toUpperCase()} · ${issue.message}</div>`).join('') : 'No validation issues.';
}

function render() {
  const theme = dark ? DEFAULT_DARK_THEME : DEFAULT_EDITOR_THEME;
  canvas.innerHTML = renderEditorSvg(engine.document, {
    geometries: engine.geometries,
    labelPlacements: [...engine.labelPlacements],
    selection: engine.selection,
    theme,
    options: { viewport: viewportWorldRect(viewport.state), showRouteHandles: true, showDiagnostics: true },
    overlay,
  });
  shell.style.background = theme.background;
  renderTree();
  renderInspector();
  renderDiagnostics();
  document.querySelector('#undo').disabled = !engine.canUndo;
  document.querySelector('#redo').disabled = !engine.canRedo;
}

engine.on('documentChanged', ({ reason }) => { status.textContent = reason; render(); });
engine.on('selectionChanged', render);
engine.on('validationChanged', renderDiagnostics);
engine.on('feedback', (feedback) => { status.textContent = feedback.message; });
interaction.on('snapGuidesChanged', ({ guides }) => { overlay = { ...overlay, snapGuides: guides }; render(); });
interaction.on('marqueeChanged', (value) => { overlay = { ...overlay, marquee: value.bounds ? value : undefined }; render(); });
interaction.on('connectionPreview', (value) => { overlay = { ...overlay, connection: value.source && value.point ? value : undefined }; render(); });
interaction.on('panRequested', ({ delta }) => { viewport.pan({ x: delta.x * viewport.state.zoom, y: delta.y * viewport.state.zoom }); render(); });
interaction.on('cursorRequested', ({ cursor }) => { shell.style.cursor = cursor; });
interaction.on('contextMenuRequested', ({ hit }) => { status.textContent = hit ? `${hit.kind}: ${hit.entityId}` : 'Canvas context'; });

let spaceDown = false;
shell.addEventListener('pointerdown', (event) => { shell.focus(); pointerCapture = event.pointerId; shell.setPointerCapture(event.pointerId); interaction.pointerDown(pointerEvent(event)); });
shell.addEventListener('pointermove', (event) => interaction.pointerMove(pointerEvent(event)));
shell.addEventListener('pointerup', (event) => { interaction.pointerUp(pointerEvent(event)); if (pointerCapture === event.pointerId) shell.releasePointerCapture(event.pointerId); pointerCapture = undefined; });
shell.addEventListener('pointercancel', (event) => interaction.pointerCancel(event.pointerId));
shell.addEventListener('contextmenu', (event) => event.preventDefault());
shell.addEventListener('wheel', (event) => {
  event.preventDefault();
  const bounds = shell.getBoundingClientRect();
  viewport.zoomAt({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, Math.exp(-event.deltaY * .0015));
  render();
}, { passive: false });
window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') spaceDown = true;
  if (interaction.keyDown(event.key, { shift: event.shiftKey, alt: event.altKey, ctrl: event.ctrlKey, meta: event.metaKey, space: spaceDown })) event.preventDefault();
});
window.addEventListener('keyup', (event) => { if (event.code === 'Space') spaceDown = false; });
new ResizeObserver(resize).observe(shell);

document.querySelector('#fit').addEventListener('click', fit);
document.querySelector('#undo').addEventListener('click', () => engine.undo());
document.querySelector('#redo').addEventListener('click', () => engine.redo());
document.querySelector('#route').addEventListener('click', () => engine.autoRoute());
document.querySelector('#rotate').addEventListener('click', () => {
  const ids = engine.selection.items.filter((item) => item.kind === 'component').map((item) => item.id);
  if (ids.length) engine.rotateComponents(ids);
});
document.querySelector('#theme').addEventListener('click', (event) => { dark = !dark; event.currentTarget.textContent = dark ? 'Light' : 'Dark'; render(); });

resize();
fit();
