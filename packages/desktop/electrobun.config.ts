import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Route Core",
    identifier: "dev.routecore.app",
    version: "0.1.0",
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    views: {
      // Thin shim that sets __ROUTE_CORE_API_BASE__ fallback.
      // The real React app is copied by the postBuild script.
      mainview: {
        entrypoint: "src/mainview/index.ts",
      },
    },
    copy: {
      // Placeholder CSS (React app provides its own styles too)
      "src/mainview/styles.css": "views/mainview/styles.css",
      "../../data/seed/connectors.json": "resources/seed/connectors.json",
    },
    useAsar: true,
    asarUnpack: ["*.node", "*.dll", "*.dylib", "*.so", "*.db"],
    mac: {
      codesign: false,
      notarize: false,
    },
    linux: {},
    win: {},
  },
  scripts: {
    postBuild: "./scripts/post-build.ts",
  },
  release: {
    baseUrl: "",
  },
} satisfies ElectrobunConfig;
