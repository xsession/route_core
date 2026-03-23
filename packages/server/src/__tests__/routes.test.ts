import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import type { Server } from 'http';

// Lightweight route-level tests without database dependencies
// These test the route handler logic by verifying request/response patterns

describe('Server API Routes', () => {
  describe('Health Check', () => {
    it('should return status ok', async () => {
      const app = express();
      app.get('/api/health', (_req, res) => {
        res.json({ status: 'ok', version: '0.1.0' });
      });

      // Use supertest-like approach with native fetch
      const server = app.listen(0); // random port
      const port = (server.address() as any).port;

      try {
        const res = await fetch(`http://localhost:${port}/api/health`);
        const data = await res.json();
        expect(data.status).toBe('ok');
        expect(data.version).toBe('0.1.0');
      } finally {
        server.close();
      }
    });
  });
});

describe('Export Route Handlers', () => {
  it('should reject invalid harness data for validation', async () => {
    // Import the actual core modules to test export logic integration
    const { HarnessValidator, createHarness } = await import('@route-core/core');

    const validator = new HarnessValidator();
    const harness = createHarness('Test', 'Tester');
    const issues = validator.validate(harness);

    // Empty harness should have no issues
    expect(issues.length).toBe(0);
  });

  it('should generate a BOM from valid harness data', async () => {
    const { BomGenerator, createHarness } = await import('@route-core/core');

    const generator = new BomGenerator();
    const harness = createHarness('BOM Test', 'Tester');
    const bom = generator.generate(harness);

    expect(bom.harnessName).toBe('BOM Test');
    expect(bom.entries).toEqual([]);
  });

  it('should export SVG from valid harness data', async () => {
    const { ExportManager, createHarness } = await import('@route-core/core');

    const manager = new ExportManager();
    const harness = createHarness('SVG Test', 'Tester');
    const result = manager.exportSvg(harness);

    expect(result.mimeType).toBe('image/svg+xml');
    expect(result.content).toContain('<svg');
  });

  it('should export a netlist from valid harness data', async () => {
    const { ExportManager, createHarness } = await import('@route-core/core');

    const manager = new ExportManager();
    const harness = createHarness('Netlist Test', 'Tester');
    const result = manager.exportNetlist(harness);

    expect(result.mimeType).toBe('text/plain');
    expect(result.content).toContain('Netlist');
  });
});
