# Evaluation Evidence

- Deterministic contract, Host adapter, Desktop EPUB-entry, DSH plugin, and no-Pi-path tests pass.
- The plugin test transfers an image larger than one Host chunk and verifies exact byte assembly before `AttachmentStore.saveImage`.
- `agent-runtime.perception-routing/content-locator-document-images` now requires the Agent to read pixel-only codes from the synthetic EPUB through `openneko.document` and `openneko.read_image`.
- The full key-free Agent Evaluation suite passes: 45 files, 314 tests, 26 suites, and 67 dry-run cases.
- A user-driven visible Desktop run on `nekoapi-chat/gpt-5.6-luna` emitted ten image calls in one step. Eight document images reached durable native image results; the 1511x2160 EPUB cover exposed the dimension-only limit, and the tenth call exposed a bounded Host queue overflow as a generic internal error.
- The Content image Tool remains exclusive at the model boundary. Dimension-only oversized images now produce a bounded perception attachment while the original source and locator stay authoritative; pixel-count and byte limits still fail visibly.
- The rebuilt staged DSH runtime processed the actual 341346-byte EPUB cover through the packaged plugin path: source 1511x2160, attachment 1399x2000, exact locator preserved. This is deterministic runtime evidence, not a real-provider or visible Desktop acceptance result.
- A post-fix visible Desktop rerun remains required to confirm the provider consumes the normalized attachment and the existing UI renders the successful Tool result.
