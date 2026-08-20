# W7 Exact Scene Recovery And Image Input Evidence

Date: 2026-08-20

## Scope

- Close deterministic P1 gaps in exact Window scene restoration and native DSH image prompting.
- Preserve the accepted `@neko/agent-webview` presentation. This slice does not change Webview JSX, CSS,
  layout, component selection, or attachment-control state.
- Keep retired Pi storage unreachable from normal product execution.

## Exact Scene Recovery

- Persisted Character and Assistant/Workspace Conversation scenes are now qualified against the exact
  Home catalog record, owner identity, Conversation context and DSH binding.
- A matching catalog record carrying `conversation-runtime-unavailable` no longer qualifies as a
  restorable scene. Only that Surface returns to its same-owner Draft state.
- The unavailable durable record remains visible with its diagnostic, and valid sibling records remain
  available. No first/recent Conversation selection, replacement Session or active-Workspace fallback is
  introduced.

Deterministic Host verification passed: `desktop-shell-service.test.ts`, 1 file / 60 tests. The new
application-reopen case proves exact unavailable-record rejection, same-owner Draft reset and sibling/catalog
preservation. The package TypeScript check passed. A real Electron process-restart lane is still required
before task 7.10 can be closed.

## Native Image Prompt Slice

- Desktop provider projection derives DSH model `input` strictly from the selected product model's explicit
  `vision`, `llm.vision` or `image.understand` capability. Text-only models remain `input: ["text"]`.
- The exact Conversation context supplies the Workspace grant. Desktop restores that grant for the sender's
  Window, accepts only Workspace-file locators, authorizes each resource through `ContentReadService`, and
  rejects Assistant-space or cross-authority references.
- PNG, JPEG, WebP and GIF bytes are decoded and checked against their declared MIME. Each source is bounded
  before read, normalized to the existing long-edge/payload limits when needed, and the complete image batch
  is bounded before any Prompt is published.
- A supported image produces its existing ACP resource link followed by one native ACP image block. The
  resource link preserves exact display/source identity while DSH attachment admission owns durable image
  persistence. Image-only submission does not invent a text placeholder.
- A text-only selected model, missing resource, MIME mismatch, undecodable image or oversized batch rejects
  only the current submit request. No provider switch, text fallback, partial Prompt, raw path or bearer URL
  is emitted.

Focused deterministic verification passed:

- Desktop provider/composer/image-admission/Session Host: 4 files / 31 tests.
- Agent runtime image normalization: 1 file / 3 tests.
- Host exact scene recovery: 1 file / 60 tests.
- Content Workspace MIME projection: 1 file / 7 tests.
- DSH bridge native image admission: 1 file / 6 tests.
- Desktop, Agent runtime, Content and Host TypeScript checks.
- Agent, application, package and storage-authority boundary gates.
- Strict `replace-pi-with-dsh-runtime-atomically` OpenSpec validation, focused ESLint and
  `git diff --check`.

The retained attachment button remains unchanged under the explicit Webview UI boundary. Selection through
the existing authorized `@` resource path is implemented, but attachment-control wiring, a real DSH process
restart proving attachment replay, and a provider-backed visible Electron image turn remain outstanding.
Therefore task 7.14 remains open.

## Pi-only Data Boundary

The audit reconfirmed that normal product code has no authorized source for discovering Pi-only metadata
without opening retired storage. This slice does not add a retired reader, migration, compatibility route or
fallback. Task 8.4 remains blocked on a canonical non-retired metadata authority; the existing byte-preserving
legacy-data evidence and release guard remain authoritative.
