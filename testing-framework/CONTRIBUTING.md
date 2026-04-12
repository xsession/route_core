# Contributing to Industrial Test Framework

Thank you for your interest in contributing!

## Getting Started

1. **Fork** the repository and clone your fork.
2. Install Rust 1.75+ via [rustup](https://rustup.rs/).
3. Run `cargo test --workspace` to verify your setup.

## Development Workflow

```bash
# Run all tests
cargo test --workspace

# Run only unit tests
cargo test -p industrial-test-core

# Run integration tests
cargo test -p industrial-test-core --test integration_tests

# Run framework self-tests
cargo test -p industrial-test-core --test framework_self_tests

# Run benchmarks
cargo bench -p industrial-test-core

# Check formatting
cargo fmt --check

# Run clippy
cargo clippy --workspace -- -D warnings
```

## Coding Standards

- **No `unsafe`** in the core crate.
- All public types and functions must have doc comments (`///`).
- All new modules must include a `#[cfg(test)] mod tests` section.
- Follow existing patterns for `Arbitrary` implementations (include `shrink()`).
- Run `cargo fmt` before committing.

## Adding a New Module

1. Create `crates/core/src/your_module.rs`.
2. Add `pub mod your_module;` to `crates/core/src/lib.rs`.
3. Re-export key types from `lib.rs`.
4. Add unit tests in the module.
5. Add integration tests in `crates/core/tests/integration_tests.rs`.
6. Add self-tests in `crates/core/tests/framework_self_tests.rs`.
7. Add CLI support in `crates/cli/src/main.rs` if applicable.
8. Document in both Sphinx (`docs/sphinx/modules/`) and Typst (`docs/typst/main.typ`).

## Pull Request Process

1. Create a feature branch from `main`.
2. Keep commits focused and atomic.
3. Ensure all tests pass: `cargo test --workspace`.
4. Ensure no warnings: `cargo clippy --workspace -- -D warnings`.
5. Update documentation if you changed public API.
6. Open a PR with a clear description of changes.

## Reporting Issues

- Use the GitHub issue tracker.
- For **security vulnerabilities**, email the maintainers directly (see `SECURITY.md`).
- Include: Rust version, OS, reproduction steps, expected vs. actual behavior.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
