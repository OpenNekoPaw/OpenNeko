## Why

Agent native `Write` already persists an exact bound content document, but the composed Turn prompt does not clearly require ordinary plans, copy drafts and documents to cross that existing authoring boundary. A model can therefore return reviewable chat content and describe it as saved without an exact successful file mutation.

## What Changes

- Compose explicit durable-document handoff guidance into every Turn: only a current Tool list containing `Write` plus an exact authorized `content-document` target permits file delivery.
- Require approval and an exact successful `Write` result before the Agent reports a Workspace-relative document as saved.
- When `Write` is absent, require a concise missing-authority diagnostic and prohibit active/current/recent Project inference or chat/artifact content being described as persisted.
- Preserve the existing receipt-bound writer and add path-level Prompt, Tool-routing, facts and Agent Evaluation coverage without changing UI or Project creation.

## Capabilities

### New Capabilities

- `agent-content-document-handoff`: Defines truthful ordinary-document handoff through the canonical exact-target Agent authoring path.

### Modified Capabilities

None.

## Impact

- `@neko/agent-runtime` owns base Prompt protocol, immutable Turn composition, exact receipt-bound Tool admission and final effective-Prompt facts.
- `apps/neko-desktop` only projects runtime facts; it does not gain an entry, target selector, document creator or writer.
- Existing Project, Content, preload, Renderer and Webview contracts remain unchanged.
