## Verification

### Automated gates

- `@neko/host`: 37 files / 298 tests passed.
- Desktop focused UI suite: 3 files / 97 tests passed.
- Desktop Cut runtime: 1 file / 22 tests passed.
- Desktop TypeScript typecheck, focused ESLint, Prettier, `git diff --check`, and strict OpenSpec validation passed.

### Real Electron acceptance

The authoritative `desktop-workspace-resize` development scenario ran against an isolated real Electron fixture at the supported 1440 × 960 window size in the current light theme. Before the scenario reached its adjacent Cut-tab geometry check, it successfully asserted and captured:

- exactly three top-level Workspace controls: Agent, combined Main-plus-Cut, and Resources;
- the left-sidebar Agent icon, combined central layout icon, and right-sidebar Resources icon;
- Main and Cut checkable choices in one Popover;
- Cut-only as `empty-main + docked Cut`, with Agent hidden, retained Main refs unmounted, the canonical empty creative-document surface above Cut, and Resources unaffected;
- keyboard Enter opening the Popover, visible focus, and Escape closing it;
- restored Main above Cut, restored Agent, and hidden/restored Cut through the same canonical controls.

Directly inspected evidence:

- `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T22-07-05.339Z-desktop-workspace-resize-development/screenshots/11-workspace-layout-cut-only-empty-main.png`
- `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T22-07-05.339Z-desktop-workspace-resize-development/screenshots/12-workspace-layout-keyboard-popover.png`
- `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T22-07-05.339Z-desktop-workspace-resize-development/screenshots/13-workspace-layout-main-restored-with-cut.png`
- `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T22-07-05.339Z-desktop-workspace-resize-development/screenshots/14-workspace-layout-cut-hidden.png`

### Residual risk

- The same advisory scenario remains failed after all target acceptance steps because its pre-existing Cut add-control geometry expects a tab-to-add gap no greater than 8 px while the runtime measures 12 px. This is outside the Workspace-button change and remains fail-visible in the report.
- Dark/high-contrast themes were not executed; the Popover reuses existing semantic UI tokens, and focused style tests cover its hover/focus selectors.
