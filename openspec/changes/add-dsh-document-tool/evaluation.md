# Evaluation Disposition

## Decision

- `openneko.document` contract, DSH registration, and Host routing: `update` existing DSH boundary and tool-inventory checks.
- Pure decoder and adapter behavior: deterministic focused tests are sufficient for this slice.
- Real provider/UI document-image attachment delivery: blocked for this change because the configured evaluation lane has not run a visible real-provider image-capable session; no success claim is made.

## Evidence

- Key-free Agent Evaluation: 45 files, 307 tests, 27 suites, 80 cases passed; this validates harness and suite authoring only.
- Canonical DSH inventory and extension-boundary checks pass with `openneko.document` and `@neko/content-dsh-plugin`.
- The development DSH profile was rebuilt and contains the Content plugin bundle.
- Focused Content, Agent Runtime, Desktop Host, plugin, typecheck, and strict OpenSpec tests pass.

## Residual risk

`read-images` currently returns bounded document image metadata through the ACP JSON path. Native image bytes remain the DSH attachment/provider responsibility and require a separate real image-capable provider/UI acceptance before being considered complete.

The pre-DSH Agent Evaluation fixtures that still mention `ReadDocument` or `ReadImage` are historical migration cases, not acceptance evidence for this change. They require a separate suite retirement or canonical DSH case rewrite.
