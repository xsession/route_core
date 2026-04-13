//! Generic generative testing engine — trait-based value generation with combinators and shrinking.
//!
//! Use this module to generate random test data for any domain. Implement `Arbitrary`
//! for your types, compose generators with combinators, and use `GenRunner` for
//! property-based testing with automatic shrinking.
//!
//! # Example
//! ```ignore
//! use anvil_core::generators::*;
//!
//! let mut gen = Gen::new(42);
//! let s: String = gen.arbitrary::<String>();
//! let v: Vec<u32> = gen.arbitrary_vec::<u32>(10);
//! ```

use rand::prelude::*;
use rand_chacha::ChaCha8Rng;

// ── Seeded Random Generator ─────────────────────────────────────────────────

/// A deterministic random generator wrapping `ChaCha8Rng`.
///
/// All test-data generation flows through this, ensuring full reproducibility.
pub struct Gen {
    pub rng: ChaCha8Rng,
    pub size: usize,
}

impl Gen {
    /// Create a new generator from a seed.
    pub fn new(seed: u64) -> Self {
        Self {
            rng: ChaCha8Rng::seed_from_u64(seed),
            size: 100,
        }
    }

    /// Create a generator with a custom size hint.
    /// `size` influences how "large" generated values are (string length, vec length, etc.)
    pub fn with_size(seed: u64, size: usize) -> Self {
        Self {
            rng: ChaCha8Rng::seed_from_u64(seed),
            size,
        }
    }

    /// Generate an arbitrary value of type T.
    pub fn arbitrary<T: Arbitrary>(&mut self) -> T {
        T::arbitrary(self)
    }

    /// Generate a Vec of arbitrary values.
    pub fn arbitrary_vec<T: Arbitrary>(&mut self, max_len: usize) -> Vec<T> {
        let len = self.rng.gen_range(0..=max_len);
        (0..len).map(|_| T::arbitrary(self)).collect()
    }

    /// Generate a value within a range.
    pub fn range(&mut self, min: i64, max: i64) -> i64 {
        self.rng.gen_range(min..=max)
    }

    /// Generate a float in [min, max).
    pub fn range_f64(&mut self, min: f64, max: f64) -> f64 {
        self.rng.gen_range(min..max)
    }

    /// Generate a bool with given probability of true.
    pub fn weighted_bool(&mut self, probability: f64) -> bool {
        self.rng.gen_bool(probability.clamp(0.0, 1.0))
    }

    /// Pick one element from a slice.
    pub fn choose<'a, T>(&mut self, items: &'a [T]) -> &'a T {
        &items[self.rng.gen_range(0..items.len())]
    }

    /// Pick one element from a slice, cloning it.
    pub fn choose_clone<T: Clone>(&mut self, items: &[T]) -> T {
        items[self.rng.gen_range(0..items.len())].clone()
    }

    /// Generate an optional value (None ~30% of the time).
    pub fn optional<T: Arbitrary>(&mut self) -> Option<T> {
        if self.weighted_bool(0.7) {
            Some(T::arbitrary(self))
        } else {
            None
        }
    }

    /// Fork this generator (creates a child with a derived seed).
    pub fn fork(&mut self) -> Gen {
        let child_seed = self.rng.next_u64();
        Gen::with_size(child_seed, self.size)
    }
}

// ── Arbitrary Trait ──────────────────────────────────────────────────────────

/// Trait for types that can be randomly generated.
///
/// Implement this for your domain types to integrate with the generative testing engine.
pub trait Arbitrary: Sized {
    /// Generate a random value using the provided generator.
    fn arbitrary(gen: &mut Gen) -> Self;

    /// Produce smaller versions of this value for shrinking on test failure.
    /// Returns an empty vec by default (no shrinking).
    fn shrink(&self) -> Vec<Self> {
        Vec::new()
    }
}

// ── Built-in Arbitrary Implementations ──────────────────────────────────────

impl Arbitrary for bool {
    fn arbitrary(gen: &mut Gen) -> Self {
        gen.rng.gen()
    }

    fn shrink(&self) -> Vec<Self> {
        if *self { vec![false] } else { vec![] }
    }
}

impl Arbitrary for u8 {
    fn arbitrary(gen: &mut Gen) -> Self {
        gen.rng.gen()
    }

    fn shrink(&self) -> Vec<Self> {
        let mut v = Vec::new();
        if *self > 0 { v.push(0); v.push(*self / 2); }
        v
    }
}

impl Arbitrary for u16 {
    fn arbitrary(gen: &mut Gen) -> Self {
        gen.rng.gen()
    }
}

impl Arbitrary for u32 {
    fn arbitrary(gen: &mut Gen) -> Self {
        gen.rng.gen()
    }

    fn shrink(&self) -> Vec<Self> {
        let mut v = Vec::new();
        if *self > 0 { v.push(0); v.push(*self / 2); }
        v
    }
}

impl Arbitrary for u64 {
    fn arbitrary(gen: &mut Gen) -> Self {
        gen.rng.gen()
    }

    fn shrink(&self) -> Vec<Self> {
        let mut v = Vec::new();
        if *self > 0 { v.push(0); v.push(*self / 2); }
        v
    }
}

impl Arbitrary for i32 {
    fn arbitrary(gen: &mut Gen) -> Self {
        gen.rng.gen()
    }

    fn shrink(&self) -> Vec<Self> {
        let mut v = Vec::new();
        if *self != 0 { v.push(0); v.push(*self / 2); }
        v
    }
}

impl Arbitrary for i64 {
    fn arbitrary(gen: &mut Gen) -> Self {
        gen.rng.gen()
    }

    fn shrink(&self) -> Vec<Self> {
        let mut v = Vec::new();
        if *self != 0 { v.push(0); v.push(*self / 2); }
        v
    }
}

impl Arbitrary for f64 {
    fn arbitrary(gen: &mut Gen) -> Self {
        gen.rng.gen_range(-1000.0..1000.0)
    }

    fn shrink(&self) -> Vec<Self> {
        let mut v = Vec::new();
        if *self != 0.0 { v.push(0.0); v.push(*self / 2.0); }
        v
    }
}

impl Arbitrary for f32 {
    fn arbitrary(gen: &mut Gen) -> Self {
        gen.rng.gen_range(-1000.0f32..1000.0f32)
    }
}

impl Arbitrary for String {
    fn arbitrary(gen: &mut Gen) -> Self {
        let len = gen.rng.gen_range(0..gen.size.min(64));
        let charset: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_- ";
        (0..len)
            .map(|_| charset[gen.rng.gen_range(0..charset.len())] as char)
            .collect()
    }

    fn shrink(&self) -> Vec<Self> {
        let mut v = Vec::new();
        if !self.is_empty() {
            v.push(String::new());
            if self.len() > 1 {
                v.push(self[..self.len() / 2].to_string());
            }
        }
        v
    }
}

impl Arbitrary for char {
    fn arbitrary(gen: &mut Gen) -> Self {
        let charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        charset.chars().nth(gen.rng.gen_range(0..charset.len())).unwrap()
    }
}

impl<T: Arbitrary + Clone> Arbitrary for Vec<T> {
    fn arbitrary(gen: &mut Gen) -> Self {
        let len = gen.rng.gen_range(0..gen.size.min(20));
        (0..len).map(|_| T::arbitrary(gen)).collect()
    }

    fn shrink(&self) -> Vec<Self> {
        let mut v = Vec::new();
        if !self.is_empty() {
            v.push(Vec::new());
            if self.len() > 1 {
                v.push(self[..self.len() / 2].to_vec());
            }
        }
        v
    }
}

impl<T: Arbitrary> Arbitrary for Option<T> {
    fn arbitrary(gen: &mut Gen) -> Self {
        if gen.weighted_bool(0.7) {
            Some(T::arbitrary(gen))
        } else {
            None
        }
    }
}

impl Arbitrary for serde_json::Value {
    fn arbitrary(gen: &mut Gen) -> Self {
        let choice = gen.rng.gen_range(0..6);
        match choice {
            0 => serde_json::Value::Null,
            1 => serde_json::Value::Bool(bool::arbitrary(gen)),
            2 => serde_json::json!(i32::arbitrary(gen)),
            3 => serde_json::json!(f64::arbitrary(gen)),
            4 => serde_json::Value::String(String::arbitrary(gen)),
            _ => {
                // Small object
                let num_keys = gen.rng.gen_range(0..4);
                let mut map = serde_json::Map::new();
                for _ in 0..num_keys {
                    let key = String::arbitrary(gen);
                    let val = serde_json::json!(String::arbitrary(gen));
                    map.insert(key, val);
                }
                serde_json::Value::Object(map)
            }
        }
    }
}

// ── Generator Combinators ────────────────────────────────────────────────────

/// A boxed generator function for dynamic composition.
pub struct GenFn<T> {
    func: Box<dyn Fn(&mut Gen) -> T + Send + Sync>,
}

impl<T> GenFn<T> {
    /// Create a generator from a closure.
    pub fn new(f: impl Fn(&mut Gen) -> T + Send + Sync + 'static) -> Self {
        Self { func: Box::new(f) }
    }

    /// Generate a value.
    pub fn generate(&self, gen: &mut Gen) -> T {
        (self.func)(gen)
    }

    /// Map the output to another type.
    pub fn map<U>(self, f: impl Fn(T) -> U + Send + Sync + 'static) -> GenFn<U>
    where
        T: 'static,
    {
        GenFn::new(move |gen| f((self.func)(gen)))
    }
}

/// Pick one generator from a list uniformly.
pub fn one_of<T: 'static>(generators: Vec<GenFn<T>>) -> GenFn<T> {
    GenFn::new(move |gen| {
        let idx = gen.rng.gen_range(0..generators.len());
        generators[idx].generate(gen)
    })
}

/// Pick a generator based on weighted frequencies.
pub fn frequency<T: 'static>(weighted: Vec<(u32, GenFn<T>)>) -> GenFn<T> {
    let total: u32 = weighted.iter().map(|(w, _)| w).sum();
    GenFn::new(move |gen| {
        let mut choice = gen.rng.gen_range(0..total);
        for (weight, generator) in &weighted {
            if choice < *weight {
                return generator.generate(gen);
            }
            choice -= weight;
        }
        // Fallback (shouldn't reach)
        weighted.last().unwrap().1.generate(gen)
    })
}

/// Generate a constant value.
pub fn constant<T: Clone + Send + Sync + 'static>(value: T) -> GenFn<T> {
    GenFn::new(move |_| value.clone())
}

/// Generate a value from a predefined set.
pub fn elements<T: Clone + Send + Sync + 'static>(items: Vec<T>) -> GenFn<T> {
    GenFn::new(move |gen| {
        let idx = gen.rng.gen_range(0..items.len());
        items[idx].clone()
    })
}

/// Generate a Vec of values from a given generator.
pub fn vec_of<T: 'static>(item_gen: GenFn<T>, max_len: usize) -> GenFn<Vec<T>> {
    GenFn::new(move |gen| {
        let len = gen.rng.gen_range(0..=max_len);
        (0..len).map(|_| item_gen.generate(gen)).collect()
    })
}

// ── Specialized String Generators ────────────────────────────────────────────

/// Generate common web-related strings: CSS classes, HTML IDs, URLs, emails, etc.
pub struct WebStrings;

impl WebStrings {
    /// Generate a valid CSS class name.
    pub fn css_class(gen: &mut Gen) -> String {
        let prefixes = ["btn", "card", "nav", "form", "input", "text", "container", "modal", "list", "header"];
        let suffixes = ["primary", "secondary", "lg", "sm", "active", "disabled", "error", "success"];
        let prefix = gen.choose(prefixes.as_slice());
        let suffix = gen.choose(suffixes.as_slice());
        format!("{}-{}", prefix, suffix)
    }

    /// Generate a valid HTML element ID.
    pub fn html_id(gen: &mut Gen) -> String {
        let parts = ["app", "main", "sidebar", "content", "form", "search", "user", "menu"];
        let part = gen.choose(parts.as_slice());
        let n: u32 = gen.rng.gen_range(1..1000);
        format!("{}-{}", part, n)
    }

    /// Generate a relative URL path.
    pub fn url_path(gen: &mut Gen) -> String {
        let segments = ["home", "about", "users", "settings", "dashboard", "profile", "items", "api"];
        let depth = gen.rng.gen_range(1..=4);
        let path: Vec<&str> = (0..depth).map(|_| *gen.choose(segments.as_slice())).collect();
        format!("/{}", path.join("/"))
    }

    /// Generate a placeholder email address.
    pub fn email(gen: &mut Gen) -> String {
        let names = ["user", "test", "admin", "dev", "qa", "staging"];
        let domains = ["example.com", "test.local", "demo.test"];
        let name = gen.choose(names.as_slice());
        let domain = gen.choose(domains.as_slice());
        let n: u32 = gen.rng.gen_range(1..100);
        format!("{}{}@{}", name, n, domain)
    }

    /// Generate a label / display text.
    pub fn label(gen: &mut Gen) -> String {
        let labels = [
            "Submit", "Cancel", "Save", "Delete", "Edit", "View",
            "Search", "Filter", "Sort", "Refresh", "Add", "Remove",
            "Next", "Previous", "Close", "Open", "Login", "Logout",
            "Sign Up", "Reset", "Apply", "Clear", "Download", "Upload",
        ];
        gen.choose_clone(labels.as_slice()).to_string()
    }

    /// Generate a placeholder sentence.
    pub fn sentence(gen: &mut Gen) -> String {
        let words = [
            "the", "a", "lorem", "ipsum", "quick", "brown", "fox", "jumps",
            "over", "lazy", "dog", "data", "entry", "complete", "status",
            "update", "component", "rendered", "successfully", "error",
        ];
        let len = gen.rng.gen_range(3..12);
        let sentence: Vec<&str> = (0..len).map(|_| *gen.choose(words.as_slice())).collect();
        let mut s = sentence.join(" ");
        if let Some(first) = s.get_mut(0..1) {
            first.make_ascii_uppercase();
        }
        s.push('.');
        s
    }
}

// ── Generic Property Runner ─────────────────────────────────────────────────

/// Configuration for the generic property runner.
#[derive(Debug, Clone)]
pub struct GenPropertyConfig {
    pub seed: u64,
    pub num_cases: usize,
    pub size: usize,
    pub max_shrinks: usize,
}

impl Default for GenPropertyConfig {
    fn default() -> Self {
        Self {
            seed: 42,
            num_cases: 100,
            size: 50,
            max_shrinks: 100,
        }
    }
}

/// Result of a single generative property test case.
#[derive(Debug)]
pub struct GenPropertyResult {
    pub seed: u64,
    pub passed: bool,
    pub error: Option<String>,
    pub shrunk: bool,
}

/// A generic property-based test runner that works with any `Arbitrary` type.
pub struct GenRunner {
    pub config: GenPropertyConfig,
}

impl GenRunner {
    pub fn new(config: GenPropertyConfig) -> Self {
        Self { config }
    }

    /// Run a property on randomly generated values of type T.
    pub fn check<T, F>(&self, property: F) -> Vec<GenPropertyResult>
    where
        T: Arbitrary,
        F: Fn(&T) -> Result<(), String>,
    {
        let mut results = Vec::new();

        for i in 0..self.config.num_cases {
            let seed = self.config.seed.wrapping_add(i as u64);
            let mut gen = Gen::with_size(seed, self.config.size);
            let value = T::arbitrary(&mut gen);

            match property(&value) {
                Ok(()) => {
                    results.push(GenPropertyResult {
                        seed,
                        passed: true,
                        error: None,
                        shrunk: false,
                    });
                }
                Err(e) => {
                    // Try shrinking
                    let shrunk = self.try_shrink(&value, &property);
                    results.push(GenPropertyResult {
                        seed,
                        passed: false,
                        error: Some(e),
                        shrunk,
                    });
                }
            }
        }

        results
    }

    /// Run a property on values generated by a custom generator.
    pub fn check_with<T, F>(&self, generator: &GenFn<T>, property: F) -> Vec<GenPropertyResult>
    where
        F: Fn(&T) -> Result<(), String>,
    {
        let mut results = Vec::new();

        for i in 0..self.config.num_cases {
            let seed = self.config.seed.wrapping_add(i as u64);
            let mut gen = Gen::with_size(seed, self.config.size);
            let value = generator.generate(&mut gen);

            match property(&value) {
                Ok(()) => {
                    results.push(GenPropertyResult {
                        seed,
                        passed: true,
                        error: None,
                        shrunk: false,
                    });
                }
                Err(e) => {
                    results.push(GenPropertyResult {
                        seed,
                        passed: false,
                        error: Some(e),
                        shrunk: false,
                    });
                }
            }
        }

        results
    }

    fn try_shrink<T, F>(&self, value: &T, property: &F) -> bool
    where
        T: Arbitrary,
        F: Fn(&T) -> Result<(), String>,
    {
        for candidate in value.shrink().into_iter().take(self.config.max_shrinks) {
            if property(&candidate).is_err() {
                return true;
            }
        }
        false
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gen_deterministic() {
        let mut g1 = Gen::new(42);
        let mut g2 = Gen::new(42);
        let a: u64 = g1.arbitrary();
        let b: u64 = g2.arbitrary();
        assert_eq!(a, b);
    }

    #[test]
    fn gen_strings() {
        let mut gen = Gen::new(7);
        let s: String = gen.arbitrary();
        assert!(s.len() <= 100);
    }

    #[test]
    fn gen_vecs() {
        let mut gen = Gen::new(13);
        let v: Vec<i32> = gen.arbitrary_vec(10);
        assert!(v.len() <= 10);
    }

    #[test]
    fn gen_json_values() {
        let mut gen = Gen::new(99);
        for _ in 0..20 {
            let _v: serde_json::Value = gen.arbitrary();
        }
    }

    #[test]
    fn combinator_one_of() {
        let g = one_of(vec![
            constant(1),
            constant(2),
            constant(3),
        ]);
        let mut gen = Gen::new(42);
        let v = g.generate(&mut gen);
        assert!([1, 2, 3].contains(&v));
    }

    #[test]
    fn combinator_elements() {
        let g = elements(vec!["a", "b", "c"]);
        let mut gen = Gen::new(42);
        let v = g.generate(&mut gen);
        assert!(["a", "b", "c"].contains(&v));
    }

    #[test]
    fn combinator_vec_of() {
        let g = vec_of(constant(42), 5);
        let mut gen = Gen::new(42);
        let v = g.generate(&mut gen);
        assert!(v.len() <= 5);
        assert!(v.iter().all(|&x| x == 42));
    }

    #[test]
    fn web_strings() {
        let mut gen = Gen::new(42);
        let cls = WebStrings::css_class(&mut gen);
        assert!(cls.contains('-'));
        let id = WebStrings::html_id(&mut gen);
        assert!(id.contains('-'));
        let url = WebStrings::url_path(&mut gen);
        assert!(url.starts_with('/'));
        let email = WebStrings::email(&mut gen);
        assert!(email.contains('@'));
    }

    #[test]
    fn gen_runner_all_pass() {
        let config = GenPropertyConfig {
            seed: 0,
            num_cases: 20,
            size: 10,
            max_shrinks: 10,
        };
        let runner = GenRunner::new(config);
        let results = runner.check::<u32, _>(|_| Ok(()));
        assert!(results.iter().all(|r| r.passed));
    }

    #[test]
    fn gen_runner_detects_failure() {
        let config = GenPropertyConfig {
            seed: 0,
            num_cases: 20,
            size: 10,
            max_shrinks: 10,
        };
        let runner = GenRunner::new(config);
        let results = runner.check::<u32, _>(|n| {
            if *n > 100 { Err("too large".into()) } else { Ok(()) }
        });
        assert!(results.iter().any(|r| !r.passed));
    }

    #[test]
    fn gen_runner_with_custom_generator() {
        let config = GenPropertyConfig {
            seed: 0,
            num_cases: 10,
            size: 10,
            max_shrinks: 0,
        };
        let runner = GenRunner::new(config);
        let gen = elements(vec!["hello", "world", "test"]);
        let results = runner.check_with(&gen, |s| {
            if s.is_empty() { Err("empty".into()) } else { Ok(()) }
        });
        assert!(results.iter().all(|r| r.passed));
    }

    #[test]
    fn shrinking_finds_smaller_input() {
        let s = "hello world".to_string();
        let shrunk = s.shrink();
        assert!(!shrunk.is_empty());
        assert!(shrunk.iter().all(|x| x.len() < s.len()));
    }
}
