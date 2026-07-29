## 1. Theme contract and tokens

- [x] 1.1 Extend the Desktop theme adapter with semantic native window, chrome, surface, elevated, overlay, control, focus, radius, and shadow tokens, including light-theme compatibility mappings and focused tests.
- [x] 1.2 Replace repeated Desktop renderer window and chrome colors with the shared token contract, and add regression coverage that keeps Desktop styling independent from VS Code editor chrome.

## 2. Workbench surfaces

- [x] 2.1 Restyle the Desktop root, compact primary rail, Main frame, dock frames, resize handles, and overlays with native spacing, radii, and elevation while preserving the controlled workbench slots.
- [x] 2.2 Restyle the layout menu, icon buttons, Agent dock host, Resource dock host, diagnostics, and Home controls with consistent desktop density and interaction states.
- [x] 2.3 Add narrow-window, high-contrast, reduced-transparency, and reduced-motion rules without changing panel ownership or Main minimum sizing.

## 3. Package integration and validation

- [x] 3.1 Verify that the public Agent, Canvas, and Assets roots consume the projected shared theme while preserving package-owned commands and toolbars; add focused integration coverage.
- [x] 3.2 Run focused Desktop, Assets, Agent, and Canvas tests, typecheck, production package build, boundary checks, strict OpenSpec validation, and diff checks.
- [x] 3.3 Run packaged Electron visual scenarios for Home and Canvas + Agent + Resource layouts, and record visual evidence and residual risks.

## 4. System light and dark appearance

- [x] 4.1 Replace the light-only renderer entry with one system theme controller that projects shared, Desktop and compatibility tokens for light and dark and reacts to operating-system changes.
- [x] 4.2 Synchronize Electron BrowserWindow startup/update background with `nativeTheme` and add lifecycle-focused tests.
- [x] 4.3 Replace Desktop shell light-only colors with semantic theme tokens and prove public Agent, Canvas and Assets Roots retain their package-owned behavior in both appearances.
- [x] 4.4 Run focused/full Desktop tests and typecheck, affected package tests, production Electron packaging, strict OpenSpec validation, `git diff --check`, and isolated `/Users/feng/Git/neko-test` visual scenarios in light and dark.
