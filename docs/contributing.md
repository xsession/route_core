# Contributing Guide

> Route Core — How to contribute

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Testing Requirements](#testing-requirements)
- [Code Review Checklist](#code-review-checklist)
- [Release Process](#release-process)

---

## Code of Conduct

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/) code of conduct. Please be respectful and constructive in all interactions.

---

## Getting Started

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | ≥ 18.0.0 | Runtime |
| npm | ≥ 9.0.0 | Package manager |
| Git | latest | Version control |
| Bun | latest | Desktop package (optional) |

### Setup

```bash
# Fork and clone
git clone https://github.com/<your-username>/route_core.git
cd route_core

# Install dependencies
npm install

# Verify setup
npm test
npm run typecheck
```

### Project Structure

```
route_core/
├── packages/
│   ├── core/       # Domain models, business logic (no dependencies)
│   ├── server/     # REST API (Express + SQLite)
│   ├── web/        # Frontend (React + Vite)
│   └── desktop/    # Desktop app (Electrobun)
├── data/seed/      # Seed data for parts library
├── docs/           # Documentation
└── .github/        # CI/CD workflows
```

---

## Development Workflow

### Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Stable, release-ready code |
| `feature/*` | New features |
| `fix/*` | Bug fixes |
| `docs/*` | Documentation changes |
| `refactor/*` | Code refactoring |

### Workflow

1. Create a branch from `main`:
   ```bash
   git checkout -b feature/shielded-cable-support
   ```

2. Make changes, write tests, verify:
   ```bash
   npm run test:core
   npm run typecheck
   ```

3. Commit using [conventional commits](#commit-conventions):
   ```bash
   git commit -m "feat(cable): add shielded cable support"
   ```

4. Push and open a pull request:
   ```bash
   git push origin feature/shielded-cable-support
   ```

5. Address review feedback, then merge via GitHub.

---

## Coding Standards

### TypeScript

- **Strict mode** enabled — no `any` types unless explicitly justified
- **ES2022** target with ESM modules
- Prefer `interface` over `type` for object shapes
- Prefer `const` over `let`; never use `var`
- Use explicit return types on exported functions
- Use `readonly` for immutable properties

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files | kebab-case | `harness-builder.ts` |
| Classes | PascalCase | `HarnessBuilder` |
| Interfaces | PascalCase | `ValidationIssue` |
| Functions | camelCase | `generateId()` |
| Constants | UPPER_SNAKE_CASE | `AWG_SPECS` |
| Type parameters | Single uppercase | `T`, `K` |
| Enum values | PascalCase | `ComponentCategory.Connector` |

### File Organization

```typescript
// 1. Imports (external → internal → relative)
import express from 'express';
import { HarnessBuilder } from '@route-core/core';
import { validate } from './utils.js';

// 2. Constants
const MAX_CONNECTIONS = 1000;

// 3. Types/Interfaces
interface BuilderOptions { ... }

// 4. Class or function implementation
export class HarnessBuilder { ... }

// 5. Utility/helper functions (private)
function normalizeLabel(label: string): string { ... }
```

### React Components (web package)

- Functional components with hooks
- Props interfaces named `{Component}Props`
- State management via Zustand store
- CSS classes via CSS modules or utility classes
- No inline styles except for dynamic values

---

## Commit Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Purpose |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, missing semicolons (no logic change) |
| `refactor` | Code restructuring (no feature/fix) |
| `test` | Adding or updating tests |
| `chore` | Build process, CI, dependency updates |
| `perf` | Performance improvement |

### Scopes

| Scope | Package |
|-------|---------|
| `core` | `packages/core` |
| `server` | `packages/server` |
| `web` | `packages/web` |
| `desktop` | `packages/desktop` |
| `ci` | `.github/workflows` |
| `docs` | `docs/` |

### Examples

```
feat(core): add twisted pair cable support
fix(server): handle empty harness name on create
docs(api): update export endpoint documentation
test(core): add validator edge case tests
chore(ci): upgrade Node.js matrix to include v22
refactor(web): extract canvas zoom logic to hook
```

---

## Pull Request Process

### Before Submitting

- [ ] All tests pass (`npm test`)
- [ ] Type checking passes (`npm run typecheck`)
- [ ] No lint errors (`npm run lint`)
- [ ] New code has test coverage ≥ 80%
- [ ] Documentation updated if API changed
- [ ] Commit messages follow conventional commits

### PR Template

```markdown
## Description
Brief description of the change.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
How was this tested?

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
```

### Review SLA

- **Triage**: within 1 business day
- **First review**: within 3 business days
- **Merge**: within 5 business days after approval

---

## Testing Requirements

### Coverage Thresholds

| Package | Branches | Functions | Lines | Statements |
|---------|----------|-----------|-------|-----------|
| core | 80% | 80% | 80% | 80% |
| server | 70% | 70% | 70% | 70% |

### What to Test

- **Core**: Unit test all public methods. Test edge cases (empty inputs, max values, invalid data)
- **Server**: Integration test API endpoints with mock database
- **Web**: Component tests for interactive behavior (connect, drag, create)

### Running Tests

```bash
# All tests
npm test

# Specific package
npm run test:core
npm run test:server

# With coverage
npm run test:coverage

# Watch mode
cd packages/core && npx vitest --watch
```

See [Testing Guide](./testing.md) for comprehensive testing documentation.

---

## Code Review Checklist

### Reviewer Responsibilities

- [ ] Code is readable and well-structured
- [ ] No unused imports or dead code
- [ ] Error handling is appropriate
- [ ] Types are correct (no unnecessary `any`)
- [ ] Tests cover the change adequately
- [ ] No security vulnerabilities introduced
- [ ] Performance impact considered
- [ ] Breaking changes documented
- [ ] Commit history is clean

### Common Feedback

| Issue | Resolution |
|-------|-----------|
| Missing error handling | Add try/catch or validation |
| Implicit `any` | Add explicit type annotation |
| Large function | Extract helper functions |
| Missing test | Add unit test for the new code path |
| Magic number | Extract to named constant |

---

## Release Process

### Versioning

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0): Breaking API changes
- **MINOR** (0.1.0): New features, backward compatible
- **PATCH** (0.0.1): Bug fixes, backward compatible

### Creating a Release

1. Update version in relevant `package.json` files
2. Update `docs/CHANGELOG.md`
3. Commit: `chore: release v0.2.0`
4. Tag: `git tag v0.2.0`
5. Push: `git push origin main --tags`

The CI/CD pipeline (`.github/workflows/release.yml`) automatically:
- Builds all packages
- Runs full test suite
- Creates GitHub Release with notes
- Builds desktop binaries for macOS, Windows, and Linux
- Uploads binaries as release assets
