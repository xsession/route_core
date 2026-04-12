``web`` — Web GUI Testing
=========================

.. contents:: On this page
   :local:
   :depth: 2

Overview
--------

Generative testing for web-based GUI applications. Generates random component
trees, validates accessibility (WCAG), simulates user interactions, and tests
responsive layout breakpoints.

Component Tree
--------------

.. code-block:: rust

   pub struct Component {
       pub id: String,
       pub tag: String,           // "div", "button", "input", ...
       pub role: Option<String>,  // ARIA role
       pub text: Option<String>,
       pub attrs: HashMap<String, String>,
       pub bbox: BoundingBox,
       pub children: Vec<Component>,
   }

   pub struct ComponentTree {
       pub root: Component,
       pub viewport: (u32, u32),  // width, height
   }

Random Tree Generation
----------------------

.. code-block:: rust

   let tree = ComponentTree::generate(seed, GenerateConfig {
       max_depth: 5,
       max_children: 4,
       viewport: (1920, 1080),
   });

WebValidator
------------

.. code-block:: rust

   let validator = WebValidator::new(&tree);

   // Accessibility checks (ARIA roles, labels, contrast-ready)
   let a11y = validator.check_accessibility();

   // Overlap detection among sibling components
   let overlaps = validator.check_overlaps();

   // All interactive elements reachable via tab
   let focus = validator.check_focus_order();

   // Aggregate
   let report = validator.validate_all();
   assert!(report.is_valid(), "{:?}", report.violations);

Event Simulation
----------------

.. code-block:: rust

   let events = EventSimulator::generate_sequence(seed, &tree, 20);
   // Produces: Click, Focus, Blur, Input, KeyPress, Scroll, ...

   let mut state = AppState::default();
   for event in &events {
       state.dispatch(event);
   }
   // Validate state consistency after random interaction

Router Testing
--------------

.. code-block:: rust

   let routes = Router::generate(seed, 10);   // 10 random routes
   for route in &routes {
       let tree = route.render(seed);
       let report = WebValidator::new(&tree).validate_all();
       assert!(report.is_valid(), "Route {} invalid: {:?}", route.path, report);
   }

Responsive Breakpoints
-----------------------

.. code-block:: rust

   let breakpoints = vec![(320, 568), (768, 1024), (1920, 1080)];
   for (w, h) in breakpoints {
       let tree = ComponentTree::generate(seed, GenerateConfig {
           viewport: (w, h),
           ..default
       });
       let report = WebValidator::new(&tree).validate_all();
       assert!(report.is_valid(), "Viewport {}x{}: {:?}", w, h, report);
   }

State Management
----------------

.. code-block:: rust

   let mut state = AppState::new(json!({ "count": 0, "items": [] }));
   state.dispatch(&Action::Increment);
   state.dispatch(&Action::AddItem("hello".into()));
   assert_eq!(state.get("count"), json!(1));
   assert_eq!(state.get("items"), json!(["hello"]));

   // Time-travel
   state.undo();
   assert_eq!(state.get("count"), json!(0));
