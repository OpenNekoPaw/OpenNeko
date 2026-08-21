## 1. Canonical sizing policy

- [x] 1.1 Add Canvas domain tests and a bounded intrinsic image sizing helper for landscape, portrait, square, extreme and invalid dimensions.
- [x] 1.2 Replace the Workspace Board private aspect-ratio sizing branch with the canonical helper.
- [x] 1.3 Add image-specific proportional minimum sizing without changing audio/video minimums or rewriting existing durable sizes.

## 2. Dimension producers

- [x] 2.1 Reuse the canonical Content image metadata probe from Node material authoring for authorized workspace images and imported image bytes.
- [x] 2.2 Project browser File dimensions through the Canvas drop descriptor and create the node with the canonical domain size.
- [x] 2.3 Verify generated image summary dimensions use the same sizing policy and representation replacement preserves current size.

## 3. Validation and review

- [x] 3.1 Run focused Canvas/Content tests, builds, formatting, OpenSpec validation and package-boundary checks.
- [x] 3.2 Use `neko-ui-validation` for portrait, landscape, square and extreme-ratio nodes, dense Canvas layout, resize minimums and adjacent media states.
- [x] 3.3 Use `neko-quality-review` to audit ownership, all creation paths, user-data preservation and residual risk.
