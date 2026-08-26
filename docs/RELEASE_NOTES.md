# RouteCore Offline Studio 0.4.0 — Release Notes

## RouteCore product-name migration

Version 0.4.0 adopts **RouteCore** as the permanent project and product name. The rename is applied to the application shell, command-line output, portable launchers, package metadata, TypeScript package namespace, project-file defaults, export schemas, SVG namespaces, documentation, examples, tests, manifests, and release archives.

### Canonical names

| Surface | RouteCore 0.4.0 value |
|---|---|
| Product | `RouteCore` |
| Desktop/browser application | `RouteCore Offline Studio` |
| Root package | `routecore-offline-studio` |
| Reusable editor package | `@routecore/harness-editor-core` |
| Project extension | `.routecore` |
| Portable project example | `RouteCore-Demonstration.routecore` |
| Application home variable | `ROUTECORE_HOME` |
| Default non-portable home | `~/.routecore` |
| SVG namespace | `routecore-*`, `data-routecore-schema` |
| Project interchange schema | `routecore-project-interchange/1` |
| Netlist schema | `routecore-netlist/1` |

### Compatibility

- Existing `.ohcad` SQLite project files open directly; RouteCore does not require an up-front conversion or destructive rewrite.
- New projects use `.routecore` by default.
- The legacy `OHCAD_HOME` environment variable is accepted as a fallback when `ROUTECORE_HOME` is not set.
- If `~/.routecore` does not exist but the legacy application home does, RouteCore reuses the existing local settings and library database.
- Browser layout and theme settings are copied from legacy local-storage keys on first access, then written under the `routecore.*` namespace.
- The physical project schema remains version 3. The rename therefore requires no SQL migration.
- Newly opened project files receive the RouteCore SQLite `application_id` value while retaining all project UUIDs, model IDs, revision IDs, and engineering content.

### Packaging changes

- Release archive: `routecore-offline-studio-0.4.0.zip`.
- Editor package: `routecore-harness-editor-core-0.3.0.tgz`.
- All generated manifests, checksums, launch messages, help text, example files, and documentation now use RouteCore naming.

## Editor-correctness fixes retained

The 0.4.0 rename release includes the previous component-layout and history corrections:

- measured, collision-safe four-sided pin layout;
- dedicated north and south pin bands;
- deterministic east/west text-column sizing;
- exact component label/function bounds;
- working non-destructive command-history checkout;
- 300-state command recovery retention;
- background-derived label foreground contrast;
- matching renderer and Style-inspector color behavior.

See `BUGFIX_REPORT_0.4.0.md` for the corresponding root-cause and implementation details.

## Validation summary

- 8 integrated application, API, database, security, branding, and migration tests passed.
- 63 editor-core tests passed.
- **71 automated tests passed; zero failed.**
- Strict TypeScript builds passed for the application and editor core.
- Legacy `.ohcad` open, RouteCore export naming, and SQLite application identity were tested.
- Runtime remote-reference scan reported zero external dependencies.
- All application-facing old product-name references were removed except explicit compatibility code and migration documentation.
