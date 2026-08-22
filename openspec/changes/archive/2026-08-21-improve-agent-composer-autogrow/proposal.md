## Why

Agent composer currently grows only to a hard-coded `120px` and then relies on the operating system's transient textarea scrollbar. Long prompts therefore appear clipped and provide no stable visual indication that more content is available, especially on macOS and in narrow Agent rails.

## What Changes

- Keep a compact default composer height for short prompts.
- Grow the textarea with its content until a responsive maximum height is reached.
- Switch to an explicit, themed internal scrollbar only after content exceeds that maximum.
- Shrink the textarea again when content is deleted and restore the default height when the draft is cleared.
- Add focused component, style, and real Desktop UI validation for long paste, growth, overflow, shrink, and narrow-panel behavior.

## Capabilities

### New Capabilities

- `agent-composer-autogrow`: Defines the bounded auto-growth and overflow behavior of the Agent message composer.

### Modified Capabilities

None.

## Impact

- Owning responsibility: `@neko/agent-webview` owns the browser-only composer presentation and textarea measurement lifecycle.
- Package role: L2 Webview UI; no Desktop Main, preload, Agent runtime, or persistence behavior changes.
- Affected code: `InputArea`, Agent composer styles, and owning Webview tests.
- No public API, IPC contract, dependency, user-data shape, or draft ownership changes.
