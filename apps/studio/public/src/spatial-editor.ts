import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  analyzeSpatialCable,
  buildSpatialKeepOutVolume,
  insertSpatialControlPoint,
  routeSpatialBundle,
  routeSpatialCable,
  type SpatialBundleResult,
  type SpatialCableAnalysis,
  type SpatialHarnessDocument,
  type SpatialKeepOutVolume,
  type SpatialPoint,
  type SpatialProductModel,
  type SpatialRouteResult,
  type SpatialTriangle,
  type SpatialViewpoint,
} from '../vendor/editor-core/index.js';

export interface SpatialSelection {
  cableId: string | null;
  pointIndex: number | null;
}

/** Cable grouping info derived from the 2D document (cable definition applied to wires). */
export interface SpatialCableGroupInfo {
  cableId: string;
  groupKey: string;
  groupName: string;
  coreCount: number;
  outerDiameterMm?: number;
}

/** A connector body to render at a component the harness plugs into. */
export interface SpatialConnectorAnchor {
  id: string;
  label: string;
  position: { x: number; y: number; z: number };
  /** Unit-ish direction from the connector toward the harness (used to orient the plug). */
  direction: { x: number; y: number; z: number };
  portCount: number;
  pitchMm: number;
}

interface SpatialEditorCallbacks {
  onChanged(state: SpatialHarnessDocument, reason: string): void;
  onSelectionChanged(selection: SpatialSelection): void;
}

export class SpatialHarnessEditor {
  private readonly host: HTMLElement;
  private readonly callbacks: SpatialEditorCallbacks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100000);
  private readonly controls: OrbitControls;
  private readonly transform: TransformControls;
  private readonly cableGroup = new THREE.Group();
  private readonly productGroup = new THREE.Group();
  private readonly connectorGroup = new THREE.Group();
  private readonly cableMeshes = new Map<string, THREE.Mesh>();
  private readonly handles = new Map<string, THREE.Mesh>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly resizeObserver: ResizeObserver;
  private stateValue: SpatialHarnessDocument = { version: 1, unit: 'mm', cables: {}, cableOrder: [], viewpoints: [] };
  private selectionValue: SpatialSelection = { cableId: null, pointIndex: null };
  private clippingPlane = new THREE.Plane(new THREE.Vector3(0, 0, 0), 0);
  private productLoadGeneration = 0;
  private productLoaded = false;
  private readonly keepOutCache = new Map<string, SpatialKeepOutVolume | null>();
  private dragOrigin: { cableId: string; pointIndex: number; position: THREE.Vector3 } | null = null;
  private sheathMeshes = new Map<string, THREE.Mesh>();
  private harnessModeValue = false;
  private cableGroups = new Map<string, SpatialCableGroupInfo>();
  private connectorAnchors: SpatialConnectorAnchor[] = [];

  public constructor(host: HTMLElement, callbacks: SpatialEditorCallbacks) {
    this.host = host;
    this.callbacks = callbacks;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.renderer.setClearColor(0x0c1118, 1);
    this.renderer.localClippingEnabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.host.replaceChildren(this.renderer.domElement);
    this.scene.add(this.productGroup, this.cableGroup, this.connectorGroup);
    this.scene.add(new THREE.GridHelper(3000, 60, 0x334155, 0x1e293b));
    this.scene.add(new THREE.AxesHelper(80));
    this.scene.add(new THREE.HemisphereLight(0xdbeafe, 0x111827, 2.2));
    const light = new THREE.DirectionalLight(0xffffff, 2.4);
    light.position.set(500, 900, 600);
    this.scene.add(light);
    this.camera.position.set(650, 520, 760);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(300, 0, 180);
    this.controls.enableDamping = false;
    this.controls.addEventListener('change', () => this.render());
    this.transform = new TransformControls(this.camera, this.renderer.domElement);
    this.transform.setMode('translate');
    this.scene.add(this.transform.getHelper());
    this.transform.addEventListener('dragging-changed', (event) => {
      if (event.value) {
        const { cableId, pointIndex } = this.selectionValue;
        if (cableId != null && pointIndex != null) {
          const point = this.stateValue.cables[cableId]?.controlPoints[pointIndex];
          if (point) this.dragOrigin = { cableId, pointIndex, position: new THREE.Vector3(point.x, point.y, point.z) };
        }
      }
      this.dragOrigin = event.value ? this.dragOrigin : null;
      this.controls.enabled = !event.value;
    });
    this.transform.addEventListener('objectChange', () => this.updateSelectedPointFromHandle(false));
    this.transform.addEventListener('mouseUp', () => this.updateSelectedPointFromHandle(true));
    this.renderer.domElement.addEventListener('pointerdown', (event) => this.selectAt(event));
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
  }

  public get state(): Readonly<SpatialHarnessDocument> { return this.stateValue; }
  public get selection(): Readonly<SpatialSelection> { return this.selectionValue; }
  /** True while a 3D control-point handle is being dragged (right-click/Esc should cancel the move). */
  public get transformDragging(): boolean { return this.transform.dragging; }
  /** Reverts the in-flight handle drag back to its origin (used by Esc / right-click cancel). */
  public cancelHandleDrag(): void {
    const origin = this.dragOrigin;
    this.transform.detach();
    if (!origin) return;
    this.dragOrigin = null;
    const cable = this.stateValue.cables[origin.cableId];
    const point = cable?.controlPoints[origin.pointIndex];
    const handle = this.handles.get(`${origin.cableId}:${origin.pointIndex}`);
    if (point) {
      point.x = origin.position.x;
      point.y = origin.position.y;
      point.z = origin.position.z;
    }
    if (handle) handle.position.copy(origin.position);
    if (cable) this.refreshCableVisual(origin.cableId);
  }

  /** Harness mode: wires render as thinner cores inside a shared cable sheath. */
  public get harnessMode(): boolean { return this.harnessModeValue; }
  public setHarnessMode(value: boolean): void {
    this.harnessModeValue = value;
    this.rebuildCables();
    this.rebuildSheaths();
    this.rebuildConnectors();
  }

  /** Feeds cable grouping + connector anchors derived from the 2D document. */
  public setHarnessData(cableGroups: readonly SpatialCableGroupInfo[], connectorAnchors: readonly SpatialConnectorAnchor[]): void {
    this.cableGroups = new Map(cableGroups.map((group) => [group.cableId, group]));
    this.connectorAnchors = [...connectorAnchors];
    this.rebuildSheaths();
    this.rebuildConnectors();
  }

  public setState(state: SpatialHarnessDocument): void {
    this.stateValue = structuredClone(state);
    if (!this.stateValue.cables[this.selectionValue.cableId || '']) this.selectionValue = { cableId: this.stateValue.cableOrder[0] || null, pointIndex: null };
    this.rebuildProduct();
    this.rebuildCables();
    this.rebuildSheaths();
    this.rebuildConnectors();
    this.fit();
  }

  public selectCable(id: string | null): void {
    this.selectionValue = { cableId: id && this.stateValue.cables[id] ? id : null, pointIndex: null };
    this.transform.detach();
    this.rebuildCables();
    this.callbacks.onSelectionChanged(this.selectionValue);
  }

  public analysis(id = this.selectionValue.cableId || ''): SpatialCableAnalysis | null {
    const cable = this.stateValue.cables[id];
    return cable ? analyzeSpatialCable(cable) : null;
  }

  public collisionCount(id = this.selectionValue.cableId || ''): number {
    const cable = this.stateValue.cables[id];
    if (!cable || cable.surfaceMode === 'on-surface') return 0;
    this.scene.updateMatrixWorld(true);
    let collisions = 0;
    for (let index = 1; index < cable.controlPoints.length; index += 1) {
      const start = new THREE.Vector3(cable.controlPoints[index - 1]!.x, cable.controlPoints[index - 1]!.y, cable.controlPoints[index - 1]!.z);
      const end = new THREE.Vector3(cable.controlPoints[index]!.x, cable.controlPoints[index]!.y, cable.controlPoints[index]!.z);
      const direction = end.clone().sub(start);
      const length = direction.length();
      if (length < 1e-6) continue;
      this.raycaster.set(start.clone().addScaledVector(direction.normalize(), 0.01), direction);
      this.raycaster.far = Math.max(0, length - 0.02);
      if (this.raycaster.intersectObject(this.productGroup, true).length) collisions += 1;
    }
    this.raycaster.far = Number.POSITIVE_INFINITY;
    return collisions;
  }

  public updateSelectedCable(values: { diameterMm?: number; minimumBendRadiusMm?: number; surfaceMode?: 'free' | 'on-surface' | 'inside-product' }): void {
    const cable = this.stateValue.cables[this.selectionValue.cableId || ''];
    if (!cable) return;
    if (values.diameterMm !== undefined) cable.diameterMm = Math.max(0.1, values.diameterMm);
    if (values.minimumBendRadiusMm !== undefined) cable.minimumBendRadiusMm = Math.max(0.1, values.minimumBendRadiusMm);
    if (values.surfaceMode) cable.surfaceMode = values.surfaceMode;
    this.rebuildCables();
    this.emit('edit spatial cable properties');
  }

  public addControlPoint(): void {
    const id = this.selectionValue.cableId || '';
    const cable = this.stateValue.cables[id];
    if (!cable || cable.controlPoints.length < 2) return;
    const after = this.selectionValue.pointIndex == null ? Math.floor((cable.controlPoints.length - 1) / 2) : Math.min(cable.controlPoints.length - 2, this.selectionValue.pointIndex);
    this.stateValue.cables[id] = insertSpatialControlPoint(cable, after);
    this.selectionValue = { cableId: id, pointIndex: after + 1 };
    this.rebuildCables();
    this.attachSelectedHandle();
    this.emit('add spatial cable control point');
  }

  public deleteControlPoint(): void {
    const id = this.selectionValue.cableId || '';
    const cable = this.stateValue.cables[id];
    const index = this.selectionValue.pointIndex;
    if (!cable || index == null || index <= 0 || index >= cable.controlPoints.length - 1 || cable.lockedPointIndices.includes(index)) return;
    cable.controlPoints.splice(index, 1);
    cable.lockedPointIndices = cable.lockedPointIndices.map((value) => value > index ? value - 1 : value);
    this.selectionValue = { cableId: id, pointIndex: null };
    this.transform.detach();
    this.rebuildCables();
    this.emit('delete spatial cable control point');
  }

  public setProductModel(model: SpatialProductModel): void {
    this.stateValue.productModel = structuredClone(model);
    this.rebuildProduct();
    this.emit('import 3D product model');
  }

  public setProductUnitScale(scaleMm: number): void {
    if (!this.stateValue.productModel || !Number.isFinite(scaleMm) || scaleMm <= 0) return;
    this.stateValue.productModel.sourceUnitScaleMm = scaleMm;
    this.rebuildProduct();
    this.emit('change 3D product unit scale');
  }

  public setProductOpacity(opacity: number): void {
    if (!this.stateValue.productModel) return;
    this.stateValue.productModel.opacity = Math.max(0.05, Math.min(1, opacity));
    this.applyProductMaterial();
    this.render();
    this.emit('change 3D product opacity');
  }

  public setSection(axis: 'none' | 'x' | 'y' | 'z', offset: number): void {
    const normals = { x: new THREE.Vector3(-1, 0, 0), y: new THREE.Vector3(0, -1, 0), z: new THREE.Vector3(0, 0, -1) };
    if (axis === 'none') this.clippingPlane.normal.set(0, 0, 0);
    else this.clippingPlane.set(normals[axis], offset);
    this.applyProductMaterial();
    this.render();
  }

  /**
   * Extracts the product's world-space triangles from the loaded GLB scene
   * (or the built-in fit-check fixture). The model-to-harness transform has
   * already been applied to the scene matrix, so vertices read back here are
   * directly in harness mm coordinates for the keep-out volume.
   */
  public collectProductTriangles(maxTriangles: number): SpatialTriangle[] {
    this.scene.updateMatrixWorld(true);
    const output: SpatialTriangle[] = [];
    const seen = new Set<THREE.BufferGeometry>();
    const v = new THREE.Vector3();
    this.productGroup.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!(mesh instanceof THREE.Mesh)) return;
      const geometry = mesh.geometry;
      if (seen.has(geometry)) return;
      seen.add(geometry);
      const position = geometry.getAttribute('position');
      if (!position) return;
      const pos = position as THREE.BufferAttribute;
      const array = pos.array as Float32Array;
      const itemSize = pos.itemSize;
      const index = geometry.getIndex();
      const count = index ? index.count : position.count;
      for (let face = 0; face < count; face += 3) {
        if (output.length >= maxTriangles) return;
        const ia = index ? index.getX(face) : face;
        const ib = index ? index.getX(face + 1) : face + 1;
        const ic = index ? index.getX(face + 2) : face + 2;
        const oa = ia * itemSize, ob = ib * itemSize, oc = ic * itemSize;
        mesh.localToWorld(v.set(array[oa]!, array[oa + 1]!, array[oa + 2]!));
        const a = { x: v.x, y: v.y, z: v.z };
        mesh.localToWorld(v.set(array[ob]!, array[ob + 1]!, array[ob + 2]!));
        const b = { x: v.x, y: v.y, z: v.z };
        mesh.localToWorld(v.set(array[oc]!, array[oc + 1]!, array[oc + 2]!));
        const c = { x: v.x, y: v.y, z: v.z };
        output.push({ a, b, c });
      }
    });
    return output;
  }

  /**
   * Builds (and caches) the keep-out volume for the current product geometry
   * at the requested clearance. Cached per clearance so repeated autoroute
   * runs with the same margin do not re-triangulate the mesh.
   */
  public buildKeepOut(clearanceMm: number, cellSizeMm = 4): SpatialKeepOutVolume | null {
    const key = `${clearanceMm}:${cellSizeMm}:${this.productLoadGeneration}`;
    const cached = this.keepOutCache.get(key);
    if (cached !== undefined) return cached;
    const triangles = this.collectProductTriangles(12000);
    const volume = buildSpatialKeepOutVolume(triangles, { clearanceMm, cellSizeMm, maxTriangles: 12000 });
    this.keepOutCache.set(key, volume);
    return volume;
  }

  /**
   * Routes the selected cable around the product keep-out volume using the
   * bend-aware A* autorouter and applies the result to the cable's
   * intermediate control points (endpoints stay locked/attached).
   */
  public autorouteCable(cableId: string, options: { clearanceMm?: number } = {}): SpatialRouteResult | null {
    if (!this.productLoaded) return null;
    const cable = this.stateValue.cables[cableId];
    if (!cable || cable.controlPoints.length < 2) return null;
    const volume = this.buildKeepOut(options.clearanceMm ?? 0);
    const result = routeSpatialCable(cable, volume, { maxExpansions: 250000 });
    if (result.success) {
      this.stateValue.cables[cableId] = {
        ...cable,
        controlPoints: result.controlPoints,
        lockedPointIndices: [0, result.controlPoints.length - 1],
      };
      this.rebuildCables();
      this.emit('autoroute 3D cable');
    }
    return result;
  }

  /**
   * Routes the whole harness as a bundle with shared-edge discounts so
   * cables share trunk segments and create branch points. Applies every
   * accepted route back onto the cables (endpoints stay locked).
   */
  public autorouteBundle(options: { clearanceMm?: number; sharedEdgeDiscount?: number } = {}): SpatialBundleResult[] {
    if (!this.productLoaded) return [];
    const cables = this.stateValue.cableOrder.map((id) => this.stateValue.cables[id]).filter(Boolean);
    if (!cables.length) return [];
    const volume = this.buildKeepOut(options.clearanceMm ?? 0);
    const results = routeSpatialBundle(cables, volume, {
      maxExpansions: 250000,
      sharedEdgeDiscount: options.sharedEdgeDiscount ?? 0.25,
    });
    for (const result of results) {
      if (!result.success) continue;
      const cable = this.stateValue.cables[result.cableId];
      if (!cable) continue;
      this.stateValue.cables[result.cableId] = {
        ...cable,
        controlPoints: result.controlPoints,
        lockedPointIndices: [0, result.controlPoints.length - 1],
      };
    }
    this.rebuildCables();
    this.emit('autoroute 3D cable bundle');
    return results;
  }

  public captureViewpoint(name: string): SpatialViewpoint {
    const viewpoint: SpatialViewpoint = {
      id: `view-${Date.now().toString(36)}`,
      name,
      position: this.point(this.camera.position),
      target: this.point(this.controls.target),
      createdAt: new Date().toISOString(),
    };
    this.stateValue.viewpoints.push(viewpoint);
    this.emit('capture 3D documentation viewpoint');
    return viewpoint;
  }

  public applyViewpoint(viewpoint: SpatialViewpoint): void {
    this.camera.position.set(viewpoint.position.x, viewpoint.position.y, viewpoint.position.z);
    this.controls.target.set(viewpoint.target.x, viewpoint.target.y, viewpoint.target.z);
    this.controls.update();
    this.render();
  }

  public fit(): void {
    const box = new THREE.Box3().setFromObject(this.productGroup);
    box.expandByObject(this.cableGroup);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(100, sphere.radius);
    this.controls.target.copy(sphere.center);
    this.camera.position.copy(sphere.center).add(new THREE.Vector3(radius * 1.45, radius * 1.05, radius * 1.45));
    this.camera.near = Math.max(0.1, radius / 1000);
    this.camera.far = radius * 20;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.render();
  }

  public screenshot(): string { return this.renderer.domElement.toDataURL('image/png'); }

  private rebuildProduct(): void {
    const loadGeneration = ++this.productLoadGeneration;
    this.productLoaded = false;
    this.keepOutCache.clear();
    this.disposeObjectTree(this.productGroup);
    this.productGroup.clear();
    const model = this.stateValue.productModel;
    if (!model) {
      const fixture = new THREE.Mesh(new THREE.BoxGeometry(900, 45, 520), new THREE.MeshStandardMaterial({ color: 0x334155, transparent: true, opacity: 0.28, depthWrite: false }));
      fixture.position.set(360, -40, 220);
      this.productGroup.add(fixture);
      for (const position of [[100, 25, 80], [630, 25, 360], [350, 25, 210]]) {
        const obstacle = new THREE.Mesh(new THREE.BoxGeometry(150, 130, 110), new THREE.MeshStandardMaterial({ color: 0x64748b, transparent: true, opacity: 0.5 }));
        obstacle.position.set(position[0]!, position[1]!, position[2]!);
        this.productGroup.add(obstacle);
      }
      this.productLoaded = true;
      this.render();
      return;
    }
    fetch(`/api/project/assets/${encodeURIComponent(model.assetId)}`).then((response) => {
      if (!response.ok) throw new Error(`Could not load project asset (${response.status}).`);
      return response.arrayBuffer();
    }).then((buffer) => {
      new GLTFLoader().parse(buffer, '', (gltf) => {
        if (loadGeneration !== this.productLoadGeneration) {
          this.disposeObjectTree(gltf.scene);
          return;
        }
        const sourceScale = Number.isFinite(model.sourceUnitScaleMm) && model.sourceUnitScaleMm > 0 ? model.sourceUnitScaleMm : 1000;
        const sourceUnit = new THREE.Matrix4().makeScale(sourceScale, sourceScale, sourceScale);
        const placement = new THREE.Matrix4().fromArray(model.modelToHarnessTransform);
        gltf.scene.applyMatrix4(new THREE.Matrix4().multiplyMatrices(placement, sourceUnit));
        this.productGroup.add(gltf.scene);
        this.applyProductMaterial();
        this.productLoaded = true;
        this.fit();
      }, (error) => console.error(error));
    }).catch((error) => console.error(error));
  }

  /** True when the current product geometry (fixture or loaded GLB) is present. */
  public get isProductReady(): boolean { return this.productLoaded; }

  private applyProductMaterial(): void {
    const opacity = this.stateValue.productModel?.opacity ?? 0.42;
    const clippingPlanes = this.clippingPlane.normal.lengthSq() ? [this.clippingPlane] : [];
    this.productGroup.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        material.transparent = opacity < 1;
        material.opacity = opacity;
        material.depthWrite = opacity >= 1;
        material.clippingPlanes = clippingPlanes;
        material.needsUpdate = true;
      }
    });
  }

  private rebuildCables(): void {
    this.transform.detach();
    for (const object of this.cableGroup.children) this.disposeMesh(object);
    this.cableGroup.clear();
    this.cableMeshes.clear();
    this.handles.clear();
    for (const id of this.stateValue.cableOrder) {
      const cable = this.stateValue.cables[id];
      if (!cable || cable.controlPoints.length < 2) continue;
      const points = cable.controlPoints.map((point) => new THREE.Vector3(point.x, point.y, point.z));
      const analysis = analyzeSpatialCable(cable);
      const mesh = this.createCableMesh(id);
      this.cableMeshes.set(id, mesh);
      this.cableGroup.add(mesh);
      if (id === this.selectionValue.cableId) points.forEach((point, index) => {
        const handle = new THREE.Mesh(new THREE.SphereGeometry(Math.max(3, cable.diameterMm * 0.9), 16, 10), new THREE.MeshStandardMaterial({ color: analysis.bendViolations.some((issue) => issue.pointIndex === index) ? 0xef4444 : index === this.selectionValue.pointIndex ? 0xfacc15 : 0x38bdf8 }));
        handle.position.copy(point);
        handle.userData = { cableId: id, pointIndex: index };
        this.handles.set(`${id}:${index}`, handle);
        this.cableGroup.add(handle);
      });
    }
    this.attachSelectedHandle();
    this.rebuildSheaths();
    this.render();
  }

  /**
   * Rebuilds the harness sheaths: one translucent outer tube per cable group
   * (wires sharing a cable definition) that contains 2+ cores. Each sheath
   * follows the group's core routes, so the harness reads as a real loom.
   */
  private rebuildSheaths(): void {
    for (const mesh of this.sheathMeshes.values()) this.disposeMesh(mesh);
    this.sheathMeshes.clear();
    if (!this.harnessModeValue) return;
    const byGroup = new Map<string, SpatialCableGroupInfo>();
    const members = new Map<string, string[]>();
    for (const id of this.stateValue.cableOrder) {
      const group = this.cableGroups.get(id);
      if (!group || group.coreCount < 2) continue;
      byGroup.set(group.groupKey, group);
      members.set(group.groupKey, [...(members.get(group.groupKey) || []), id]);
    }
    for (const [groupKey, group] of byGroup) {
      const ids = members.get(groupKey) || [];
      if (ids.length < 2) continue;
      const spineId = ids.reduce((a, b) => (this.stateValue.cables[b]?.controlPoints.length || 0) > (this.stateValue.cables[a]?.controlPoints.length || 0) ? b : a);
      const spineCable = this.stateValue.cables[spineId];
      if (!spineCable) continue;
      const points = spineCable.controlPoints.map((point) => new THREE.Vector3(point.x, point.y, point.z));
      const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.35);
      const coreRadius = Math.max(...ids.map((id) => this.stateValue.cables[id]?.diameterMm || 1));
      const sheathRadius = (group.outerDiameterMm && group.outerDiameterMm > coreRadius)
        ? group.outerDiameterMm / 2
        : coreRadius * Math.max(1.6, Math.sqrt(ids.length) * 0.9);
      const geometry = new THREE.TubeGeometry(curve, Math.max(24, points.length * 12), sheathRadius, 16, false);
      const material = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.62, metalness: 0.08, transparent: true, opacity: 0.82 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData = { kind: 'sheath', groupKey };
      this.sheathMeshes.set(groupKey, mesh);
      this.cableGroup.add(mesh);
    }
  }

  /**
   * Rebuilds the parametric connector bodies at each anchor (one per component
   * the harness plugs into): a plug body with a row of pin stubs sized from the
   * port count and pitch.
   */
  private rebuildConnectors(): void {
    for (const object of [...this.connectorGroup.children]) {
      this.disposeObjectTree(object);
      this.connectorGroup.remove(object);
    }
    for (const anchor of this.connectorAnchors) {
      const body = this.buildParametricConnector(anchor);
      if (body) this.connectorGroup.add(body);
    }
  }

  private buildParametricConnector(anchor: SpatialConnectorAnchor): THREE.Group {
    const count = Math.max(1, anchor.portCount);
    const pitch = Math.max(1.5, anchor.pitchMm);
    const width = count * pitch + 6;
    const height = Math.max(12, pitch * 2.4);
    const depth = 18;
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.42, metalness: 0.18 })));
    const face = new THREE.Mesh(new THREE.BoxGeometry(width + 2, height + 2, 4), new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.35, metalness: 0.3 }));
    face.position.z = -depth / 2 - 2;
    group.add(face);
    const pinMaterial = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.25, metalness: 0.85 });
    const startX = -((count - 1) * pitch) / 2;
    for (let i = 0; i < count; i += 1) {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(pitch * 0.22, pitch * 0.22, 10, 10), pinMaterial);
      pin.rotation.x = Math.PI / 2;
      pin.position.set(startX + i * pitch, 0, -depth / 2 - 6);
      group.add(pin);
    }
    group.position.set(anchor.position.x, anchor.position.y, anchor.position.z);
    const direction = new THREE.Vector3(anchor.direction.x, anchor.direction.y, anchor.direction.z);
    if (direction.lengthSq() > 1e-9) {
      group.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction.clone().normalize()));
    }
    group.userData = { kind: 'connector', label: anchor.label, portCount: count };
    return group;
  }

  private createCableMesh(id: string): THREE.Mesh {
    const cable = this.stateValue.cables[id]!;
    const points = cable.controlPoints.map((point) => new THREE.Vector3(point.x, point.y, point.z));
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.35);
    const analysis = analyzeSpatialCable(cable);
    // In harness mode the cores sit inside the cable sheath, so they render thinner.
    const radiusMm = this.harnessModeValue && this.cableGroups.has(id) ? cable.diameterMm * 0.45 : cable.diameterMm / 2;
    const geometry = new THREE.TubeGeometry(curve, Math.max(16, points.length * 12), radiusMm, 10, false);
    const material = new THREE.MeshStandardMaterial({ color: analysis.valid && this.collisionCount(id) === 0 ? cable.color : 0xef4444, roughness: 0.48, metalness: 0.05 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { cableId: id, kind: 'cable' };
    return mesh;
  }

  private refreshCableVisual(id: string): void {
    const previous = this.cableMeshes.get(id);
    if (previous) {
      this.cableGroup.remove(previous);
      this.disposeMesh(previous);
    }
    const cable = this.stateValue.cables[id];
    if (!cable || cable.controlPoints.length < 2) return;
    const mesh = this.createCableMesh(id);
    this.cableMeshes.set(id, mesh);
    this.cableGroup.add(mesh);

    const analysis = analyzeSpatialCable(cable);
    for (let index = 0; index < cable.controlPoints.length; index += 1) {
      const handle = this.handles.get(`${id}:${index}`);
      const material = handle?.material;
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      material.color.set(analysis.bendViolations.some((issue) => issue.pointIndex === index)
        ? 0xef4444
        : index === this.selectionValue.pointIndex ? 0xfacc15 : 0x38bdf8);
    }
    this.render();
  }

  private disposeMesh(object: THREE.Object3D): void {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  }

  private disposeObjectTree(root: THREE.Object3D): void {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
        material.dispose();
      }
    });
  }

  private selectAt(event: PointerEvent): void {
    if (this.transform.dragging) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects([...this.handles.values()], false)[0];
    if (!hit) return;
    this.selectionValue = { cableId: hit.object.userData.cableId, pointIndex: hit.object.userData.pointIndex };
    this.rebuildCables();
    this.callbacks.onSelectionChanged(this.selectionValue);
  }

  private attachSelectedHandle(): void {
    const { cableId, pointIndex } = this.selectionValue;
    const handle = cableId != null && pointIndex != null ? this.handles.get(`${cableId}:${pointIndex}`) : undefined;
    const cable = cableId ? this.stateValue.cables[cableId] : undefined;
    if (handle && pointIndex != null && !cable?.lockedPointIndices.includes(pointIndex)) this.transform.attach(handle);
    else this.transform.detach();
  }

  private updateSelectedPointFromHandle(commit: boolean): void {
    const { cableId, pointIndex } = this.selectionValue;
    if (cableId == null || pointIndex == null) return;
    const handle = this.handles.get(`${cableId}:${pointIndex}`);
    const cable = this.stateValue.cables[cableId];
    const point = cable?.controlPoints[pointIndex];
    if (!handle || !point) return;
    if (cable.surfaceMode === 'on-surface') {
      const snapped = this.nearestProductSurface(handle.position);
      if (snapped) handle.position.copy(snapped);
    }
    point.x = handle.position.x;
    point.y = handle.position.y;
    point.z = handle.position.z;
    if (commit) {
      this.rebuildCables();
      this.emit('move spatial cable control point');
    } else {
      this.refreshCableVisual(cableId);
    }
  }

  private nearestProductSurface(point: THREE.Vector3): THREE.Vector3 | null {
    this.scene.updateMatrixWorld(true);
    const directions = [
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
    ];
    let nearest: THREE.Intersection | undefined;
    for (const direction of directions) {
      this.raycaster.set(point, direction);
      const hit = this.raycaster.intersectObject(this.productGroup, true)[0];
      if (hit && (!nearest || hit.distance < nearest.distance)) nearest = hit;
    }
    return nearest?.point.clone() || null;
  }

  private emit(reason: string): void { this.callbacks.onChanged(structuredClone(this.stateValue), reason); }
  private point(value: THREE.Vector3): SpatialPoint { return { x: value.x, y: value.y, z: value.z }; }
  private resize(): void {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.render();
  }
  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
