## Context

The repository name and newer Agent runtime code already use `OpenNeko`, while the public entry points, client labels, extension-pack manifest, package descriptions, and many current architecture documents still use `Neko Suite` or `Neko *`. The same `neko` stem also appears in stable technical identities (`@neko/*`, `neko.*`, `neko-*`, file formats, commands, configuration keys, paths, crates, and exported symbols), so an unrestricted textual rename would break consumers without improving the product identity.

The change spans application composition roots, reusable packages, documentation, and quality tooling. It does not change ownership or runtime data flow.

## Goals / Non-Goals

**Goals:**

- Make `OpenNeko` the single canonical top-level product brand.
- Make client and assistant labels consistently inherit the brand: `OpenNeko Home`, `OpenNeko TUI`, `OpenNeko for VSCode`, and `OpenNeko AI`.
- Update user-visible and maintainer-facing descriptions without changing runtime identity.
- Prevent the retired brand phrases from returning through an automated repository check.

**Non-Goals:**

- Renaming directories, published/workspace npm packages/scopes, binaries, VS Code publisher or extension IDs, commands, configuration keys, file extensions/formats, Rust crates, protocol fields, or public exported identifiers.
- Changing application responsibilities, package boundaries, runtime behavior, persisted data, or release topology.
- Rewriting archived OpenSpec artifacts, generated outputs, third-party content, or user-created artifacts.

## Decisions

### 1. Treat branding as presentation metadata, not a runtime contract migration

User-visible strings, package descriptions, documentation prose, source comments, diagnostics, HTML titles, and manifest `displayName` values use `OpenNeko`. The private root workspace aggregator becomes `openneko-monorepo`; stable published and runtime machine identifiers retain the existing `neko` spellings.

This preserves package resolution, VS Code installation identity, settings, commands, wire compatibility, file compatibility, and public TypeScript APIs. The alternative—renaming all `neko` tokens—would require a broad breaking migration unrelated to the requested product-name change.

### 2. Use a canonical product-name family

The canonical names are:

| Surface                | Canonical name                          |
| ---------------------- | --------------------------------------- |
| Top-level product      | `OpenNeko`                              |
| Electron client        | `OpenNeko Home`                         |
| Terminal client        | `OpenNeko TUI`                          |
| VS Code extension pack | `OpenNeko for VSCode`                   |
| Assistant label        | `OpenNeko AI` / `OpenNeko AI Assistant` |

Subpackage/domain names such as Story, Canvas, Cut, Preview, Agent, Engine, and Assets remain unchanged unless they include a retired product-family label in presentation copy.

### 3. Add a repository-level brand guard

A dependency-free Node script walks current first-party text files and reports retired product phrases. It excludes version-control metadata, dependencies, build/report outputs, archived OpenSpec history, generated artifacts, and the guard's own retired-label fixtures. The check is added to the existing quality pipeline and has focused tests for detection, exclusions, and preserved technical identifiers.

The guard checks phrases rather than the generic token `Neko`, because package and protocol identities intentionally retain that stem. A broad regex would create false positives and pressure maintainers toward breaking technical renames.

### 4. Preserve current ownership boundaries

- **Responsibility:** application manifests own installable product labels; packages own their local descriptions and UI copy; the root owns canonical brand policy and quality enforcement.
- **Dependency:** no imports or runtime dependencies change.
- **Interface:** machine contracts remain stable; only presentation metadata changes.
- **Extension:** future clients can adopt `OpenNeko <Client>` and are covered by the same guard policy.
- **Testing:** focused guard tests prove retired labels fail and technical IDs pass; existing manifest/TUI/package tests verify updated expected labels.

## Risks / Trade-offs

- [Missed product string in an uncommon file type] → Audit with both the new checker and independent `rg` queries; keep the extension allowlist explicit and reviewable.
- [False positive on historical evidence] → Exclude archived OpenSpec and generated/user output roots, while scanning all current specifications and source-owned documentation.
- [Accidental breaking rename] → Review diffs for package names, scopes, extension IDs, commands, settings, paths, crate names, file formats, and exported identifiers; do not modify them.
- [Large textual diff overlaps unrelated work] → Restrict edits to exact product phrases and avoid files already deleted by the user's in-progress work.

## Migration Plan

1. Add the brand contract and focused guard tests.
2. Update active product manifests and user-visible application strings with their test expectations.
3. Update active documentation, package metadata, comments, and diagnostics.
4. Run the brand guard, manifest/TUI-focused tests, OpenSpec validation, and diff checks.

Rollback is a textual revert of this change; no persisted data or runtime contract migration is involved.

## Open Questions

None. Repository/package paths and stable technical identities deliberately remain on the existing `neko` namespace until a separately approved compatibility migration exists.
