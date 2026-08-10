## 1. Composer Measurement

- [x] 1.1 Update `InputArea` textarea measurement so CSS owns the responsive height cap and the DOM exposes a precise overflowing state.
- [x] 1.2 Preserve the existing controlled-draft path for input, paste, deletion, restoration, send, and clear without adding a second sizing owner.

## 2. Composer Presentation

- [x] 2.1 Increase the textarea maximum to a bounded responsive height while retaining the compact default and disabled manual resize.
- [x] 2.2 Add a stable, themed thin scrollbar that activates only for content beyond the responsive maximum.

## 3. Verification

- [x] 3.1 Add focused tests for intermediate growth, capped overflow, overflow removal after shrink, and default-height reset after clear.
- [x] 3.2 Run `pnpm --filter @neko/agent-webview test`, `pnpm --filter @neko/agent-webview build`, and `openspec validate improve-agent-composer-autogrow --strict`.
- [x] 3.3 Use `neko-ui-validation` in the real Electron Desktop for short, growing, overflowing, shrinking, pasted, and narrow-panel states.
- [x] 3.4 Use `neko-quality-review` to inspect L2 ownership, canonical-path evidence, adjacent composer behavior, and residual risk.
