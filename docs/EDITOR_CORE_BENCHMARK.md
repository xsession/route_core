# RouteCore editor-core scale benchmark

Run on 2026-09-09 with Node.js 22.20.0 using `node scripts/benchmark-editor.mjs`. The corpus uses routed free-endpoint conductors so the measurement isolates document cloning, scene/index construction, and a one-wire localized mutation. Times are machine-specific and are not release budgets.

| Entities | Initialize | Localized mutation | Dependency reroutes | Scope | Full rebuild |
| ---: | ---: | ---: | ---: | ---: | :---: |
| 1,000 | 334.92 ms | 205.25 ms | 1 | 0.100% | no |
| 10,000 | 4,218.79 ms | 2,398.09 ms | 1 | 0.010% | no |
| 50,000 | 22,195.24 ms | 12,943.26 ms | 1 | 0.002% | no |

The dependency scope is correct: editing one wire reroutes one wire at every scale and never requests a full scene rebuild. The remaining latency is dominated by whole-document cloning/diff work around the localized mutation. That is now the justified optimization target; expanding routing invalidation would not improve these measurements.

An earlier mixed component/wire corpus also exposed the legacy constructor’s per-component scan across all wires (`connectedPortIds`), which behaves as O(components × wires). Future work should source connected-port sets from `MutableConnectivityIndex` during initial geometry construction, then repeat both corpora.

Use `npm run benchmark:editor` for the build plus default 1k/10k/50k run, or `node scripts/benchmark-editor.mjs 1000 5000` for selected sizes.
