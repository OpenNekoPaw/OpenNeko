# Evaluation Evidence

- Deterministic contract, Host adapter, Desktop EPUB-entry, DSH plugin, and no-Pi-path tests pass.
- The plugin test transfers an image larger than one Host chunk and verifies exact byte assembly before `AttachmentStore.saveImage`.
- `agent-runtime.perception-routing/content-locator-document-images` now requires the Agent to read pixel-only codes from the synthetic EPUB through `openneko.document` and `openneko.read_image`.
- The full key-free Agent Evaluation suite passes: 45 files, 314 tests, 26 suites, and 67 dry-run cases.
- A user-driven visible Desktop run on `nekoapi-chat/gpt-5.6-luna` emitted ten image calls in one step. Eight document images reached durable native image results; an oversized cover failed with the expected DSH dimension diagnostic; the tenth call exposed a bounded Host queue overflow as a generic internal error.
- The regression fix declares the model-facing Content image Tool exclusive. Deterministic plugin coverage asserts this DSH scheduling contract; a post-fix visible rerun remains required to confirm all admissible images complete in the packaged runtime.
