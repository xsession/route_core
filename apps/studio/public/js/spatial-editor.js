import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { analyzeSpatialCable, insertSpatialControlPoint, } from '../vendor/editor-core/index.js';
export class SpatialHarnessEditor {
    host;
    callbacks;
    renderer;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100000);
    controls;
    transform;
    cableGroup = new THREE.Group();
    productGroup = new THREE.Group();
    cableMeshes = new Map();
    handles = new Map();
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();
    resizeObserver;
    stateValue = { version: 1, unit: 'mm', cables: {}, cableOrder: [], viewpoints: [] };
    selectionValue = { cableId: null, pointIndex: null };
    clippingPlane = new THREE.Plane(new THREE.Vector3(0, 0, 0), 0);
    productLoadGeneration = 0;
    constructor(host, callbacks) {
        this.host = host;
        this.callbacks = callbacks;
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
        this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
        this.renderer.setClearColor(0x0c1118, 1);
        this.renderer.localClippingEnabled = true;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.host.replaceChildren(this.renderer.domElement);
        this.scene.add(this.productGroup, this.cableGroup);
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
        this.transform.addEventListener('dragging-changed', (event) => { this.controls.enabled = !event.value; });
        this.transform.addEventListener('objectChange', () => this.updateSelectedPointFromHandle(false));
        this.transform.addEventListener('mouseUp', () => this.updateSelectedPointFromHandle(true));
        this.renderer.domElement.addEventListener('pointerdown', (event) => this.selectAt(event));
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(host);
        this.resize();
    }
    get state() { return this.stateValue; }
    get selection() { return this.selectionValue; }
    setState(state) {
        this.stateValue = structuredClone(state);
        if (!this.stateValue.cables[this.selectionValue.cableId || ''])
            this.selectionValue = { cableId: this.stateValue.cableOrder[0] || null, pointIndex: null };
        this.rebuildProduct();
        this.rebuildCables();
        this.fit();
    }
    selectCable(id) {
        this.selectionValue = { cableId: id && this.stateValue.cables[id] ? id : null, pointIndex: null };
        this.transform.detach();
        this.rebuildCables();
        this.callbacks.onSelectionChanged(this.selectionValue);
    }
    analysis(id = this.selectionValue.cableId || '') {
        const cable = this.stateValue.cables[id];
        return cable ? analyzeSpatialCable(cable) : null;
    }
    collisionCount(id = this.selectionValue.cableId || '') {
        const cable = this.stateValue.cables[id];
        if (!cable || cable.surfaceMode === 'on-surface')
            return 0;
        this.scene.updateMatrixWorld(true);
        let collisions = 0;
        for (let index = 1; index < cable.controlPoints.length; index += 1) {
            const start = new THREE.Vector3(cable.controlPoints[index - 1].x, cable.controlPoints[index - 1].y, cable.controlPoints[index - 1].z);
            const end = new THREE.Vector3(cable.controlPoints[index].x, cable.controlPoints[index].y, cable.controlPoints[index].z);
            const direction = end.clone().sub(start);
            const length = direction.length();
            if (length < 1e-6)
                continue;
            this.raycaster.set(start.clone().addScaledVector(direction.normalize(), 0.01), direction);
            this.raycaster.far = Math.max(0, length - 0.02);
            if (this.raycaster.intersectObject(this.productGroup, true).length)
                collisions += 1;
        }
        this.raycaster.far = Number.POSITIVE_INFINITY;
        return collisions;
    }
    updateSelectedCable(values) {
        const cable = this.stateValue.cables[this.selectionValue.cableId || ''];
        if (!cable)
            return;
        if (values.diameterMm !== undefined)
            cable.diameterMm = Math.max(0.1, values.diameterMm);
        if (values.minimumBendRadiusMm !== undefined)
            cable.minimumBendRadiusMm = Math.max(0.1, values.minimumBendRadiusMm);
        if (values.surfaceMode)
            cable.surfaceMode = values.surfaceMode;
        this.rebuildCables();
        this.emit('edit spatial cable properties');
    }
    addControlPoint() {
        const id = this.selectionValue.cableId || '';
        const cable = this.stateValue.cables[id];
        if (!cable || cable.controlPoints.length < 2)
            return;
        const after = this.selectionValue.pointIndex == null ? Math.floor((cable.controlPoints.length - 1) / 2) : Math.min(cable.controlPoints.length - 2, this.selectionValue.pointIndex);
        this.stateValue.cables[id] = insertSpatialControlPoint(cable, after);
        this.selectionValue = { cableId: id, pointIndex: after + 1 };
        this.rebuildCables();
        this.attachSelectedHandle();
        this.emit('add spatial cable control point');
    }
    deleteControlPoint() {
        const id = this.selectionValue.cableId || '';
        const cable = this.stateValue.cables[id];
        const index = this.selectionValue.pointIndex;
        if (!cable || index == null || index <= 0 || index >= cable.controlPoints.length - 1 || cable.lockedPointIndices.includes(index))
            return;
        cable.controlPoints.splice(index, 1);
        cable.lockedPointIndices = cable.lockedPointIndices.map((value) => value > index ? value - 1 : value);
        this.selectionValue = { cableId: id, pointIndex: null };
        this.transform.detach();
        this.rebuildCables();
        this.emit('delete spatial cable control point');
    }
    setProductModel(model) {
        this.stateValue.productModel = structuredClone(model);
        this.rebuildProduct();
        this.emit('import 3D product model');
    }
    setProductUnitScale(scaleMm) {
        if (!this.stateValue.productModel || !Number.isFinite(scaleMm) || scaleMm <= 0)
            return;
        this.stateValue.productModel.sourceUnitScaleMm = scaleMm;
        this.rebuildProduct();
        this.emit('change 3D product unit scale');
    }
    setProductOpacity(opacity) {
        if (!this.stateValue.productModel)
            return;
        this.stateValue.productModel.opacity = Math.max(0.05, Math.min(1, opacity));
        this.applyProductMaterial();
        this.render();
        this.emit('change 3D product opacity');
    }
    setSection(axis, offset) {
        const normals = { x: new THREE.Vector3(-1, 0, 0), y: new THREE.Vector3(0, -1, 0), z: new THREE.Vector3(0, 0, -1) };
        if (axis === 'none')
            this.clippingPlane.normal.set(0, 0, 0);
        else
            this.clippingPlane.set(normals[axis], offset);
        this.applyProductMaterial();
        this.render();
    }
    captureViewpoint(name) {
        const viewpoint = {
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
    applyViewpoint(viewpoint) {
        this.camera.position.set(viewpoint.position.x, viewpoint.position.y, viewpoint.position.z);
        this.controls.target.set(viewpoint.target.x, viewpoint.target.y, viewpoint.target.z);
        this.controls.update();
        this.render();
    }
    fit() {
        const box = new THREE.Box3().setFromObject(this.productGroup);
        box.expandByObject(this.cableGroup);
        if (box.isEmpty())
            return;
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
    screenshot() { return this.renderer.domElement.toDataURL('image/png'); }
    rebuildProduct() {
        const loadGeneration = ++this.productLoadGeneration;
        this.disposeObjectTree(this.productGroup);
        this.productGroup.clear();
        const model = this.stateValue.productModel;
        if (!model) {
            const fixture = new THREE.Mesh(new THREE.BoxGeometry(900, 45, 520), new THREE.MeshStandardMaterial({ color: 0x334155, transparent: true, opacity: 0.28, depthWrite: false }));
            fixture.position.set(360, -40, 220);
            this.productGroup.add(fixture);
            for (const position of [[100, 25, 80], [630, 25, 360], [350, 25, 210]]) {
                const obstacle = new THREE.Mesh(new THREE.BoxGeometry(150, 130, 110), new THREE.MeshStandardMaterial({ color: 0x64748b, transparent: true, opacity: 0.5 }));
                obstacle.position.set(position[0], position[1], position[2]);
                this.productGroup.add(obstacle);
            }
            this.render();
            return;
        }
        fetch(`/api/project/assets/${encodeURIComponent(model.assetId)}`).then((response) => {
            if (!response.ok)
                throw new Error(`Could not load project asset (${response.status}).`);
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
                this.fit();
            }, (error) => console.error(error));
        }).catch((error) => console.error(error));
    }
    applyProductMaterial() {
        const opacity = this.stateValue.productModel?.opacity ?? 0.42;
        const clippingPlanes = this.clippingPlane.normal.lengthSq() ? [this.clippingPlane] : [];
        this.productGroup.traverse((object) => {
            if (!(object instanceof THREE.Mesh))
                return;
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
    rebuildCables() {
        this.transform.detach();
        for (const object of this.cableGroup.children)
            this.disposeMesh(object);
        this.cableGroup.clear();
        this.cableMeshes.clear();
        this.handles.clear();
        for (const id of this.stateValue.cableOrder) {
            const cable = this.stateValue.cables[id];
            if (!cable || cable.controlPoints.length < 2)
                continue;
            const points = cable.controlPoints.map((point) => new THREE.Vector3(point.x, point.y, point.z));
            const analysis = analyzeSpatialCable(cable);
            const mesh = this.createCableMesh(id);
            this.cableMeshes.set(id, mesh);
            this.cableGroup.add(mesh);
            if (id === this.selectionValue.cableId)
                points.forEach((point, index) => {
                    const handle = new THREE.Mesh(new THREE.SphereGeometry(Math.max(3, cable.diameterMm * 0.9), 16, 10), new THREE.MeshStandardMaterial({ color: analysis.bendViolations.some((issue) => issue.pointIndex === index) ? 0xef4444 : index === this.selectionValue.pointIndex ? 0xfacc15 : 0x38bdf8 }));
                    handle.position.copy(point);
                    handle.userData = { cableId: id, pointIndex: index };
                    this.handles.set(`${id}:${index}`, handle);
                    this.cableGroup.add(handle);
                });
        }
        this.attachSelectedHandle();
        this.render();
    }
    createCableMesh(id) {
        const cable = this.stateValue.cables[id];
        const points = cable.controlPoints.map((point) => new THREE.Vector3(point.x, point.y, point.z));
        const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.35);
        const analysis = analyzeSpatialCable(cable);
        const geometry = new THREE.TubeGeometry(curve, Math.max(16, points.length * 12), cable.diameterMm / 2, 10, false);
        const material = new THREE.MeshStandardMaterial({ color: analysis.valid && this.collisionCount(id) === 0 ? cable.color : 0xef4444, roughness: 0.48, metalness: 0.05 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = { cableId: id, kind: 'cable' };
        return mesh;
    }
    refreshCableVisual(id) {
        const previous = this.cableMeshes.get(id);
        if (previous) {
            this.cableGroup.remove(previous);
            this.disposeMesh(previous);
        }
        const cable = this.stateValue.cables[id];
        if (!cable || cable.controlPoints.length < 2)
            return;
        const mesh = this.createCableMesh(id);
        this.cableMeshes.set(id, mesh);
        this.cableGroup.add(mesh);
        const analysis = analyzeSpatialCable(cable);
        for (let index = 0; index < cable.controlPoints.length; index += 1) {
            const handle = this.handles.get(`${id}:${index}`);
            const material = handle?.material;
            if (!(material instanceof THREE.MeshStandardMaterial))
                continue;
            material.color.set(analysis.bendViolations.some((issue) => issue.pointIndex === index)
                ? 0xef4444
                : index === this.selectionValue.pointIndex ? 0xfacc15 : 0x38bdf8);
        }
        this.render();
    }
    disposeMesh(object) {
        if (!(object instanceof THREE.Mesh))
            return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials)
            material.dispose();
    }
    disposeObjectTree(root) {
        root.traverse((object) => {
            if (!(object instanceof THREE.Mesh))
                return;
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            for (const material of materials) {
                for (const value of Object.values(material))
                    if (value instanceof THREE.Texture)
                        value.dispose();
                material.dispose();
            }
        });
    }
    selectAt(event) {
        if (this.transform.dragging)
            return;
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const hit = this.raycaster.intersectObjects([...this.handles.values()], false)[0];
        if (!hit)
            return;
        this.selectionValue = { cableId: hit.object.userData.cableId, pointIndex: hit.object.userData.pointIndex };
        this.rebuildCables();
        this.callbacks.onSelectionChanged(this.selectionValue);
    }
    attachSelectedHandle() {
        const { cableId, pointIndex } = this.selectionValue;
        const handle = cableId != null && pointIndex != null ? this.handles.get(`${cableId}:${pointIndex}`) : undefined;
        const cable = cableId ? this.stateValue.cables[cableId] : undefined;
        if (handle && pointIndex != null && !cable?.lockedPointIndices.includes(pointIndex))
            this.transform.attach(handle);
        else
            this.transform.detach();
    }
    updateSelectedPointFromHandle(commit) {
        const { cableId, pointIndex } = this.selectionValue;
        if (cableId == null || pointIndex == null)
            return;
        const handle = this.handles.get(`${cableId}:${pointIndex}`);
        const cable = this.stateValue.cables[cableId];
        const point = cable?.controlPoints[pointIndex];
        if (!handle || !point)
            return;
        if (cable.surfaceMode === 'on-surface') {
            const snapped = this.nearestProductSurface(handle.position);
            if (snapped)
                handle.position.copy(snapped);
        }
        point.x = handle.position.x;
        point.y = handle.position.y;
        point.z = handle.position.z;
        if (commit) {
            this.rebuildCables();
            this.emit('move spatial cable control point');
        }
        else {
            this.refreshCableVisual(cableId);
        }
    }
    nearestProductSurface(point) {
        this.scene.updateMatrixWorld(true);
        const directions = [
            new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
            new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
            new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
        ];
        let nearest;
        for (const direction of directions) {
            this.raycaster.set(point, direction);
            const hit = this.raycaster.intersectObject(this.productGroup, true)[0];
            if (hit && (!nearest || hit.distance < nearest.distance))
                nearest = hit;
        }
        return nearest?.point.clone() || null;
    }
    emit(reason) { this.callbacks.onChanged(structuredClone(this.stateValue), reason); }
    point(value) { return { x: value.x, y: value.y, z: value.z }; }
    resize() {
        const width = Math.max(1, this.host.clientWidth);
        const height = Math.max(1, this.host.clientHeight);
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.render();
    }
    render() {
        this.renderer.render(this.scene, this.camera);
    }
}
//# sourceMappingURL=spatial-editor.js.map