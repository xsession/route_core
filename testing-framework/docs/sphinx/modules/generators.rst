``generators`` — Generative Test Engine
=======================================

.. contents:: On this page
   :local:
   :depth: 2

Overview
--------

A composable, type-driven generative testing engine inspired by QuickCheck and
Hypothesis. Provides the ``Arbitrary`` trait for automatic value generation,
a library of combinators for building complex generators, and integrated
shrinking for minimal failure reproduction.

Arbitrary Trait
---------------

.. code-block:: rust

   pub trait Arbitrary: Sized {
       fn arbitrary(seed: u64, size: usize) -> Self;
       fn shrink(&self) -> Vec<Self>;
   }

Built-in implementations for:

- Primitives: ``bool``, ``u8``–``u64``, ``i8``–``i64``, ``f32``, ``f64``
- Strings: ``String`` (printable ASCII, UTF-8, Unicode)
- Collections: ``Vec<T>``, ``HashMap<K, V>``, ``BTreeSet<T>``
- Options: ``Option<T>``
- Tuples: up to 6 elements

Gen Combinator
--------------

.. code-block:: rust

   // Constant value
   let g = Gen::constant(42);

   // Range
   let g = Gen::range(1..=100);

   // One-of choice
   let g = Gen::one_of(vec![Gen::constant("a"), Gen::constant("b")]);

   // Map
   let g = Gen::range(0..10).map(|n| n * 2);

   // FlatMap (monadic bind)
   let g = Gen::range(1..5).flat_map(|len| Gen::vec(Gen::range(0..100), len));

   // Filter (with retry limit)
   let g = Gen::range(0..100).filter(|n| n % 2 == 0);

GenFn
-----

For generators that need mutable state or closures:

.. code-block:: rust

   let g = GenFn::new(|seed, size| {
       let mut rng = StdRng::seed_from_u64(seed);
       (0..size).map(|_| rng.gen_range(0..100)).collect::<Vec<_>>()
   });

GenRunner
---------

.. code-block:: rust

   let runner = GenRunner::new(GenRunnerConfig {
       seed: 42,
       num_cases: 1000,
       max_size: 100,
       max_shrinks: 200,
   });

   let result = runner.run(Gen::vec(Gen::range(0..1000), 50), |values| {
       // property to check
       assert!(values.iter().sum::<i64>() >= 0);
       Ok(())
   });

   match result {
       GenResult::Passed { cases } => println!("OK ({cases} cases)"),
       GenResult::Failed { seed, shrunk, message } => {
           eprintln!("FAIL seed={seed}: {message}");
           eprintln!("Shrunk to: {shrunk:?}");
       }
   }

Web-Specific Generators
------------------------

.. code-block:: rust

   // Generate valid CSS selectors
   let sel = WebStrings::css_selector(seed, depth);

   // Generate HTML-safe strings (no XSS)
   let s = WebStrings::html_safe(seed, max_len);

   // Generate URL paths
   let url = WebStrings::url_path(seed, segments);

Shrinking Strategy
------------------

Shrinking is **type-aware**:

- Integers shrink toward 0.
- Strings drop characters from the end, then simplify characters.
- Vectors remove elements, then shrink individual elements.
- Composite types shrink each field independently.

The shrinking loop runs until no smaller failing input is found, up to
``max_shrinks`` attempts.
