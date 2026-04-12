Web GUI Testing Guide
=====================

.. contents:: On this page
   :local:
   :depth: 2

Introduction
------------

The framework provides a complete toolkit for **generative testing** of web
applications. Instead of hand-writing fixtures, it generates random component
trees, user interactions, and navigation flows — then verifies invariants
automatically.

Quick Start
-----------

CLI
^^^

.. code-block:: bash

   # Generate and validate 50 component trees
   industrial-test web --trees 50 --depth 4 --seed 42

   # Specify form complexity
   industrial-test web --trees 20 --form-fields 8 --max-children 6

Rust API
^^^^^^^^

.. code-block:: rust

   use industrial_test_core::web::*;

   let tree = ComponentTree::generate(42, GenerateConfig {
       max_depth: 5,
       max_children: 4,
       viewport: (1920, 1080),
   });

   let report = WebValidator::new(&tree).validate_all();
   assert!(report.is_valid());

Testing Strategies
------------------

Component Structure
^^^^^^^^^^^^^^^^^^^

Generate random component hierarchies and verify:

- Proper nesting (no orphaned elements)
- Bounding-box containment (children inside parents)
- No overlapping siblings

Accessibility (WCAG)
^^^^^^^^^^^^^^^^^^^^^

Every generated tree is checked for:

- ARIA roles on interactive elements (``button``, ``input``, ``link``)
- ``aria-label`` or visible text on controls
- Focus order consistency (tab index sequence)
- Landmark regions (``nav``, ``main``, ``aside``)

Forms & Validation
^^^^^^^^^^^^^^^^^^

Random form fields with constraints are generated:

- Text inputs with min/max length
- Email, URL, and pattern-constrained fields
- Required vs. optional fields
- Submit with missing required fields → error state

The framework checks that invalid inputs produce validation errors and valid
inputs are accepted.

Responsive Layout
^^^^^^^^^^^^^^^^^

Trees are generated at multiple viewport sizes:

.. code-block:: rust

   let viewports = [(320, 568), (768, 1024), (1440, 900), (1920, 1080)];

For each viewport the validator checks:

- No content overflow beyond viewport bounds
- Touch targets ≥ 44×44 px on mobile viewports
- No overlapping interactive elements

Routing & Navigation
^^^^^^^^^^^^^^^^^^^^

Random route tables with ``/path/:param`` patterns are generated. Each route
renders a component tree, and the validator ensures:

- Every route produces a valid tree
- Navigation between routes preserves global state
- 404 handling for unmatched paths

State Management
^^^^^^^^^^^^^^^^

An ``AppState`` reducer is exercised with random action sequences:

- State transitions are deterministic
- Undo/redo symmetry holds
- State serialization round-trips

Integrating with CI
-------------------

.. code-block:: yaml

   # GitHub Actions example
   - name: Web GUI tests
     run: |
       industrial-test web --trees 100 --depth 5 --seed ${{ github.run_id }}
       industrial-test report test-output/web-results.json --format junit

Seed any test with the CI run ID for deterministic, reproducible failures.
