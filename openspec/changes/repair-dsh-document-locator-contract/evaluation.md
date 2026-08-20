# Evaluation Disposition

- DSH schema and deterministic decoder behavior: `update` the existing `add-dsh-document-tool` boundary checks; the changed behavior is contract metadata plus strict parsing.
- Managed media-library document access: deterministic path-level integration coverage is sufficient for the Host authorization change because the provider/model output is not changed.
- Real provider/UI Agent execution: not required for this narrow schema and authorization test slice; no claim is made about native image attachment delivery.

Residual risk: a configured provider may still emit malformed arguments despite the richer schema. Such calls remain fail-visible at the canonical decoder rather than entering a compatibility path.

## Verification

- Focused Vitest: Content document contract, Content DSH plugin, workspace content authorization, Desktop DSH document handler, and Agent Runtime document adapters; 28 tests passed.
- Typechecks: `@neko/content`, `@neko/content-dsh-plugin`, `@neko/agent-runtime`, and Desktop passed.
- Boundary gates: `check:agent-boundaries`, `check:content-access-boundaries`, `check:openspec`, and `git diff --check` passed.
