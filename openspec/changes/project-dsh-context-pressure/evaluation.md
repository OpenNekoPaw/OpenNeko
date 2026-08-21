# Agent Evaluation Evidence

- Disposition: **reuse** `agent-runtime.perception-routing/content-locator-document-images`.
- Rationale: this change does not alter prompt composition, Tool routing, model selection, image admission, or the durable attachment path. The existing scenario remains the canonical real-Agent path for document images; context pressure is a deterministic DSH Session projection consumed after that path runs.
- Key-free gate: `pnpm test:agent:eval` passed with 45 files, 314 tests, 26 suites, and 67 dry-run cases, including authoring validation for `content-locator-document-images`.
- Focused deterministic evidence covers the new behavior at each producer/consumer boundary: DSH projection snapshot carrier, strict ACP decode, exact-session projection ordering/isolation, Desktop Session projection, and existing Webview usage indicator.
- Not run: provider-backed or visible Desktop Agent execution. No explicit model-cost authorization was supplied, and the current evaluation assertion catalog does not claim tooltip pixels or DSH token-meter values. Key-free results therefore do not count as real model/UI behavior acceptance.
