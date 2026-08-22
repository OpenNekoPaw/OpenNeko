## Context

`@neko/agent-webview` renders the composer with a controlled `<textarea>`. `InputArea` already measures `scrollHeight` on direct input and controlled draft changes, but both TypeScript and CSS cap the result at `120px`. After that cap, Chromium falls back to the operating system scrollbar, which is transient on macOS and leaves long drafts looking clipped.

The owning responsibility is the L2 Agent Webview presentation. The canonical path remains `ChatWorkspace controlled draft -> InputArea -> textarea measurement`. The producer is the controlled `inputValue`; the consumer is the browser textarea. No Desktop, preload, Agent runtime, persistence, or user-data boundary changes.

## Goals / Non-Goals

**Goals:**

- Preserve a compact `48px` default height.
- Grow with content up to a responsive maximum that leaves useful transcript space.
- Expose a clear, themed internal scrollbar only after the maximum is reached.
- Shrink after deletion and reset after clearing or sending.
- Keep pasted and programmatically restored drafts on the same canonical measurement path.

**Non-Goals:**

- No user-resizable textarea handle.
- No unbounded composer growth.
- No draft persistence, keyboard, mention, queue, attachment, or send behavior changes.
- No new global store, observer service, IPC, or reusable layout framework.

## Decisions

### 1. Bounded auto-growth followed by internal scrolling

The textarea retains a `48px` minimum and grows to `min(240px, 35vh)`. At a 20px line height this exposes roughly twelve unwrapped lines on a normal Desktop window while protecting the transcript on shorter windows. Content beyond the computed maximum scrolls inside the textarea.

Scrollbar-only behavior was rejected because it preserves the current cramped editing window. Unbounded growth was rejected because a pasted prompt could displace the transcript and composer controls.

### 2. CSS owns the height budget; InputArea owns measurement

CSS defines the minimum and responsive maximum. The existing `resizeTextarea` function resets height, applies the measured `scrollHeight`, and records whether `scrollHeight` still exceeds the resulting `clientHeight`. This removes the duplicated `120px` constant and avoids React state for a DOM-owned presentation measurement.

The overflow marker drives `overflow-y: auto`; otherwise overflow remains hidden. The same helper continues to run from direct input and `useLayoutEffect`, so paste, controlled restoration, deletion, and clear use one path.

### 3. Themed thin scrollbar with stable content width

The textarea reserves a narrow scrollbar gutter and uses existing Agent foreground tokens for a subtle thumb. No package-local theme system or new color contract is introduced. Manual resizing remains disabled.

## Risks / Trade-offs

- [A taller composer can reduce transcript space on short windows] -> Cap height with both a pixel and viewport-height budget and validate the narrow Desktop rail.
- [Measuring `clientHeight` is browser-owned and incomplete in jsdom] -> Keep the helper DOM-local and mock the relevant layout metrics in focused component tests.
- [Composer growth can shift the message viewport] -> Validate bottom anchoring and ensure no new conversation scroll owner is introduced.
- [Styled scrollbars vary across platforms] -> Retain standards-based scrollbar properties plus Chromium WebKit selectors; functional scrolling does not depend on the decorative styling.
