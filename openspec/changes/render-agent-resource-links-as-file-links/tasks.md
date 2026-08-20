## 1. Contract And Protocol Projection

- [x] 1.1 Preserve ordered text/resource display blocks in the DSH user-message source and remove the
      model-visible `resource_link` pseudo-text serialization.
- [x] 1.2 Assemble ordered ACP user-message frames by exact Session/message identity in
      `@neko/agent-runtime` with bounded, fail-visible validation.
- [x] 1.3 Add a canonical Desktop user-message block contract carrying validated `ContentLocator`
      values and update all producer/consumer fixtures atomically.

## 2. Turn Context And Desktop Boundary

- [x] 2.1 Add exact selected Workspace resources to the existing Conversation turn-context resolver
      before prompt admission, without another context owner or active/recent Workspace fallback.
- [x] 2.2 Decode the private ACP resource URI in Desktop Main and isolate malformed resources to a
      local diagnostic while preserving valid sibling events.

## 3. Existing UI Component Rendering

- [x] 3.1 Extend the existing DSH user-message row to render ordered text and the shared compact
      filename reference token using existing theme/layout tokens; do not add a second message
      component or outer container.
- [x] 3.2 Add Webview tests for text/resource order, Unicode and long names, resource-only messages,
      and absence of protocol/URI text.
- [x] 3.3 Reuse the existing `ReferenceToken` component and `attached` variant for both composer
      selections and submitted user-message resources; remove the duplicate message-only styling.

## 4. Validation

- [x] 4.1 Run focused bridge, Agent Runtime/Contracts/Webview and Desktop Main/preload/Renderer tests
      plus package typechecks and strict OpenSpec validation.
- [x] 4.2 Run a visible Desktop UI check for a new resource-only and mixed-content turn in light theme,
      inspect pixels directly, and record any blocked dark/narrow states as residual risk.
- [x] 4.3 Run `neko-quality-review`, scan for pseudo-text/fallback paths, and record validation commands
      and residual risks.

## Validation Record

- Visible Desktop, light theme: mixed text/resource and resource-only turns render inside the existing
  user bubble as the same rounded reference token used by the composer. The accessibility projection
  contains no private URI or Workspace path for either new message, and direct pixel inspection found
  no overflow or extra card.
- Historical pseudo-text messages remain unchanged by design and visibly distinguish the old data
  boundary from new canonical messages.
- Dark-theme and narrow-width runtime screenshots were not exercised in this change. Webview tests
  cover long Unicode wrapping and shared theme tokens; dark/narrow visual behavior remains residual
  presentation risk.
- Agent Evaluation is excluded according to `design.md`: provider, Tool routing and Session behavior
  are unchanged, while deterministic bridge/projection tests and visible Desktop validation cover the
  modified path.
