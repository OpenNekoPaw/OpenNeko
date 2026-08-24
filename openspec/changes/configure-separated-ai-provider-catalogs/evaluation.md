## Disposition

- Reuse `agent-runtime.model-binding` for exact dialogue Provider/model binding.
- Reuse `agent-runtime.creative-media-workflow` for purpose-qualified generation binding and artifact flow.
- No new suite or product evaluation path is required: this change only modifies the canonical settings catalog and
  the existing DSH/Generation consumers remain authoritative.

## Evidence

- `pnpm test:agent:eval` passed: 45 files and 314 tests.
- All-suite key-free dry run passed: 27 suites and 84 cases.
- Focused Host tests prove that MiniMax/ByteDance generation records do not acquire a DSH protocol, exact model
  templates are required where the preset disallows custom models, and an unavailable exact model does not fall
  through to another Provider.

## Real-provider status

MiniMax H3 and Seedance paid API execution was not run. This task did not receive explicit paid-use authorization,
and evaluation must not read or project credentials outside the product configuration owner. The real-provider lane
is therefore `infrastructure-blocked`; key-free evidence is only harness and contract readiness, not model behavior
acceptance.
