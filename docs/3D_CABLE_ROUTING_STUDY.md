# 3D cable routing study and RouteCore implementation

## Goal

RouteCore needs a spatial projection of an electrically authoritative harness so a designer can bend cables on or through a product model, check length/bend/clash conditions, return to the logical design, and capture review evidence. The 3D path must not become a second electrical netlist.

## Products and open projects reviewed

- [FreeCAD Cables Workbench](https://github.com/sargo-devel/Cables) models cables as editable `WireFlex` paths whose vertices can attach to external objects. Its recent releases add polyline/B-spline paths, point attach/detach, connector terminals, compound paths, and cable conduits. The useful lesson is stable attachment identity: control points should refer to product geometry or terminals instead of only storing anonymous coordinates.
- [FreeCAD](https://github.com/FreeCAD/FreeCAD) and [OpenCascade.js](https://ocjs.org/) are the strongest route for exact STEP/BREP work. OpenCascade.js brings the CAD kernel to browser WebAssembly, but its payload and integration cost are better suited to a later exact-CAD import service than the first offline fit-check view.
- [Blender curve nodes](https://docs.blender.org/manual/en/dev/modeling/geometry_nodes/curve/index.html) expose the expected curve toolset: tangent, length, resample, fillet, deform-on-surface, and curve-to-mesh. This supports keeping control curves authoritative and generating display tubes from them.
- [Three.js TubeGeometry](https://threejs.org/docs/pages/TubeGeometry.html) directly extrudes a tube along a 3D curve, and [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html) loads self-contained glTF product-review meshes. This is the smallest practical browser stack for RouteCore’s local application.
- [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh/blob/master/API.md) provides accelerated ray and shape queries, including hierarchy BVHs and closest/intersection operations. It is the likely next dependency when full-mesh clearance sampling becomes a proven bottleneck.
- Commercial reference workflows converge on the same data flow. [Siemens Designcenter/NX](https://www.siemens.com/en-us/products/designcenter/cad-software/electronic-electrical-cad/wire-harness-design/) reuses logical connectivity in the product assembly, determines actual lengths, checks interference, and produces flattened manufacturing data. [Creo Cabling](https://support.ptc.com/help/creo/creo_pma/r13/usascii/electrical_design/cable/Cabling_Overview.html) uses connector entry ports, location points, route networks, autorouting, branches, and shields. [CATIA Electrical](https://www.3ds.com/assets/invest/products/catia/ebook/CATIA-ebook-electrical/index.html) explicitly provides 2D/3D gap analysis and synchronization through 3D detail, flattening, and drawings.

## Algorithms and papers reviewed

- *Automatic cable harness layout routing in a customizable 3D environment* ([arXiv](https://arxiv.org/abs/2311.09061)) formulates routing as a graph problem balancing total cable length and shared/bundled edges. Its harness-routing heuristic repeatedly solves shortest paths with A*/Dijkstra while changing the cost of edges already used by other cables, then optimizes branch points. This is a strong basis for future bundle-aware autorouting.
- *A methodology to enable automatic 3D routing of aircraft Electrical Wiring Interconnection System* ([paper](https://link.springer.com/article/10.1007/s13272-017-0238-3)) integrates minimum bend radius into A* expansion using a three-point fitted-curve radius test. RouteCore implements the same local three-point circumradius principle for immediate interactive validation.
- *Automatic cable routing based on improved pathfinding algorithm and B-spline optimization for collision avoidance* ([paper](https://academic.oup.com/jcde/article/11/5/303/7810276)) converts STEP geometry to point clouds/voxels, combines JPS with Theta* to reduce path nodes, then optimizes a B-spline against length, collision, and curvature constraints. This gives a credible staged autorouter: coarse voxel path, line-of-sight reduction, spline smoothing, then continuous constraint checking.

## Selected architecture

1. The 2D assembly document remains electrically authoritative.
2. A generic `SpatialHarnessDocument` in `editor-core` maps every wire ID to a physical 3D control curve. It stores diameter, minimum bend radius, route mode, locked endpoints, product-review model, and saved viewpoints.
3. RouteCore stores that projection in the assembly document metadata, so it participates in the existing command log, snapshots, revisions, and assembly synchronization.
4. Three.js is bundled locally. There are no CDN or cloud runtime requirements.
5. Imported product geometry is a self-contained GLB review mesh, embedded in the project for offline use. Exact STEP/BREP import is intentionally left to the OpenCascade.js phase.

## Implemented

- Assembly Builder now exposes a `Product fit` 3D view beside Layout and Schematic.
- Every assembly conductor becomes a stable spatial cable with editable Catmull–Rom control points and generated tube geometry.
- Endpoints remain attached; intermediate points can be inserted, selected, translated, or removed.
- `free`, `on-surface`, and `inside-product` route intent is persisted. On-surface edits snap to the closest axis-ray product intersection.
- Cable diameter and minimum bend radius are editable. Three-point circumradius checks run live and invalid paths turn red.
- Product intersections are counted per path for fit-check feedback.
- Self-contained `.glb` product models up to 16 MB can be embedded, faded, and section-clipped by X/Y/Z planes.
- Camera viewpoints are named and persisted for repeatable design reviews; the current view can be exported as PNG evidence.
- Spatial math and state live in `editor-core`; product import and RouteCore persistence stay in the application.

## Next routing phases

1. Add terminal-to-product datum attachments with glTF node/primitive identity and barycentric surface coordinates.
2. Voxelize the product’s keep-out volume and implement bend-aware A* using the three-point radius test during neighbor expansion.
3. Apply Theta* line-of-sight reduction and centripetal Catmull–Rom/B-spline smoothing, rejecting samples that violate clearance or curvature.
4. Add shared-edge discounts and branch-point optimization for bundles, following the harness-routing heuristic.
5. Profile large product meshes; add `three-mesh-bvh` only when native ray checks exceed the interaction budget.
6. Add OpenCascade.js or a local conversion worker for STEP/BREP tessellation while retaining source assembly/node identity.
