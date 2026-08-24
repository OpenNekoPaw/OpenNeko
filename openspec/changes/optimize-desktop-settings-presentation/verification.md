## Verification Summary

Risk classification: L2 Desktop composition and Host Scene contract retirement. The Host-owned preferences projection, update contract, native theme application and advanced Agent configuration path are unchanged.

## Automated Evidence

- Focused Host/Desktop/Agent/Professional Applications suite: 222/222 passed.
- Desktop, Host, Agent Webview and Professional Applications Webview typechecks: passed.
- Focused ESLint: passed.
- Application, Webview and package-role boundary checks: passed.
- `pnpm check:openspec`: 155/155 passed.
- `git diff --check`: passed.

## Real Electron UI Evidence

The existing visible OpenNeko Electron development instance was inspected directly after Vite hot reload:

- Settings opened as a modal Dialog with backdrop over the active Extension Scene; the Skill grid remained visibly mounted below it.
- General and Appearance sections switched inside the overlay without a Scene transition or persisted preference mutation.
- close button and Escape both dismissed the overlay; the exact selected Skill mode and background Scene remained available.
- title and description rendered only in the Dialog header; navigation, setting rows and controls remained readable inside the bounded two-column layout.

Full dark-theme and synthetic narrow-viewport screenshot checks were not run because changing the user's persisted theme or Window geometry was outside this validation's mutation scope. Narrow layout and theme-token use are covered by focused style assertions.

## Density Correction Evidence

- The Settings search control now overrides the shared catalog search flex basis with a fixed 36px navigation-axis size; four category rows remain immediately below it in a tall overlay.
- General and Appearance sections were inspected in the running Electron development application. The current section fills the content column, uses a quiet 1px border with no surface shadow, and keeps rows at compact readable density.
- Opening Settings, switching to Appearance, and closing the Dialog left the active Agent conversation Scene mounted and unchanged.
- Focused `renderer-styles` and `DesktopSettingsSurface` tests passed (37/37), Desktop typecheck passed, `pnpm check:openspec` passed (157/157), and `git diff --check` passed.
- The production BrowserWindow minimum width is 960px, so the `max-width: 720px` branch cannot be reached through supported Window resizing; its stacking contract remains covered by the focused stylesheet assertion.

## Dialog Size Correction Evidence

- Root cause: the shared `Dialog` primitive's `520px` confirmation-dialog width and the former Settings width had equal selector specificity. The generated utility rule won, so Settings rendered as an unintended 520×620px portrait panel in large Desktop windows.
- Settings now uses the more specific `[role='dialog'].desktop-settings-overlay` selector with a bounded 1040×680px landscape size, still capped by 64px viewport margins. The narrow-window override uses the same specificity, preventing the wide rule from masking the responsive branch.
- The visible Electron runtime showed the corrected landscape overlay over the existing Asset Center scene. General, Appearance & Language, Creative Workspace and Agent sections all stayed readable in the same two-column dialog, with controls contained and no outer-page scroll dependency.
- Switching all four sections and closing through the visible close action completed successfully; the exact Asset Center scene remained mounted and visible after close.
- Focused Desktop Settings/Application/style tests passed (90/90), Desktop typecheck passed, `pnpm check:openspec` passed (157/157), and `git diff --check` passed.

## Window-Adaptive Overlay Evidence

- Replaced the fixed `1040×680px` Settings canvas with a `16–40px` Window-relative safety margin. Width and height now consume the remaining viewport independently, with `1440×960px` useful-workspace caps for very large windows.
- The shared Dialog header/body grid remains the only layout path. Navigation and Main content retain their independent scroll owners; no Window size, overlay geometry or section selection is persisted.
- Visible Electron validation covered the large-window capped state and a resized minimum-height-near state over an active Asset Center media Preview. The overlay kept visible margins on every edge, filled the usable vertical space, retained the close control, and contained General and Agent content without clipping or horizontal overflow.
- Closing Settings restored the exact selected media item and Preview scene, confirming that responsive resizing did not change overlay ownership or background Scene identity.
- Focused Settings/style tests passed (37/37), Desktop typecheck passed, strict OpenSpec validation passed, and `git diff --check` passed.

Residual visual risk: dark-theme pixels were not re-inspected because this change only uses existing surface, border and backdrop tokens. The unreachable sub-720px stylesheet branch remains contract-covered; the production BrowserWindow minimum is 960×640px.

## Visual Header Removal Evidence

- The shared Dialog title and description remain mounted and were present in the visible Electron accessibility tree, but their wrapper now uses the standard visually-hidden geometry and no longer occupies a rendered header row.
- Settings uses one full-height body row. Navigation and the current section begin at the overlay's top edge, while the existing close action remains independently visible in the top-right corner.
- General and Agent sections were opened and inspected in the real Electron overlay over Asset Center. No duplicate Settings title, product description, residual divider or empty header band was visible; content did not collide with the close action.
- Closing the overlay returned to the same Asset Center scene. Focused Settings/style tests passed (37/37), Desktop typecheck passed, strict OpenSpec validation passed, and `git diff --check` passed.

Residual visual risk remains limited to dark-theme pixels; the hidden header uses no color-dependent presentation.

## Quality Review

No blocking finding. Settings is now a single Renderer-owned overlay path; the retired Host Scene context, refs and intent have no remaining production references. Update failure remains fail-visible and local. Residual risk is limited to unobserved dark-theme pixels and the narrow responsive branch, which is stylesheet-assertion-covered but cannot be reached through the production Window's 960px minimum width.

## Provider Directory Split Evidence

Acceptance inventory:

- Agent settings presents exactly two direct sibling directories: Dialogue Provider and Generation Provider.
- Each directory owns its own add action; a new Provider persists that directory's exact `supported_model_families` value through the canonical Host configuration authority.
- There is no outer Provider management panel, shared add action, mixed directory or pending/unconfigured directory.
- Local Ollama is dialogue-only and credential-free. Existing Providers without explicit family metadata are projected from their configured models; an empty existing Provider uses the canonical dialogue default instead of creating a third directory.
- Every config-backed Provider exposes deletion on the Provider card with explicit confirmation. Host rejects Providers that still own models, removes exact empty Providers and delegates credential cleanup to the credential authority with configuration restoration on cleanup failure. TOML-only preset metadata does not hide the action or create a second Provider catalog.

Automated evidence:

- AI contracts, Host contract/service/config parsing/export/template and Desktop Settings focused suites: 96/96 passed. The broader renderer stylesheet suite has one unrelated pre-existing assertion mismatch in the dirty worktree (`management-search-field` expects `flex: 1 1 100%`, current unrelated style is `flex: 1 1 auto`).
- AI contracts, Host and Desktop typechecks: passed.
- Focused ESLint, `git diff --check`, application boundaries and strict OpenSpec validation: passed.
- Package dependency boundaries passed; the composed package-boundary command then stopped on an unrelated existing product-status finding for unreachable `@neko/agent-dsh-plugin`.
- The repository-wide no-internal-versioning gate remains blocked by unrelated dirty-worktree stale allowances and 97 pre-existing findings; the changed contracts introduce no internal generation/version dispatch.

Visible Electron validation was attempted with the authoritative `desktop-ai-model-settings` development scenario. The isolated application could not start because Desktop process `74442` already owns this checkout's Vite bundle. The runner failed visibly before CDP interaction and preserved the report at `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-24T04-26-16.469Z-desktop-ai-model-settings-development/report.json`; the existing process was not interrupted. The scenario itself now asserts exactly two directories, two per-directory add actions, no outer management wrapper, local dialogue-only behavior, direct card deletion and post-delete projection.

Residual risk: new Provider-directory pixels and direct-delete confirmation have not been inspected in a fresh Electron process because of the active bundle owner. Component DOM behavior and responsive structure are covered by focused tests; visual acceptance should be rerun after process `74442` exits naturally.

## Canonical Provider Deletion Evidence

- The strict Renderer projection no longer contains `builtin`; config-only preset metadata is rejected as an
  unknown projection field.
- Focused contract/service/ConfigManager/Desktop runtime/Renderer tests passed 80/80 and prove every config-backed
  Provider exposes deletion, Providers with models remain protected, and edit/delete operations persist through
  the single `config.toml` authority while credentials remain owned by `ProviderCredentialAuthority`.
- The updated isolated Electron scenario also verifies post-delete TOML content, but its current run was blocked
  before launch by existing Desktop process `95583`. Report:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-24T12-27-21.934Z-desktop-ai-model-settings-development/report.json`.
