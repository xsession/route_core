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
      mainview: {
        entrypoint: "src/mainview/index.ts",
      },
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
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
  release: {
    baseUrl: "",
  },
} satisfies ElectrobunConfig;
