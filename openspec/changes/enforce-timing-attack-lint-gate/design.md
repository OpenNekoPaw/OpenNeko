## Context

The security plugin reports six possible timing attacks in `parseCharacterDialogueSlashArgs`. Each finding is a comparison between a local variable named `token` and a public CLI flag such as `--consult` or `--manual`. The value is a tokenized command-line argument, not an authentication token, secret, signature, or other sensitive value; therefore constant-time comparison is neither required nor meaningful.

Responsibility analysis: the parser owns public slash-command syntax, while security lint owns detection of suspicious secret comparisons. Dependency analysis: the fix changes no imports or layer direction. Interface analysis: `ParsedCharacterDialogueSlashArgs` and accepted flags remain unchanged. Extension analysis: semantically precise local naming prevents this false-positive class without weakening the security rule. Testing analysis: focused parser tests preserve command behavior, orchestration tests enforce the rule severity, and repository lint proves zero findings.

## Goals / Non-Goals

**Goals:**

- Remove all current timing-attack warnings without suppression or rule exceptions.
- Preserve all Character Dialogue slash-argument behavior.
- Make future possible timing-attack findings CI-blocking.
- Keep security-sensitive comparisons fail-visible for review.

**Non-Goals:**

- Introduce constant-time comparison for public command flags.
- Redesign slash-command tokenization or Character Dialogue routing.
- Change command names, payload contracts, or user-visible behavior.
- Clean unsafe-regex or other deferred warning classes.

## Decisions

### 1. Rename the public argument variable instead of suppressing the rule

The loop-local `token` variable becomes `argument`, and all related reads use that name. This accurately communicates the value's role to maintainers and to the security rule's identifier heuristic.

Disabling the rule for the file or adding inline suppression was rejected because it would hide future real secret comparisons. Replacing equality with indirect control flow was rejected because it would obscure simple public command parsing solely to satisfy lint.

### 2. Preserve the parser contract with focused behavioral coverage

The existing parser test is expanded to cover both split and inline enrichment flags plus roleplay/consult mode flags. The returned DTO remains the authoritative behavior assertion; no new parser abstraction is introduced for a local naming correction.

### 3. Promote the security rule only after zero-findings validation

`security/detect-possible-timing-attacks` becomes an explicit error in the shared security ESLint configuration. The orchestration regression test asserts that effective setting so a later config merge cannot silently downgrade it.

## Risks / Trade-offs

- [The plugin heuristic changes in a future release] → Repository lint remains the end-to-end check and any new finding fails visibly.
- [A parser behavior changes during the rename] → Focused tests cover mode, enrichment, entity, and message projection before the quality gate is promoted.
- [A genuine secret comparison is introduced elsewhere] → The error-level rule blocks CI and requires an explicit security review rather than a broad exception.

## Migration Plan

1. Add regression assertions for parser variants and error-level security configuration.
2. Rename the local CLI argument variable and verify the parser tests.
3. Confirm the repository has zero timing-attack findings, then promote the rule to error.
4. Run package and repository quality gates; roll back the rename and severity together if behavior diverges.

## Open Questions

None.
