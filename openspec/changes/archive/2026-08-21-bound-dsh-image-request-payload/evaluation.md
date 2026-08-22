# Agent Evaluation Evidence

- Disposition: **reuse** `agent-runtime.perception-routing/content-locator-document-images` for the canonical document-image path.
- The 12 MiB setting is a provider-profile materialization rule, not an Agent prompt, Tool, routing, or Session-lifecycle change. A new textual scenario would not prove DSH request-only oldest-first offload; that behavior belongs to the third-party `llm-pi-ai` request materializer.
- `pnpm test:agent:eval` passed with 45 files, 314 tests, 26 suites, and 67 dry-run cases.
- Deterministic producer tests prove every materialized OpenNeko provider profile carries the same `12 * 1024 * 1024` byte budget while existing provider-local diagnostics remain intact.
- Not run: a paid provider request intentionally exceeding 12 MiB. No explicit model-cost authorization was supplied. The residual behavior is bounded to DSH's public `maxRequestImageBytes` option and does not alter durable Session attachments, locators, or source files.
