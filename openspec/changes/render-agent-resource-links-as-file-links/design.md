## Context

Desktop sends selected Workspace references as ACP `resource_link` blocks. DSH rc.7 has no native
provider-neutral resource content block, so the bridge currently converts each link to a text line
containing its name and encoded URI. DSH persists that line and the replay path renders it as ordinary
user text. The existing replacement design explicitly forbids this pseudo-text degradation.

### Five-layer analysis

- **Responsibility:** Desktop owns `ContentLocator` validation and turn-context assembly; the bridge
  owns protocol adaptation; Agent Runtime owns event projection; Agent Webview owns presentation.
- **Dependencies:** DSH remains unaware of `@neko/content`; Renderer receives validated locators but
  no raw URI or filesystem path; Main retains the trust-boundary conversion.
- **Interfaces:** one DSH user message source carries an ordered bounded display block list; ACP emits
  the same ordered blocks; Desktop converts resource URIs into canonical resource blocks.
- **Extension:** future ACP content kinds require an explicit contract addition and renderer. Unknown
  kinds fail visibly instead of entering a wildcard/default renderer.
- **Testing:** bridge tests prove no pseudo text; projection tests prove ordered multi-frame assembly;
  contract/Desktop tests prove URI validation; Webview tests prove filename-only presentation.

## Goals / Non-Goals

**Goals:**

- Render a selected file as its filename rather than ACP protocol text.
- Preserve one structured resource identity across live events and Session replay.
- Keep exact selected resources available to the model through the existing turn-context owner.
- Reuse the existing Agent message row and theme tokens.

**Non-Goals:**

- Parsing or repairing existing pseudo-text transcript entries.
- Introducing another message component, Markdown extension, resource catalog, or navigation owner.
- Opening arbitrary Workspace files from the transcript before a canonical Workspace navigation port
  exists; this change presents a resource link without inventing an invalid click-success path.
- Adding DSH-native document, audio, or video content blocks.

## Decisions

### 1. Preserve display blocks in DSH message source

The bridge stores only bounded user-visible text and `resource_link` metadata in an OpenNeko-owned
field on the DSH user message source. Model-facing content contains the user's text/images supported
by DSH; selected resource identity is injected through the exact turn context before prompt. A
resource-only prompt uses a fixed neutral request sentence for DSH while replay uses only the
structured display blocks. Encoded resource URIs never become model-visible or transcript text.

### 2. Assemble one user event by DSH message identity

ACP permits one content block per `session/update`, so the bridge emits ordered frames with the same
message identity and sequence. `@neko/agent-runtime` assembles those frames into one bounded user
message event. It does not concatenate resources into Markdown or create multiple chat bubbles.

### 3. Validate resource identity in Desktop Main

The bridge treats the URI as ACP protocol data. Desktop Main accepts only the private
`openneko-content:` scheme, decodes exactly one JSON value, validates it with `@neko/content`, and
projects a canonical `ContentLocator`. Invalid resources produce a local diagnostic and do not erase
valid sibling events. Renderer never receives the encoded URI.

### 4. Reuse the existing user message row and reference token

The Agent Webview renders ordered text and resource blocks inside the existing user bubble. Resource
blocks use the existing `ReferenceToken` component with the same `attached` variant used by the
composer file-reference preview, so selected and submitted resources have one visual language.
No new chat row, card, link treatment, or Markdown parser is introduced.

## Agent Evaluation Disposition

- **Decision:** excluded for this presentation-only change after deterministic path validation.
- **Reason:** resource selection, provider/model choice, Tool registration and routing are unchanged;
  deterministic bridge/projection tests prove that the same prompt reaches the canonical DSH path
  and that only its presentation metadata changes. A visible Desktop UI run is still required for
  the user-facing rendering claim.
- **Forbidden fallback:** parsing `[resource_link ...]` text in Runtime or Webview.

## User Data

No existing DSH Session or user content is migrated. New messages use the canonical structured source
shape. Existing pseudo-text entries remain visible as historical data rather than being silently
rewritten or heuristically reinterpreted.

## Risks / Trade-offs

- DSH source metadata is an OpenNeko extension and therefore requires strict replay validation.
- Historical messages keep their old text until the user creates a new turn; this avoids an unsafe
  migration and makes the behavior boundary visible.
- Click-to-open remains unavailable until Workspace navigation exposes an exact locator-based public
  port; visual presentation must not pretend that navigation succeeded.
