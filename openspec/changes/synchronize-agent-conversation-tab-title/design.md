## Context

Pi conversation authority owns durable conversation metadata. `ConversationBridge` owns the
replaceable VS Code presentation of that metadata, while `ChatViewProvider` owns window-scoped,
revisioned `TabState`. The current first-message path updates conversation metadata inside the Pi
runtime and mutates the bridge projection, but never reconciles the independently persisted Tab
titles.

## Goals / Non-Goals

**Goals:**

- Make the first accepted user input establish one durable conversation title before dispatch.
- Synchronize every ordinary Tab bound to that conversation through the Host-owned TabState path.
- Preserve existing titles and role-session labels.
- Fail visibly if the conversation is missing or title persistence fails.

**Non-Goals:**

- No model-generated title, rename UI, title history or Webview-local title inference.
- No change to conversation or Tab identity.
- No compatibility message or parallel Tab store.

## Five-layer analysis

| Layer | Decision |
| --- | --- |
| Responsibility | Pi authority owns durable title; ConversationBridge owns its VS Code projection; ChatViewProvider owns Tab labels and revision persistence. |
| Dependency | Agent message runtime invokes one Extension preflight hook; no Webview-to-Extension contract change. |
| Interface | Add one focused async bridge operation and one internal title-change callback. |
| Extension | The callback updates all ordinary Tabs sharing a conversation identity and leaves role-owned Tabs unchanged. |
| Testing | Bridge persistence, turn preflight ordering, Provider TabState persistence/message projection and EDH visible label acceptance. |

## Decisions

### 1. Initialize title before message preparation

`runAgentMessageTurnRuntime.beforePrepareAgentTurn` is the existing canonical preflight seam shared by
Agent and direct media turns. The Extension calls the bridge there with exact `conversationId` and
raw visible user input. Persistence failure aborts dispatch instead of showing a title that was not
committed.

### 2. Keep TabState as the only Header label authority

ConversationBridge reports a committed title change to ChatViewProvider. The provider replaces the
title of every ordinary Tab with the same conversation identity, persists a new TabState revision and
posts that revision to the Webview. It does not mutate Character Dialogue or Embody Character labels.

Alternative rejected: updating the active React Tab from the submitted input. That creates a second
title owner, misses background/duplicate bindings and can diverge after reload.

### 3. Preserve non-default titles

Only the exact default title `New conversation` is initialized. Existing catalog titles, including
user- or runtime-assigned names, are not overwritten. Empty input retains the default title.

## Migration Plan

No schema migration is required. Existing stale open Tab labels are reconciled when the conversation
catalog reports a title change or when the next first-message initialization occurs.

## Risks / Trade-offs

- A title write adds one local metadata operation before dispatch. It is intentionally awaited so the
  Header cannot claim a title update that failed to persist.
- Multiple Tabs may bind one conversation. Updating all matching ordinary Tabs preserves identity
  consistency instead of relying on active selection.
