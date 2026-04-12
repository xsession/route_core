//! Web GUI testing primitives — component trees, state management, events,
//! accessibility, form validation, and responsive layout.
//!
//! Provides a domain model for testing any web-based GUI application:
//! React, Vue, Angular, Svelte, or vanilla JS. The component tree is
//! framework-agnostic and mirrors the essential structure of any UI.

use crate::generators::{Arbitrary, Gen, WebStrings};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

// ── Component Identity ──────────────────────────────────────────────────────

/// Unique component identifier.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ComponentId(pub Uuid);

impl ComponentId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    pub fn from_seed(seed: u64) -> Self {
        let bytes = seed.to_le_bytes();
        let mut uuid_bytes = [0u8; 16];
        uuid_bytes[..8].copy_from_slice(&bytes);
        uuid_bytes[8..16].copy_from_slice(&bytes);
        Self(Uuid::from_bytes(uuid_bytes))
    }
}

impl Default for ComponentId {
    fn default() -> Self {
        Self::new()
    }
}

// ── Component Kind ──────────────────────────────────────────────────────────

/// Common web UI component types.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ComponentKind {
    // Layout
    Container,
    Header,
    Footer,
    Sidebar,
    Main,
    Section,
    Article,
    // Interactive
    Button,
    Link,
    // Form elements
    Input,
    TextArea,
    Select,
    Checkbox,
    Radio,
    Form,
    Label,
    // Data display
    Table,
    List,
    ListItem,
    Card,
    // Overlay
    Modal,
    Dialog,
    Tooltip,
    Dropdown,
    // Navigation
    Nav,
    Breadcrumb,
    Tab,
    TabPanel,
    // Media
    Image,
    Icon,
    // Text
    Text,
    Heading,
    // Custom
    Custom(String),
}

impl Arbitrary for ComponentKind {
    fn arbitrary(gen: &mut Gen) -> Self {
        let choice = gen.rng.gen_range(0..20);
        match choice {
            0 => ComponentKind::Container,
            1 => ComponentKind::Button,
            2 => ComponentKind::Input,
            3 => ComponentKind::TextArea,
            4 => ComponentKind::Select,
            5 => ComponentKind::Checkbox,
            6 => ComponentKind::Form,
            7 => ComponentKind::List,
            8 => ComponentKind::ListItem,
            9 => ComponentKind::Card,
            10 => ComponentKind::Modal,
            11 => ComponentKind::Nav,
            12 => ComponentKind::Link,
            13 => ComponentKind::Table,
            14 => ComponentKind::Header,
            15 => ComponentKind::Footer,
            16 => ComponentKind::Text,
            17 => ComponentKind::Heading,
            18 => ComponentKind::Label,
            _ => ComponentKind::Section,
        }
    }
}

use rand::prelude::*;

// ── Accessibility ───────────────────────────────────────────────────────────

/// ARIA accessibility attributes for a component.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Accessibility {
    pub role: Option<String>,
    pub label: Option<String>,
    pub described_by: Option<String>,
    pub tab_index: Option<i32>,
    pub focusable: bool,
    pub aria_hidden: bool,
    pub aria_expanded: Option<bool>,
    pub aria_required: Option<bool>,
    pub aria_invalid: Option<bool>,
    pub aria_live: Option<String>,
}

impl Default for Accessibility {
    fn default() -> Self {
        Self {
            role: None,
            label: None,
            described_by: None,
            tab_index: None,
            focusable: false,
            aria_hidden: false,
            aria_expanded: None,
            aria_required: None,
            aria_invalid: None,
            aria_live: None,
        }
    }
}

impl Accessibility {
    /// Create default accessibility for a component kind.
    pub fn for_kind(kind: &ComponentKind) -> Self {
        let mut a11y = Self::default();
        match kind {
            ComponentKind::Button => {
                a11y.role = Some("button".into());
                a11y.focusable = true;
                a11y.tab_index = Some(0);
            }
            ComponentKind::Input | ComponentKind::TextArea | ComponentKind::Select => {
                a11y.focusable = true;
                a11y.tab_index = Some(0);
            }
            ComponentKind::Checkbox | ComponentKind::Radio => {
                a11y.focusable = true;
                a11y.tab_index = Some(0);
            }
            ComponentKind::Link => {
                a11y.role = Some("link".into());
                a11y.focusable = true;
                a11y.tab_index = Some(0);
            }
            ComponentKind::Nav => {
                a11y.role = Some("navigation".into());
            }
            ComponentKind::Modal | ComponentKind::Dialog => {
                a11y.role = Some("dialog".into());
                a11y.focusable = true;
            }
            ComponentKind::Header => {
                a11y.role = Some("banner".into());
            }
            ComponentKind::Footer => {
                a11y.role = Some("contentinfo".into());
            }
            ComponentKind::Main => {
                a11y.role = Some("main".into());
            }
            ComponentKind::Form => {
                a11y.role = Some("form".into());
            }
            ComponentKind::Table => {
                a11y.role = Some("table".into());
            }
            ComponentKind::List => {
                a11y.role = Some("list".into());
            }
            ComponentKind::ListItem => {
                a11y.role = Some("listitem".into());
            }
            _ => {}
        }
        a11y
    }
}

// ── Validation Rules ─────────────────────────────────────────────────────────

/// Input validation rule for form fields.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ValidationRule {
    Required,
    MinLength(usize),
    MaxLength(usize),
    Pattern(String),
    MinValue(f64),
    MaxValue(f64),
    Email,
    Url,
    Custom(String),
}

impl ValidationRule {
    /// Validate a string value against this rule.
    pub fn validate(&self, value: &str) -> Result<(), String> {
        match self {
            ValidationRule::Required => {
                if value.trim().is_empty() {
                    Err("Field is required".into())
                } else {
                    Ok(())
                }
            }
            ValidationRule::MinLength(min) => {
                if value.len() < *min {
                    Err(format!("Minimum length is {}", min))
                } else {
                    Ok(())
                }
            }
            ValidationRule::MaxLength(max) => {
                if value.len() > *max {
                    Err(format!("Maximum length is {}", max))
                } else {
                    Ok(())
                }
            }
            ValidationRule::Pattern(pattern) => {
                // Simple pattern matching (not full regex for security)
                if value.contains(pattern.as_str()) {
                    Ok(())
                } else {
                    Err(format!("Does not match pattern: {}", pattern))
                }
            }
            ValidationRule::MinValue(min) => {
                match value.parse::<f64>() {
                    Ok(v) if v >= *min => Ok(()),
                    Ok(v) => Err(format!("Value {} is less than minimum {}", v, min)),
                    Err(_) => Err("Not a valid number".into()),
                }
            }
            ValidationRule::MaxValue(max) => {
                match value.parse::<f64>() {
                    Ok(v) if v <= *max => Ok(()),
                    Ok(v) => Err(format!("Value {} exceeds maximum {}", v, max)),
                    Err(_) => Err("Not a valid number".into()),
                }
            }
            ValidationRule::Email => {
                if value.contains('@') && value.contains('.') {
                    Ok(())
                } else {
                    Err("Invalid email format".into())
                }
            }
            ValidationRule::Url => {
                if value.starts_with("http://") || value.starts_with("https://") || value.starts_with('/') {
                    Ok(())
                } else {
                    Err("Invalid URL format".into())
                }
            }
            ValidationRule::Custom(msg) => {
                // Custom rules always fail (placeholder for user-provided logic)
                Err(msg.clone())
            }
        }
    }
}

impl Arbitrary for ValidationRule {
    fn arbitrary(gen: &mut Gen) -> Self {
        let choice = gen.rng.gen_range(0..6);
        match choice {
            0 => ValidationRule::Required,
            1 => ValidationRule::MinLength(gen.rng.gen_range(1..20)),
            2 => ValidationRule::MaxLength(gen.rng.gen_range(10..500)),
            3 => ValidationRule::MinValue(gen.rng.gen_range(-100.0..0.0)),
            4 => ValidationRule::MaxValue(gen.rng.gen_range(0.0..1000.0)),
            _ => ValidationRule::Email,
        }
    }
}

// ── Component ────────────────────────────────────────────────────────────────

/// A single UI component — the basic building block of a web GUI.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Component {
    pub id: ComponentId,
    pub kind: ComponentKind,
    pub text: Option<String>,
    pub value: Option<String>,
    pub classes: Vec<String>,
    pub attributes: HashMap<String, String>,
    pub properties: HashMap<String, serde_json::Value>,
    pub children: Vec<Component>,
    pub accessibility: Accessibility,
    pub validation_rules: Vec<ValidationRule>,
    pub visible: bool,
    pub enabled: bool,
    pub position: (f64, f64),
    pub size: (f64, f64),
}

impl Component {
    pub fn new(kind: ComponentKind) -> Self {
        let a11y = Accessibility::for_kind(&kind);
        Self {
            id: ComponentId::new(),
            kind,
            text: None,
            value: None,
            classes: Vec::new(),
            attributes: HashMap::new(),
            properties: HashMap::new(),
            children: Vec::new(),
            accessibility: a11y,
            validation_rules: Vec::new(),
            visible: true,
            enabled: true,
            position: (0.0, 0.0),
            size: (100.0, 40.0),
        }
    }

    pub fn with_id(mut self, id: ComponentId) -> Self {
        self.id = id;
        self
    }

    pub fn with_text(mut self, text: impl Into<String>) -> Self {
        self.text = Some(text.into());
        self
    }

    pub fn with_value(mut self, value: impl Into<String>) -> Self {
        self.value = Some(value.into());
        self
    }

    pub fn with_class(mut self, class: impl Into<String>) -> Self {
        self.classes.push(class.into());
        self
    }

    pub fn with_attribute(mut self, key: impl Into<String>, val: impl Into<String>) -> Self {
        self.attributes.insert(key.into(), val.into());
        self
    }

    pub fn with_child(mut self, child: Component) -> Self {
        self.children.push(child);
        self
    }

    pub fn with_position(mut self, x: f64, y: f64) -> Self {
        self.position = (x, y);
        self
    }

    pub fn with_size(mut self, w: f64, h: f64) -> Self {
        self.size = (w, h);
        self
    }

    pub fn with_validation(mut self, rule: ValidationRule) -> Self {
        self.validation_rules.push(rule);
        self
    }

    pub fn with_label(mut self, label: impl Into<String>) -> Self {
        self.accessibility.label = Some(label.into());
        self
    }

    pub fn disabled(mut self) -> Self {
        self.enabled = false;
        self
    }

    pub fn hidden(mut self) -> Self {
        self.visible = false;
        self
    }

    /// Total count of components in this subtree (including self).
    pub fn total_count(&self) -> usize {
        1 + self.children.iter().map(|c| c.total_count()).sum::<usize>()
    }

    /// Collect all components in depth-first order.
    pub fn flatten(&self) -> Vec<&Component> {
        let mut result = vec![self];
        for child in &self.children {
            result.extend(child.flatten());
        }
        result
    }

    /// Find a component by ID in this subtree.
    pub fn find(&self, id: ComponentId) -> Option<&Component> {
        if self.id == id {
            return Some(self);
        }
        for child in &self.children {
            if let Some(found) = child.find(id) {
                return Some(found);
            }
        }
        None
    }

    /// Validate all form fields in this subtree.
    pub fn validate_form(&self) -> Vec<(ComponentId, Vec<String>)> {
        let mut errors = Vec::new();
        let value = self.value.as_deref().unwrap_or("");
        let field_errors: Vec<String> = self
            .validation_rules
            .iter()
            .filter_map(|rule| rule.validate(value).err())
            .collect();
        if !field_errors.is_empty() {
            errors.push((self.id, field_errors));
        }
        for child in &self.children {
            errors.extend(child.validate_form());
        }
        errors
    }
}

// ── Component Tree ──────────────────────────────────────────────────────────

/// A complete component tree representing a page or view.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ComponentTree {
    pub root: Component,
    pub title: String,
    pub route: String,
    pub meta: HashMap<String, String>,
}

impl ComponentTree {
    pub fn new(title: impl Into<String>, route: impl Into<String>, root: Component) -> Self {
        Self {
            root,
            title: title.into(),
            route: route.into(),
            meta: HashMap::new(),
        }
    }

    /// Count all components.
    pub fn total_count(&self) -> usize {
        self.root.total_count()
    }

    /// Find a component by ID.
    pub fn find(&self, id: ComponentId) -> Option<&Component> {
        self.root.find(id)
    }

    /// Flatten the entire tree into a list.
    pub fn flatten(&self) -> Vec<&Component> {
        self.root.flatten()
    }

    /// Validate all form fields in the tree.
    pub fn validate_forms(&self) -> Vec<(ComponentId, Vec<String>)> {
        self.root.validate_form()
    }
}

// ── DOM Events ──────────────────────────────────────────────────────────────

/// Simulated DOM event types for testing event handlers.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum DomEvent {
    Click { target: ComponentId },
    DoubleClick { target: ComponentId },
    Input { target: ComponentId, value: String },
    Change { target: ComponentId, value: String },
    Focus { target: ComponentId },
    Blur { target: ComponentId },
    Submit { form_id: ComponentId },
    KeyDown { target: ComponentId, key: String, modifiers: KeyModifiers },
    KeyUp { target: ComponentId, key: String },
    MouseEnter { target: ComponentId },
    MouseLeave { target: ComponentId },
    Scroll { target: ComponentId, x: f64, y: f64 },
    Resize { width: f64, height: f64 },
    DragStart { target: ComponentId },
    Drop { target: ComponentId, data: String },
    Navigate { to: String },
}

/// Keyboard modifiers for key events.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct KeyModifiers {
    pub ctrl: bool,
    pub shift: bool,
    pub alt: bool,
    pub meta: bool,
}

impl Default for KeyModifiers {
    fn default() -> Self {
        Self {
            ctrl: false,
            shift: false,
            alt: false,
            meta: false,
        }
    }
}

impl Arbitrary for DomEvent {
    fn arbitrary(gen: &mut Gen) -> Self {
        let target = ComponentId::from_seed(gen.rng.gen_range(0..100));
        let choice = gen.rng.gen_range(0..10);
        match choice {
            0 => DomEvent::Click { target },
            1 => DomEvent::Input {
                target,
                value: String::arbitrary(gen),
            },
            2 => DomEvent::Change {
                target,
                value: String::arbitrary(gen),
            },
            3 => DomEvent::Focus { target },
            4 => DomEvent::Blur { target },
            5 => DomEvent::Submit { form_id: target },
            6 => DomEvent::KeyDown {
                target,
                key: gen.choose_clone(&["Enter", "Escape", "Tab", "ArrowUp", "ArrowDown", "a", "1"]).to_string(),
                modifiers: KeyModifiers::default(),
            },
            7 => DomEvent::MouseEnter { target },
            8 => DomEvent::Navigate { to: WebStrings::url_path(gen) },
            _ => DomEvent::Resize {
                width: gen.rng.gen_range(320.0..1920.0),
                height: gen.rng.gen_range(480.0..1080.0),
            },
        }
    }
}

// ── State Management ────────────────────────────────────────────────────────

/// An action dispatched to a state reducer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateAction {
    pub kind: String,
    pub payload: serde_json::Value,
}

impl StateAction {
    pub fn new(kind: impl Into<String>, payload: serde_json::Value) -> Self {
        Self {
            kind: kind.into(),
            payload,
        }
    }
}

/// Application state — a generic key-value store.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AppState {
    pub data: HashMap<String, serde_json::Value>,
    pub version: u64,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            data: HashMap::new(),
            version: 0,
        }
    }

    pub fn get(&self, key: &str) -> Option<&serde_json::Value> {
        self.data.get(key)
    }

    pub fn set(&mut self, key: impl Into<String>, value: serde_json::Value) {
        self.data.insert(key.into(), value);
        self.version += 1;
    }

    pub fn remove(&mut self, key: &str) -> Option<serde_json::Value> {
        let v = self.data.remove(key);
        if v.is_some() {
            self.version += 1;
        }
        v
    }

    /// Apply a StateAction using a reducer function.
    pub fn apply<F>(&mut self, action: &StateAction, reducer: F)
    where
        F: FnOnce(&mut AppState, &StateAction),
    {
        reducer(self, action);
        self.version += 1;
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

/// State transition log for testing state management.
#[derive(Debug, Clone)]
pub struct StateLog {
    pub transitions: Vec<StateTransition>,
}

/// A recorded state transition.
#[derive(Debug, Clone)]
pub struct StateTransition {
    pub action: StateAction,
    pub state_before: AppState,
    pub state_after: AppState,
}

impl StateLog {
    pub fn new() -> Self {
        Self {
            transitions: Vec::new(),
        }
    }

    pub fn record(&mut self, action: StateAction, before: AppState, after: AppState) {
        self.transitions.push(StateTransition {
            action,
            state_before: before,
            state_after: after,
        });
    }

    pub fn len(&self) -> usize {
        self.transitions.len()
    }

    pub fn is_empty(&self) -> bool {
        self.transitions.is_empty()
    }
}

impl Default for StateLog {
    fn default() -> Self {
        Self::new()
    }
}

// ── Viewport / Responsive ───────────────────────────────────────────────────

/// Standard responsive breakpoints.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Breakpoint {
    Mobile,     // < 640px
    Tablet,     // 640–1024px
    Desktop,    // 1024–1440px
    Wide,       // > 1440px
}

impl Breakpoint {
    pub fn from_width(width: f64) -> Self {
        if width < 640.0 {
            Breakpoint::Mobile
        } else if width < 1024.0 {
            Breakpoint::Tablet
        } else if width < 1440.0 {
            Breakpoint::Desktop
        } else {
            Breakpoint::Wide
        }
    }

    pub fn typical_width(&self) -> f64 {
        match self {
            Breakpoint::Mobile => 375.0,
            Breakpoint::Tablet => 768.0,
            Breakpoint::Desktop => 1280.0,
            Breakpoint::Wide => 1920.0,
        }
    }

    pub fn typical_height(&self) -> f64 {
        match self {
            Breakpoint::Mobile => 812.0,
            Breakpoint::Tablet => 1024.0,
            Breakpoint::Desktop => 720.0,
            Breakpoint::Wide => 1080.0,
        }
    }

    pub fn all() -> Vec<Self> {
        vec![Breakpoint::Mobile, Breakpoint::Tablet, Breakpoint::Desktop, Breakpoint::Wide]
    }
}

impl Arbitrary for Breakpoint {
    fn arbitrary(gen: &mut Gen) -> Self {
        *gen.choose(&Breakpoint::all())
    }
}

/// A simulated viewport for responsive testing.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Viewport {
    pub width: f64,
    pub height: f64,
    pub device_pixel_ratio: f64,
}

impl Viewport {
    pub fn new(width: f64, height: f64) -> Self {
        Self {
            width,
            height,
            device_pixel_ratio: 1.0,
        }
    }

    pub fn from_breakpoint(bp: Breakpoint) -> Self {
        Self {
            width: bp.typical_width(),
            height: bp.typical_height(),
            device_pixel_ratio: if bp == Breakpoint::Mobile { 2.0 } else { 1.0 },
        }
    }

    pub fn breakpoint(&self) -> Breakpoint {
        Breakpoint::from_width(self.width)
    }
}

// ── Route ───────────────────────────────────────────────────────────────────

/// A client-side route definition for SPA testing.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Route {
    pub path: String,
    pub name: String,
    pub requires_auth: bool,
    pub params: Vec<String>,
}

impl Route {
    pub fn new(path: impl Into<String>, name: impl Into<String>) -> Self {
        Self {
            path: path.into(),
            name: name.into(),
            requires_auth: false,
            params: Vec::new(),
        }
    }

    pub fn with_auth(mut self) -> Self {
        self.requires_auth = true;
        self
    }

    pub fn with_param(mut self, param: impl Into<String>) -> Self {
        self.params.push(param.into());
        self
    }

    /// Check if a URL path matches this route.
    pub fn matches(&self, url: &str) -> bool {
        let route_parts: Vec<&str> = self.path.split('/').filter(|s| !s.is_empty()).collect();
        let url_parts: Vec<&str> = url.split('/').filter(|s| !s.is_empty()).collect();

        if route_parts.len() != url_parts.len() {
            return false;
        }

        route_parts.iter().zip(url_parts.iter()).all(|(rp, up)| {
            rp.starts_with(':') || rp == up
        })
    }
}

/// A router with multiple route definitions.
#[derive(Debug, Clone)]
pub struct Router {
    pub routes: Vec<Route>,
}

impl Router {
    pub fn new() -> Self {
        Self { routes: Vec::new() }
    }

    pub fn add_route(&mut self, route: Route) {
        self.routes.push(route);
    }

    pub fn resolve(&self, url: &str) -> Option<&Route> {
        self.routes.iter().find(|r| r.matches(url))
    }

    pub fn has_unprotected_route(&self, url: &str) -> bool {
        self.resolve(url).map_or(false, |r| !r.requires_auth)
    }
}

impl Default for Router {
    fn default() -> Self {
        Self::new()
    }
}

// ── Arbitrary Component Tree Generator ──────────────────────────────────────

/// Generate random component trees for generative testing of web GUIs.
pub struct ArbitraryComponent;

impl ArbitraryComponent {
    /// Generate a random component tree from a seed.
    pub fn generate_tree(seed: u64, max_depth: usize, max_children: usize) -> ComponentTree {
        let mut gen = Gen::with_size(seed, 50);
        let title = WebStrings::label(&mut gen);
        let route = WebStrings::url_path(&mut gen);
        let root = Self::gen_component(&mut gen, max_depth, max_children, 0);
        ComponentTree::new(title, route, root)
    }

    /// Generate a random component.
    pub fn generate(seed: u64) -> Component {
        let mut gen = Gen::with_size(seed, 50);
        Self::gen_component(&mut gen, 3, 5, 0)
    }

    /// Generate a random form with inputs and validation rules.
    pub fn generate_form(seed: u64, num_fields: usize) -> Component {
        let mut gen = Gen::with_size(seed, 50);
        let mut form = Component::new(ComponentKind::Form)
            .with_id(ComponentId::from_seed(seed))
            .with_class("form-generated");

        for i in 0..num_fields {
            let field_kind = gen.choose_clone(&[
                ComponentKind::Input,
                ComponentKind::TextArea,
                ComponentKind::Select,
                ComponentKind::Checkbox,
            ]);
            let label_text = WebStrings::label(&mut gen);
            let mut field = Component::new(field_kind.clone())
                .with_id(ComponentId::from_seed(seed.wrapping_mul(100).wrapping_add(i as u64)))
                .with_label(&label_text)
                .with_class(WebStrings::css_class(&mut gen));

            // Add validation rules to text inputs
            if matches!(field_kind, ComponentKind::Input | ComponentKind::TextArea) {
                if gen.weighted_bool(0.6) {
                    field.validation_rules.push(ValidationRule::Required);
                }
                if gen.weighted_bool(0.3) {
                    field.validation_rules.push(ValidationRule::MaxLength(
                        gen.rng.gen_range(10..200),
                    ));
                }
            }

            form.children.push(field);
        }

        // Add submit button
        form.children.push(
            Component::new(ComponentKind::Button)
                .with_id(ComponentId::from_seed(seed.wrapping_mul(100).wrapping_add(num_fields as u64)))
                .with_text("Submit")
                .with_attribute("type", "submit"),
        );

        form
    }

    /// Generate a random navigation component.
    pub fn generate_nav(seed: u64, num_items: usize) -> Component {
        let mut gen = Gen::with_size(seed, 50);
        let mut nav = Component::new(ComponentKind::Nav)
            .with_id(ComponentId::from_seed(seed))
            .with_class("nav-generated");

        for i in 0..num_items {
            let link = Component::new(ComponentKind::Link)
                .with_id(ComponentId::from_seed(seed.wrapping_mul(100).wrapping_add(i as u64)))
                .with_text(WebStrings::label(&mut gen))
                .with_attribute("href", &WebStrings::url_path(&mut gen));
            nav.children.push(link);
        }

        nav
    }

    fn gen_component(gen: &mut Gen, max_depth: usize, max_children: usize, depth: usize) -> Component {
        let kind: ComponentKind = Arbitrary::arbitrary(gen);
        let seed_val = gen.rng.gen::<u64>();
        let mut component = Component::new(kind.clone())
            .with_id(ComponentId::from_seed(seed_val));

        // Add text to text-bearing components
        match &kind {
            ComponentKind::Button | ComponentKind::Link | ComponentKind::Label => {
                component.text = Some(WebStrings::label(gen));
            }
            ComponentKind::Text | ComponentKind::Heading => {
                component.text = Some(WebStrings::sentence(gen));
            }
            ComponentKind::Input | ComponentKind::TextArea => {
                component.value = Some(String::arbitrary(gen));
                component.accessibility.label = Some(WebStrings::label(gen));
            }
            _ => {}
        }

        // Add CSS classes
        let num_classes = gen.rng.gen_range(0..3);
        for _ in 0..num_classes {
            component.classes.push(WebStrings::css_class(gen));
        }

        // Set position/size
        component.position = (
            gen.rng.gen_range(0.0..800.0),
            gen.rng.gen_range(0.0..600.0),
        );
        component.size = (
            gen.rng.gen_range(20.0..400.0),
            gen.rng.gen_range(16.0..200.0),
        );

        // Recurse for container-like components
        if depth < max_depth && Self::is_container(&kind) {
            let num_children = gen.rng.gen_range(0..=max_children.min(4));
            for _ in 0..num_children {
                let child = Self::gen_component(gen, max_depth, max_children, depth + 1);
                component.children.push(child);
            }
        }

        component
    }

    fn is_container(kind: &ComponentKind) -> bool {
        matches!(
            kind,
            ComponentKind::Container
                | ComponentKind::Form
                | ComponentKind::List
                | ComponentKind::Card
                | ComponentKind::Modal
                | ComponentKind::Nav
                | ComponentKind::Header
                | ComponentKind::Footer
                | ComponentKind::Sidebar
                | ComponentKind::Main
                | ComponentKind::Section
                | ComponentKind::Article
                | ComponentKind::TabPanel
        )
    }
}

// ── Web Validators ──────────────────────────────────────────────────────────

/// Validators for web GUI properties — accessibility, layout, semantics.
pub struct WebValidator;

impl WebValidator {
    /// Check that focusable elements have accessible labels.
    pub fn check_accessibility_labels(tree: &ComponentTree) -> Vec<ComponentId> {
        let mut violations = Vec::new();
        for component in tree.flatten() {
            if component.accessibility.focusable
                && component.accessibility.label.is_none()
                && component.text.is_none()
            {
                violations.push(component.id);
            }
        }
        violations
    }

    /// Check that interactive elements are not both hidden and focusable.
    pub fn check_hidden_interactive(tree: &ComponentTree) -> Vec<ComponentId> {
        let mut violations = Vec::new();
        for component in tree.flatten() {
            if !component.visible
                && component.accessibility.focusable
                && !component.accessibility.aria_hidden
            {
                violations.push(component.id);
            }
        }
        violations
    }

    /// Check tab order: all focusable elements should have a defined tab_index.
    pub fn check_tab_order(tree: &ComponentTree) -> Vec<ComponentId> {
        let mut violations = Vec::new();
        for component in tree.flatten() {
            if component.accessibility.focusable && component.accessibility.tab_index.is_none() {
                violations.push(component.id);
            }
        }
        violations
    }

    /// Check that forms have at least one submit button.
    pub fn check_form_submit_buttons(tree: &ComponentTree) -> Vec<ComponentId> {
        let mut violations = Vec::new();
        for component in tree.flatten() {
            if component.kind == ComponentKind::Form {
                let has_submit = component.flatten().iter().any(|c| {
                    c.kind == ComponentKind::Button
                        && c.attributes.get("type").map_or(false, |t| t == "submit")
                });
                if !has_submit {
                    violations.push(component.id);
                }
            }
        }
        violations
    }

    /// Check that all required fields have values.
    pub fn check_required_fields(tree: &ComponentTree) -> Vec<(ComponentId, String)> {
        let mut violations = Vec::new();
        for component in tree.flatten() {
            for rule in &component.validation_rules {
                if let ValidationRule::Required = rule {
                    let value = component.value.as_deref().unwrap_or("");
                    if value.trim().is_empty() {
                        violations.push((
                            component.id,
                            "Required field is empty".to_string(),
                        ));
                    }
                }
            }
        }
        violations
    }

    /// Check that no two sibling components overlap.
    pub fn check_no_overlaps(component: &Component) -> Vec<(ComponentId, ComponentId)> {
        let mut overlaps = Vec::new();
        for i in 0..component.children.len() {
            for j in (i + 1)..component.children.len() {
                let a = &component.children[i];
                let b = &component.children[j];
                if a.visible && b.visible && Self::boxes_overlap(a, b) {
                    overlaps.push((a.id, b.id));
                }
            }
        }
        // Recurse
        for child in &component.children {
            overlaps.extend(Self::check_no_overlaps(child));
        }
        overlaps
    }

    /// Check that the component tree renders correctly at all breakpoints.
    /// Returns breakpoints where the tree exceeds viewport width.
    pub fn check_responsive(tree: &ComponentTree) -> Vec<Breakpoint> {
        let mut violations = Vec::new();
        for bp in Breakpoint::all() {
            let viewport = Viewport::from_breakpoint(bp);
            // Check if any visible root-level component overflows
            for component in tree.root.flatten() {
                if component.visible
                    && component.position.0 + component.size.0 > viewport.width
                {
                    violations.push(bp);
                    break;
                }
            }
        }
        violations
    }

    /// Validate route definitions: no duplicate paths, params are consistent.
    pub fn check_routes(router: &Router) -> Vec<String> {
        let mut errors = Vec::new();
        let mut seen_paths = std::collections::HashSet::new();
        for route in &router.routes {
            if !seen_paths.insert(&route.path) {
                errors.push(format!("Duplicate route path: {}", route.path));
            }
            if route.path.is_empty() || !route.path.starts_with('/') {
                errors.push(format!("Invalid route path: {}", route.path));
            }
        }
        errors
    }

    fn boxes_overlap(a: &Component, b: &Component) -> bool {
        a.position.0 < b.position.0 + b.size.0
            && a.position.0 + a.size.0 > b.position.0
            && a.position.1 < b.position.1 + b.size.1
            && a.position.1 + a.size.1 > b.position.1
    }
}

// ── Event Sequence Simulator ────────────────────────────────────────────────

/// Simulates user interaction sequences against a component tree + state.
pub struct EventSimulator {
    pub tree: ComponentTree,
    pub state: AppState,
    pub event_log: Vec<DomEvent>,
}

impl EventSimulator {
    pub fn new(tree: ComponentTree) -> Self {
        Self {
            tree,
            state: AppState::new(),
            event_log: Vec::new(),
        }
    }

    pub fn with_state(mut self, state: AppState) -> Self {
        self.state = state;
        self
    }

    /// Dispatch an event, recording it.
    pub fn dispatch(&mut self, event: DomEvent) {
        self.event_log.push(event);
    }

    /// Generate and dispatch a random sequence of events.
    pub fn random_interaction(mut self, seed: u64, num_events: usize) -> Self {
        let mut gen = Gen::with_size(seed, 50);
        let component_ids: Vec<ComponentId> = self
            .tree
            .flatten()
            .iter()
            .filter(|c| c.visible && c.enabled)
            .map(|c| c.id)
            .collect();

        if component_ids.is_empty() {
            return self;
        }

        for _ in 0..num_events {
            let target = *gen.choose(&component_ids);
            let event = match gen.rng.gen_range(0..5) {
                0 => DomEvent::Click { target },
                1 => DomEvent::Input {
                    target,
                    value: WebStrings::sentence(&mut gen),
                },
                2 => DomEvent::Focus { target },
                3 => DomEvent::Blur { target },
                _ => DomEvent::KeyDown {
                    target,
                    key: gen.choose_clone(&["Enter", "Tab", "Escape", "a"]).to_string(),
                    modifiers: KeyModifiers::default(),
                },
            };
            self.dispatch(event);
        }
        self
    }

    /// Get the number of dispatched events.
    pub fn event_count(&self) -> usize {
        self.event_log.len()
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn component_builder() {
        let btn = Component::new(ComponentKind::Button)
            .with_text("Click me")
            .with_class("btn-primary")
            .with_attribute("type", "button");

        assert_eq!(btn.text.as_deref(), Some("Click me"));
        assert_eq!(btn.classes, vec!["btn-primary"]);
        assert!(btn.accessibility.focusable);
    }

    #[test]
    fn component_tree_find() {
        let child_id = ComponentId::from_seed(2);
        let tree = ComponentTree::new(
            "Test",
            "/test",
            Component::new(ComponentKind::Container)
                .with_id(ComponentId::from_seed(1))
                .with_child(
                    Component::new(ComponentKind::Button)
                        .with_id(child_id)
                        .with_text("Hello"),
                ),
        );

        assert!(tree.find(child_id).is_some());
        assert_eq!(tree.total_count(), 2);
    }

    #[test]
    fn form_validation() {
        let form = Component::new(ComponentKind::Form)
            .with_child(
                Component::new(ComponentKind::Input)
                    .with_id(ComponentId::from_seed(1))
                    .with_validation(ValidationRule::Required),
            )
            .with_child(
                Component::new(ComponentKind::Input)
                    .with_id(ComponentId::from_seed(2))
                    .with_value("hello")
                    .with_validation(ValidationRule::Required),
            );

        let errors = form.validate_form();
        assert_eq!(errors.len(), 1); // Only first field fails (empty)
    }

    #[test]
    fn validation_rules() {
        assert!(ValidationRule::Required.validate("hello").is_ok());
        assert!(ValidationRule::Required.validate("").is_err());
        assert!(ValidationRule::MinLength(3).validate("ab").is_err());
        assert!(ValidationRule::MinLength(3).validate("abc").is_ok());
        assert!(ValidationRule::Email.validate("user@example.com").is_ok());
        assert!(ValidationRule::Email.validate("invalid").is_err());
    }

    #[test]
    fn accessibility_defaults() {
        let btn = Component::new(ComponentKind::Button);
        assert!(btn.accessibility.focusable);
        assert_eq!(btn.accessibility.role, Some("button".into()));

        let div = Component::new(ComponentKind::Container);
        assert!(!div.accessibility.focusable);
    }

    #[test]
    fn arbitrary_component_tree() {
        let tree = ArbitraryComponent::generate_tree(42, 3, 4);
        assert!(tree.total_count() >= 1);
        assert!(!tree.title.is_empty());
        assert!(tree.route.starts_with('/'));
    }

    #[test]
    fn arbitrary_form_generation() {
        let form = ArbitraryComponent::generate_form(99, 5);
        assert_eq!(form.kind, ComponentKind::Form);
        assert_eq!(form.children.len(), 6); // 5 fields + 1 submit button
    }

    #[test]
    fn web_validator_accessibility() {
        let tree = ComponentTree::new(
            "Test",
            "/test",
            Component::new(ComponentKind::Container).with_child(
                // Button without label or text → violation
                Component::new(ComponentKind::Button)
                    .with_id(ComponentId::from_seed(1)),
            ),
        );

        let violations = WebValidator::check_accessibility_labels(&tree);
        assert_eq!(violations.len(), 1);
    }

    #[test]
    fn web_validator_form_submit() {
        // Form without submit button
        let tree = ComponentTree::new(
            "Test",
            "/",
            Component::new(ComponentKind::Form)
                .with_id(ComponentId::from_seed(1))
                .with_child(Component::new(ComponentKind::Input)),
        );

        let violations = WebValidator::check_form_submit_buttons(&tree);
        assert_eq!(violations.len(), 1);
    }

    #[test]
    fn route_matching() {
        let route = Route::new("/users/:id", "user_detail").with_param("id");
        assert!(route.matches("/users/42"));
        assert!(!route.matches("/users/42/edit"));
        assert!(!route.matches("/posts/42"));
    }

    #[test]
    fn router_resolve() {
        let mut router = Router::new();
        router.add_route(Route::new("/", "home"));
        router.add_route(Route::new("/users", "users").with_auth());
        router.add_route(Route::new("/login", "login"));

        assert!(router.resolve("/").is_some());
        assert!(router.resolve("/users").is_some());
        assert!(router.has_unprotected_route("/"));
        assert!(!router.has_unprotected_route("/users"));
    }

    #[test]
    fn breakpoints() {
        assert_eq!(Breakpoint::from_width(375.0), Breakpoint::Mobile);
        assert_eq!(Breakpoint::from_width(768.0), Breakpoint::Tablet);
        assert_eq!(Breakpoint::from_width(1280.0), Breakpoint::Desktop);
        assert_eq!(Breakpoint::from_width(1920.0), Breakpoint::Wide);
    }

    #[test]
    fn event_simulator() {
        let tree = ArbitraryComponent::generate_tree(42, 2, 3);
        let sim = EventSimulator::new(tree).random_interaction(99, 10);
        assert_eq!(sim.event_count(), 10);
    }

    #[test]
    fn state_management() {
        let mut state = AppState::new();
        state.set("count", serde_json::json!(0));
        assert_eq!(state.version, 1);

        let action = StateAction::new("increment", serde_json::json!(1));
        state.apply(&action, |s, a| {
            let current = s.get("count").and_then(|v| v.as_i64()).unwrap_or(0);
            let delta = a.payload.as_i64().unwrap_or(1);
            s.data.insert("count".into(), serde_json::json!(current + delta));
        });

        assert_eq!(state.get("count"), Some(&serde_json::json!(1)));
    }

    #[test]
    fn generate_nav() {
        let nav = ArbitraryComponent::generate_nav(42, 5);
        assert_eq!(nav.kind, ComponentKind::Nav);
        assert_eq!(nav.children.len(), 5);
        for child in &nav.children {
            assert_eq!(child.kind, ComponentKind::Link);
        }
    }

    #[test]
    fn deterministic_tree_generation() {
        let t1 = ArbitraryComponent::generate_tree(42, 3, 3);
        let t2 = ArbitraryComponent::generate_tree(42, 3, 3);
        assert_eq!(t1.total_count(), t2.total_count());
        assert_eq!(t1.title, t2.title);
        assert_eq!(t1.route, t2.route);
    }
}
