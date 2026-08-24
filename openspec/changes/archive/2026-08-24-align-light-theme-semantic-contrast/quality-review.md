## Quality review

### Risk classification

- Level: L2 presentation change across one shared UI primitive and three Webview consumers.
- User impact: visible theme contrast only.
- Data/runtime impact: none; no durable record, IPC, provider, task or resource lifecycle changed.

### Review findings

No blocking finding in the scoped change.

- Architecture ownership remains unchanged: Desktop projects theme values, `@neko/ui` owns shared primitives, and each Webview owns its presentation selectors.
- Existing canonical `--neko-button-*` and `--neko-fg-*` tokens are reused; no parallel theme owner, contract or token family was introduced.
- Shared Button/IconButton were corrected at the foundation. Character/World domain selectors were retained because replacing their React structures would mix a layout refactor into this defect fix.
- Style-contract tests assert the canonical semantic path and prevent the previous accent/muted consumption from silently returning.
- Repository-wide boundary/typecheck blockers are confined to unrelated concurrent work and are recorded in `verification.md`.

### Residual risk

- Other Webviews not present in the reported screenshots may contain independent over-muted styles and require evidence-driven follow-up rather than broad global overrides.
- A dark-theme visual smoke-check should remain in release acceptance, although this change does not alter dark-theme token values.
