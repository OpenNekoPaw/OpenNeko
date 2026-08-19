## Decision

Retire the stale scenarios instead of renaming their assertions. The old cases assert Pi
Timeline/runtime facts and complex `ReadDocument`/`ReadImage` payloads that are not the DSH
contract. The canonical document contract remains covered by package, Host adapter, plugin,
Desktop handler, boundary, and OpenSpec tests already owned by `add-dsh-document-tool`.

The guard scans only active suite JSON and scenario JSON beneath
`scripts/agent-eval/suites`; historical OpenSpec evidence and migration notes may continue to
mention the retired names. A stale name in an active case is a hard failure, so a future DSH
case must be authored explicitly rather than silently using a legacy fixture.

## Retired cases

- `agent-runtime.stream-delivery`: `read-document-tool-result`, `directory-format-routing`,
  `document-image-native-delivery`, `locator-backed-display-projection`
- `agent-runtime.media-library-content`: `linked-media-search-read`,
  `direct-media-library-locator-rejected`
- `agent-runtime.creative-media-workflow`: `workspace-board-material-analysis`
- `agent-runtime.workflow-controller`: `media-tool-terminal-result`

These cases are not rewritten because doing so would require a separate DSH-native evaluation
design for domain tools, attachments, perception routing, and visible provider evidence.

The external and unavailable perception routes remain active OpenNeko-owned behavior. Their
negative standalone-image assertion now names DSH `read_image`. The current-image generation
case also remains active because it uses that name only as a forbidden visual-QA substitution.

The media-library suite has no remaining executable DSH-native case, so its coverage disposition
is `excluded` with deterministic Content decoder and Host delegation validation. This is not a
claim that real media-library Agent behavior has been accepted.
