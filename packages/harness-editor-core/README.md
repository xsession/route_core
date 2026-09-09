# RouteCore editor-core compatibility package

This directory is the RouteCore packaging boundary for the authoritative
[`@xsession/editor-core`](../../references/editor-core) submodule.

It intentionally contains no editor implementation source. `npm run build`
copies the pinned submodule runtime into `dist/`; the application build copies
the same runtime into `apps/studio/public/vendor/editor-core`.

RouteCore-specific responsibilities remain outside the shared core:

- application shell and authoring workflows;
- SQLite project persistence, migrations, revisions, and exports;
- component and cable library services;
- RouteCore sample data, product branding, and packaged examples;
- HTTP host and browser canvas adapter.

Generic engine source, declarations, tests, APIs, routing, rendering, spatial
indexes, workers, and performance backends live in `references/editor-core`.

## Commands

```bash
npm run build
npm test
```

Initialize the submodule first when using a fresh checkout:

```bash
git submodule update --init --recursive
```
