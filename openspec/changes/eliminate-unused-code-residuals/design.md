## Context

The repository reports 140 unused-symbol warnings across 80 files: 66 in production and 74 in tests. Recent removal of retired products, legacy preview delivery, dormant Cut surfaces, and unused public exports left a final layer of local imports, helpers, fixtures, and values that `knip` does not own. A smaller subset is intentionally unused because an implementation must satisfy an interface or callback signature, a catch does not need its error, or destructuring deliberately omits a field.

Responsibility analysis: owning packages remove their dead local code; shared contracts keep required signatures; ESLint owns regression enforcement. Dependency analysis: removing unused imports must not alter package boundaries or introduce replacement dependencies. Interface analysis: public and interface contracts remain stable, with `_` names documenting intentionally unused parameters. Extension analysis: future unused symbols fail CI rather than accumulating after another contraction. Testing analysis: affected package tests and typechecks prove removals did not disconnect canonical behavior; full lint proves zero findings.

## Goals / Non-Goals

**Goals:**

- Remove all confirmed unused code and obsolete test residue.
- Preserve required signatures and intentional omission semantics explicitly.
- Reach zero `no-unused-vars` findings without suppressions or broad ignore rules.
- Promote the rule to error and prevent recurrence.

**Non-Goals:**

- Remove public exports merely because one workspace currently has no caller; `knip` remains authoritative for that audit.
- Redesign package APIs, workflows, UI behavior, or domain contracts.
- Prefix genuine dead locals with `_` to conceal them.
- Clean other ESLint warning classes in this change.

## Decisions

### 1. Classify each finding before editing

Unused imports, local types, helpers, state, and assignments with no semantic role are deleted. Interface/callback parameters retain their position and are renamed with `_`. Catch bindings are omitted when the value is irrelevant. Destructuring used to remove a field aliases that field to an underscore name, preserving the resulting object.

Blanket rule configuration, file exceptions, and mass underscore-prefixing were rejected because they would preserve dead code and obscure future residue.

### 2. Remove contraction residue at the owning source

Obsolete protocol builders, preview constants imported only for old tests, retired asset-registration helpers, and similar local leftovers are removed from the file that owns them. No compatibility wrapper or replacement abstraction is introduced because the canonical paths already exist and pass current tests.

### 3. Keep behavioral validation proportional to the edits

Pure import and test-fixture removals use owning package tests/typechecks. Removed production helpers or state require inspection of all references and the affected package suite. Root lint and orchestration tests enforce zero findings and error severity, followed by full local CI.

## Risks / Trade-offs

- [A symbol is used indirectly] → Search references and rely on package typecheck/build/tests before removal; retain only contracts with an explicit owner.
- [Renaming a callback parameter changes behavior] → Rename identifiers only, never parameter order or callback arity.
- [A test loses meaningful coverage] → Remove only unused fixture surface; keep assertions and exercised builders intact.
- [Large mechanical diff hides a functional change] → Group edits by production, tests, and contract placeholders, and review the final diff for non-removal behavior changes.

## Migration Plan

1. Audit and remove production-local residue, then run targeted lint/typechecks.
2. Remove obsolete test imports/fixtures and normalize required unused parameters.
3. Confirm zero findings and promote the rule to error.
4. Run full local CI and quality review; revert any owning-file edit whose behavior cannot be proven unchanged.

## Open Questions

None.
