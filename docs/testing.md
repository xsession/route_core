# Testing Guide

> Route Core — Test Strategy & Practices

## Table of Contents

- [Overview](#overview)
- [Test Stack](#test-stack)
- [Running Tests](#running-tests)
- [Test Structure](#test-structure)
- [Writing Tests](#writing-tests)
- [Coverage Requirements](#coverage-requirements)
- [Test Categories](#test-categories)
- [Mocking Patterns](#mocking-patterns)
- [CI Integration](#ci-integration)

---

## Overview

Route Core uses a comprehensive testing strategy focused on:

1. **Unit tests** for core business logic (models, validation, routing, export)
2. **Integration tests** for API endpoints (server routes)
3. **Coverage enforcement** at 80% thresholds for the core package

---

## Test Stack

| Tool | Version | Purpose |
|------|---------|---------|
| [Vitest](https://vitest.dev/) | ^2.0.0 | Test runner (ESM-native, TypeScript-first) |
| v8 | built-in | Coverage provider |

### Why Vitest?

- Native ESM and TypeScript support — no transpilation step
- API compatible with Jest (describe/it/expect)
- Integrated with Vite for web package testing
- Fast watch mode with HMR

---

## Running Tests

```bash
# Run all tests across all packages
npm test

# Run core package tests only
npm run test:core

# Run server package tests only
npm run test:server

# Run with coverage report
npm run test:coverage

# Watch mode (from package directory)
cd packages/core
npx vitest --watch

# Run a specific test file
cd packages/core
npx vitest src/harness/__tests__/builder.test.ts

# Run tests matching a pattern
cd packages/core
npx vitest --grep "should validate"
```

---

## Test Structure

### Directory Layout

Tests live alongside source files in `__tests__/` directories:

```
packages/core/src/
├── models/
│   ├── harness.ts
│   ├── wire.ts
│   └── __tests__/
│       ├── harness.test.ts
│       └── wire.test.ts
├── harness/
│   ├── builder.ts
│   ├── validator.ts
│   ├── router.ts
│   └── __tests__/
│       ├── builder.test.ts
│       ├── validator.test.ts
│       └── router.test.ts
├── bom/
│   ├── generator.ts
│   └── __tests__/
│       └── generator.test.ts
├── cable/
│   ├── creator.ts
│   └── __tests__/
│       └── creator.test.ts
├── component/
│   ├── creator.ts
│   └── __tests__/
│       └── creator.test.ts
├── export/
│   ├── manager.ts
│   ├── svg.ts
│   └── __tests__/
│       ├── manager.test.ts
│       └── svg.test.ts
└── parts/
    ├── parts-db.ts
    ├── search.ts
    └── __tests__/
        ├── parts-db.test.ts
        └── search.test.ts
```

### Naming Conventions

| Convention | Example |
|-----------|---------|
| Test file | `{module}.test.ts` |
| Describe block | Class or function name |
| Test name | `should {expected behavior}` |

---

## Writing Tests

### Basic Pattern

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { HarnessBuilder } from '../builder.js';

describe('HarnessBuilder', () => {
  let builder: HarnessBuilder;

  beforeEach(() => {
    builder = new HarnessBuilder();
  });

  describe('createNew', () => {
    it('should create a harness with the given name', () => {
      const harness = builder.createNew('Test Harness');

      expect(harness.name).toBe('Test Harness');
      expect(harness.id).toBeTruthy();
      expect(harness.nodes).toEqual([]);
      expect(harness.connections).toEqual([]);
    });
  });

  describe('addNode', () => {
    it('should add a component with auto-generated label', () => {
      const harness = builder.createNew('Test');
      const node = builder.addNode(harness, {
        name: 'ECU Connector',
        category: 'connector',
        pins: [{ name: 'VCC', type: 'female' }],
      });

      expect(node.label).toBe('J1');
      expect(harness.nodes).toHaveLength(1);
    });
  });
});
```

### Testing Edge Cases

```typescript
describe('edge cases', () => {
  it('should handle empty harness', () => {
    const harness = builder.createNew('Empty');
    const issues = validator.validate(harness);
    expect(issues).toEqual([]);
  });

  it('should handle duplicate labels', () => {
    const harness = builder.createNew('Test');
    const n1 = builder.addNode(harness, { name: 'A', category: 'connector', pins: [] });
    const n2 = builder.addNode(harness, { name: 'B', category: 'connector', pins: [] });
    n2.label = n1.label; // Force duplicate

    const issues = validator.validate(harness);
    const duplicates = issues.filter(i => i.message.includes('Duplicate'));
    expect(duplicates.length).toBeGreaterThan(0);
  });
});
```

### Testing Async Operations

```typescript
describe('API endpoints', () => {
  it('should return health status', async () => {
    const response = await fetch('http://localhost:3001/api/health');
    const data = await response.json();
    expect(data.status).toBe('ok');
  });
});
```

---

## Coverage Requirements

### Thresholds

Enforced in `vitest.config.ts`:

```typescript
// packages/core/vitest.config.ts
coverage: {
  provider: 'v8',
  thresholds: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80,
  },
}
```

### Viewing Coverage

```bash
npm run test:coverage
```

This generates:
- **Terminal report**: Summary table in the console
- **HTML report**: Open `packages/core/coverage/index.html` in a browser

### Excluded from Coverage

- Test files (`**/*.test.ts`)
- Index re-export files (`**/index.ts`)
- Type declaration files (`**/*.d.ts`)

---

## Test Categories

### Unit Tests (Core)

Test individual functions and classes in isolation.

| Module | Test File | Key Tests |
|--------|-----------|-----------|
| Models | `models/__tests__/harness.test.ts` | `createHarness`, `generateId`, `createDefaultCanvas` |
| Models | `models/__tests__/wire.test.ts` | `AWG_SPECS` validation |
| Builder | `harness/__tests__/builder.test.ts` | CRUD operations, auto-labeling, revisions |
| Validator | `harness/__tests__/validator.test.ts` | All 5 validation rules |
| Router | `harness/__tests__/router.test.ts` | Manhattan routing, waypoints |
| BOM | `bom/__tests__/generator.test.ts` | Generation, CSV, text table |
| Cable | `cable/__tests__/creator.test.ts` | Factory methods, color sequences |
| Component | `component/__tests__/creator.test.ts` | Templates, custom creation, cloning |
| SVG Export | `export/__tests__/svg.test.ts` | SVG generation, options |
| Export Manager | `export/__tests__/manager.test.ts` | All export formats |
| Search | `parts/__tests__/search.test.ts` | Fuzzy scoring, component search |
| Parts DB | `parts/__tests__/parts-db.test.ts` | CRUD, serialization |

### Integration Tests (Server)

| Test File | Key Tests |
|-----------|-----------|
| `server/src/__tests__/routes.test.ts` | Health check, export endpoints |

### Future Test Categories

- **E2E tests**: Playwright tests for web UI interactions
- **Visual regression**: Screenshot comparison for SVG export
- **Performance tests**: Benchmark large harness operations (>1000 nodes)
- **Desktop tests**: Electrobun window lifecycle and embedded server

---

## Mocking Patterns

### Simple Mock

```typescript
import { vi } from 'vitest';

const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ status: 'ok' }),
});
```

### Module Mock

```typescript
vi.mock('../server.js', () => ({
  startServer: vi.fn().mockResolvedValue({ close: vi.fn() }),
}));
```

### Spy

```typescript
const spy = vi.spyOn(builder, 'addNode');
builder.addNode(harness, input);
expect(spy).toHaveBeenCalledWith(harness, input);
```

### Timer Mock

```typescript
vi.useFakeTimers();
// ... test time-dependent code
vi.useRealTimers();
```

---

## CI Integration

Tests run automatically in GitHub Actions on every push and PR:

```yaml
# .github/workflows/ci.yml
test-core:
  strategy:
    matrix:
      node-version: [18, 20, 22]
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - run: npm ci
    - run: npm run test:core
```

### CI Requirements

- All tests must pass on Node.js 18, 20, and 22
- Coverage thresholds must be met (80% for core)
- Type checking must pass

### Debugging CI Failures

1. Check the GitHub Actions log for the failing step
2. Reproduce locally: `npm run test:core`
3. Run with verbose output: `cd packages/core && npx vitest --reporter=verbose`
4. Check for platform-specific issues (path separators, line endings)
