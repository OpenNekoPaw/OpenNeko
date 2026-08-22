## Why

`@neko/generation` media execution owns two disjoint runtime stacks: the AI SDK stack
(`resolveProvider` in `@neko/ai-sdk` handles `openai`, `newapi`, `oneapi`, `generic`, `xai`, `kling`)
and the polling MediaAdapter stack (`runway`, `luma`, `minimax`, `liblib`, `suno`, `vidu`, `midjourney`,
`fal`, `dashscope`). The executor dispatches by checking the AI SDK first and only then the MediaAdapter
registry. On top of that, `createMediaPlatform` also registers the `OpenAICompatMediaAdapter` under the
five AI SDK types, so those five types are reachable through two stacks: the MediaAdapter registration is
shadowed during generation but still used by `describeExternalTask`/`cancelExternalTask`, producing two
inconsistent success paths for the same provider type. This violates the single canonical path rule.

## What Changes

- Give every real provider type exactly one canonical media executor: AI SDK types
  (`openai`, `newapi`, `oneapi`, `generic`, `xai`, `kling`) execute only through the AI SDK; MediaAdapter
  types (`runway`, `luma`, `minimax`, `liblib`, `suno`, `vidu`, `midjourney`, `fal`, `dashscope`) execute
  only through their polling adapter. Types with no owning runtime fail visibly.
- Delete the shadowed `OpenAICompatMediaAdapter` and its five registrations; delete the now-dead
  `BaseRegistry` generic base class and its custom tier, inlining the single `MediaAdapterRegistry` as a
  one-tier exact-identity map.
- Keep real download, authorization, credentials, HTTP/timeout, abort, and third-party protocol logic.
  Keep bounded external retry semantics inside each canonical executor; no request switches
  provider/source/contract/stack after a canonical failure.
- Add path-level tests that the MediaAdapter registry no longer owns AI SDK types, that a MediaAdapter
  provider hits its canonical adapter and does not fall back to the AI SDK stack on failure, and that
  explicit provider/model selection is never rewritten.

## Capabilities

### New Capabilities

- `generation-single-execution-stack`: Each provider type has one canonical media executor; the AI SDK and
  MediaAdapter stacks are disjoint and no type is reachable through two stacks.

### Modified Capabilities

<!-- None. -->

## Impact

- Owning responsibility: `@neko/generation` keeps media execution; `@neko/ai-sdk` keeps the AI SDK
  provider resolution boundary; `@neko/ai-contracts` keeps provider type/config contracts.
- Affected package roles: `packages/generation` (media executor, adapter registry, platform factory,
  tests). No Host, Webview, Desktop, or Agent change. No user-data or provider config shape change.
