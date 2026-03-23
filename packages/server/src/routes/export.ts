import { Router } from 'express';
import {
  HarnessBuilder,
  HarnessValidator,
  BomGenerator,
  ExportManager,
  createHarness,
  type Harness,
} from '@route-core/core';

const router = Router();
const validator = new HarnessValidator();
const bomGenerator = new BomGenerator();
const exportManager = new ExportManager();

// Validate a harness design
router.post('/validate', (req, res) => {
  const harness = req.body as Harness;
  if (!harness?.nodes) {
    return res.status(400).json({ error: 'Invalid harness data' });
  }
  const issues = validator.validate(harness);
  res.json({ issues, valid: issues.filter(i => i.severity === 'error').length === 0 });
});

// Generate BOM
router.post('/bom', (req, res) => {
  const harness = req.body as Harness;
  if (!harness?.nodes) {
    return res.status(400).json({ error: 'Invalid harness data' });
  }
  const bom = bomGenerator.generate(harness);
  res.json(bom);
});

// Export as SVG
router.post('/svg', (req, res) => {
  const { harness, options } = req.body;
  if (!harness?.nodes) {
    return res.status(400).json({ error: 'Invalid harness data' });
  }
  const result = exportManager.exportSvg(harness, options);
  res.setHeader('Content-Type', result.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.send(result.content);
});

// Export BOM as CSV
router.post('/bom/csv', (req, res) => {
  const harness = req.body as Harness;
  if (!harness?.nodes) {
    return res.status(400).json({ error: 'Invalid harness data' });
  }
  const result = exportManager.exportBomCsv(harness);
  res.setHeader('Content-Type', result.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.send(result.content);
});

// Export netlist
router.post('/netlist', (req, res) => {
  const harness = req.body as Harness;
  if (!harness?.nodes) {
    return res.status(400).json({ error: 'Invalid harness data' });
  }
  const result = exportManager.exportNetlist(harness);
  res.setHeader('Content-Type', result.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.send(result.content);
});

export default router;
