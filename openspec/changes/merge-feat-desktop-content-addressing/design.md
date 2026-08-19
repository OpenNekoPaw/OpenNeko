# Design

`@neko/content` owns the canonical locator contract. File authority and optional entry selector are the only identity components; path normalization and validation remain package-owned. Canvas and content consumers receive locators through typed package ports. The Desktop composition root only wires concrete host adapters.

The migration is applied as selective commits from `feat-desktop`. Conflicts touching Agent runtime, ACP, DSH plugins, or legacy Pi paths are resolved in favor of the current `feat-dsh` implementation and are not reintroduced through aliases.
