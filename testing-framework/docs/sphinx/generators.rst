Generative Testing Guide
========================

.. contents:: On this page
   :local:
   :depth: 2

What Is Generative Testing?
---------------------------

Instead of writing individual test inputs by hand, the framework **generates**
random inputs that satisfy structural constraints, checks a property against
each one, and if the property fails, **shrinks** the input to the smallest
reproduction case.

This catches edge cases that hand-written tests miss.

The ``Gen`` Combinator DSL
--------------------------

Primitive Generators
^^^^^^^^^^^^^^^^^^^^

.. code-block:: rust

   Gen::constant(42)          // always 42
   Gen::range(0..100)         // uniform u64 in [0, 100)
   Gen::bool()                // true / false
   Gen::one_of(vec![a, b, c]) // equiprobable choice

Transformations
^^^^^^^^^^^^^^^

.. code-block:: rust

   Gen::range(0..10).map(|n| n * 2)           // even numbers 0–18
   Gen::range(0..10).filter(|n| n % 3 == 0)   // multiples of 3
   Gen::range(1..5).flat_map(|len|             // variable-length vectors
       Gen::vec(Gen::range(0..100), len)
   )

Composite Generators
^^^^^^^^^^^^^^^^^^^^

.. code-block:: rust

   // Struct generator
   let gen_point = Gen::range(-100..100)
       .flat_map(|x| Gen::range(-100..100).map(move |y| Point { x, y }));

   // Enum generator
   let gen_color = Gen::one_of(vec![
       Gen::constant(Color::Red),
       Gen::constant(Color::Green),
       Gen::constant(Color::Blue),
   ]);

Implementing ``Arbitrary``
--------------------------

For your own types:

.. code-block:: rust

   impl Arbitrary for MyConfig {
       fn arbitrary(seed: u64, size: usize) -> Self {
           let s = size.min(20);
           MyConfig {
               name: String::arbitrary(seed, s),
               retries: u8::arbitrary(seed.wrapping_add(1), s) % 10,
               enabled: bool::arbitrary(seed.wrapping_add(2), s),
           }
       }

       fn shrink(&self) -> Vec<Self> {
           let mut variants = vec![];
           for name in self.name.shrink() {
               variants.push(MyConfig { name, ..self.clone() });
           }
           if self.retries > 0 {
               variants.push(MyConfig { retries: self.retries - 1, ..self.clone() });
           }
           variants
       }
   }

Running Generative Tests
-------------------------

.. code-block:: rust

   let config = GenRunnerConfig {
       seed: 42,
       num_cases: 5000,
       max_size: 200,
       max_shrinks: 500,
   };

   let runner = GenRunner::new(config);
   let result = runner.run(gen_point, |pt| {
       assert!(pt.x.abs() + pt.y.abs() <= 200, "Manhattan overflow");
       Ok(())
   });

Determinism & Reproducibility
------------------------------

Every generated value is a pure function of ``(seed, size)``. To reproduce a
failure:

.. code-block:: bash

   industrial-test property --seed 12345 --cases 1

Shrinking in Depth
------------------

The shrinking loop:

1. Take the failing input.
2. Generate all shrink candidates via ``shrink()``.
3. Re-check the property on each candidate.
4. If a candidate still fails, recurse from step 2 with that candidate.
5. Stop when no smaller failing candidate is found, or ``max_shrinks`` reached.

Result: the **minimal failing input**, which is drastically easier to debug
than the original large random input.

Best Practices
--------------

1. **Start with a fixed seed** during development, then use random seeds in CI.
2. **Keep properties simple** — one assertion per generative test.
3. **Implement ``shrink``** for custom types to get useful minimal failures.
4. **Use ``filter`` sparingly** — too-strict filters waste generated cases.
5. **Increase ``num_cases``** in CI (5,000–10,000) vs. local dev (100–500).
