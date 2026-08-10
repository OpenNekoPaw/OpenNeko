## 1. Canonical Copy Projection

- [x] 1.1 Add a package-local pure presenter that projects copyable text from the same plain or structured message content rendered by the transcript.
- [x] 1.2 Add presenter tests proving final Markdown answers are copied in order while hidden thinking, tools, chrome, and empty structured messages are excluded.

## 2. Conversation Presentation

- [x] 2.1 Refine `MessageItem` so user prompts retain a compact neutral container, Agent answers remain unframed, errors use a Codex-like inline diagnostic, and existing avatar/name/time structure is preserved.
- [x] 2.2 Replace the bordered error card with a localized accessible inline diagnostic and add responsive semantic styles using existing theme tokens.
- [x] 2.3 Update message actions to use the canonical copy projection, hide unavailable Copy actions, and expose localized copied/copy-failed states without adding a second clipboard path.
- [x] 2.4 Authorize only same-origin `clipboard-sanitized-write` for the exact Desktop renderer WebContents while keeping all other permission requests denied.

## 3. Verification

- [x] 3.1 Add or update Agent Webview component tests for role hierarchy, error alert semantics, structured reply copying, no-copy behavior, and clipboard rejection feedback.
- [x] 3.2 Run `pnpm --filter @neko/agent-webview test` and `pnpm --filter @neko/agent-webview build`, recording any unrelated failures.
- [x] 3.3 Run `openspec validate refine-agent-conversation-presentation --strict`, verify the replaced direct `message.content` copy path is absent, and document residual risk.
- [x] 3.4 Use `neko-ui-validation` against the authoritative Desktop runtime at desktop and narrow panel widths, validating input, output, processing, error, hover/focus actions, copy success, and copy failure evidence.
- [x] 3.5 Use `neko-quality-review` to classify risk, inspect package boundaries, and confirm the required quality gates before delivery.
