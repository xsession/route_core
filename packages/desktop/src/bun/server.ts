/**
 * Embedded Express server for the desktop app.
 * Runs the same API server as the standalone `@route-core/server`
 * package but within the Bun process managed by Electrobun.
 */

import express from "express";
import cors from "cors";
import type { Server } from "node:http";
import {
  HarnessBuilder,
  HarnessValidator,
  BomGenerator,
  ExportManager,
  createHarness,
  type Harness,
} from "@route-core/core";

const validator = new HarnessValidator();
const bomGenerator = new BomGenerator();
const exportManager = new ExportManager();

// In-memory store for the desktop app (single-user, no SQLite needed for MVP)
const harnesses = new Map<string, Harness>();

export async function startEmbeddedServer(port: number): Promise<Server> {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  // Health
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", version: "0.1.0", mode: "desktop" });
  });

  // --- Harness CRUD ---
  app.get("/api/harnesses", (_req, res) => {
    const list = Array.from(harnesses.values()).map((h) => ({
      id: h.id,
      name: h.name,
      description: h.description,
      version: h.version,
      author: h.author,
      createdAt: h.createdAt,
      updatedAt: h.updatedAt,
    }));
    res.json(list);
  });

  app.get("/api/harnesses/:id", (req, res) => {
    const h = harnesses.get(req.params.id);
    if (!h) return res.status(404).json({ error: "Not found" });
    res.json(h);
  });

  app.post("/api/harnesses", (req, res) => {
    const harness = req.body as Harness;
    if (!harness?.id || !harness?.name) {
      return res.status(400).json({ error: "id and name are required" });
    }
    harnesses.set(harness.id, harness);
    res.status(201).json({ id: harness.id });
  });

  app.put("/api/harnesses/:id", (req, res) => {
    const existing = harnesses.get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const updated = { ...existing, ...req.body, id: req.params.id };
    harnesses.set(req.params.id, updated);
    res.json({ updated: true });
  });

  app.delete("/api/harnesses/:id", (req, res) => {
    if (!harnesses.delete(req.params.id)) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json({ deleted: true });
  });

  // --- Export ---
  app.post("/api/export/validate", (req, res) => {
    const harness = req.body as Harness;
    if (!harness?.nodes) {
      return res.status(400).json({ error: "Invalid harness data" });
    }
    const issues = validator.validate(harness);
    res.json({
      issues,
      valid: issues.filter((i) => i.severity === "error").length === 0,
    });
  });

  app.post("/api/export/bom", (req, res) => {
    const harness = req.body as Harness;
    if (!harness?.nodes) {
      return res.status(400).json({ error: "Invalid harness data" });
    }
    res.json(bomGenerator.generate(harness));
  });

  app.post("/api/export/svg", (req, res) => {
    const { harness, options } = req.body;
    if (!harness?.nodes) {
      return res.status(400).json({ error: "Invalid harness data" });
    }
    const result = exportManager.exportSvg(harness, options);
    res.setHeader("Content-Type", result.mimeType);
    res.send(result.content);
  });

  app.post("/api/export/netlist", (req, res) => {
    const harness = req.body as Harness;
    if (!harness?.nodes) {
      return res.status(400).json({ error: "Invalid harness data" });
    }
    const result = exportManager.exportNetlist(harness);
    res.setHeader("Content-Type", result.mimeType);
    res.send(result.content);
  });

  return new Promise<Server>((resolve) => {
    const server = app.listen(port, () => {
      resolve(server);
    });
  });
}
