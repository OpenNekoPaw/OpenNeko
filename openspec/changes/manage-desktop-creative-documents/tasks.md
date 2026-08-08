## 1. Freeze contracts and owner boundaries

- [x] 1.1 Establish `@neko/content/project-file-io` as the canonical owner of workspace-entry create
      and creative-document lifecycle contracts; document Assets presentation/projection ownership,
      Canvas/Cut byte ownership, and Desktop Application-boundary responsibilities.
- [x] 1.2 Define strict ordinary-file, directory, Canvas, Cut, and open
      request/result/diagnostic contracts with explicit Project/Workspace/Window/endpoint/request,
      target-directory, and Resource Browser owner/projection identities.
- [x] 1.3 Remove `content.import-files` and its picker/copy contract from Assets, Main, preload, and
      renderer; add poison tests proving a forged or stale import request cannot open a picker or mutate
      either source or Workspace files.
- [x] 1.4 Extend Resource Browser contracts with immutable create capabilities, inline naming state,
      observation/reconciliation diagnostics, and one-shot Rescan recovery without absolute paths,
      Electron types, normal Refresh, or a generic filesystem bridge.
- [x] 1.5 Define narrow Canvas and Cut owner ports for canonical create, validate, and open/focus;
      document lifecycle and exact failure behavior.
- [x] 1.6 Add producer/consumer and Main/preload/renderer contract tests for sender binding, stale
      identity rejection, fail-local diagnostics, and absence of import/refresh/rename routes.

## 2. Implement ordinary Workspace entry creation

- [x] 2.1 Implement the canonical portable single-segment name policy with NFC normalization,
      containment, reserved-name/trailing-dot-space/control-character rejection, and focused tests.
- [x] 2.2 Implement zero-byte ordinary-file exclusive publication through the existing Content writer,
      rejecting `.nkc`/`.otio` case-insensitively and preserving every existing target on conflict.
- [x] 2.3 Implement empty-directory creation with fail-if-exists semantics and no hidden metadata,
      implicit suffix, recursive parent creation, or partial successful result.
- [x] 2.4 Implement and test exact target resolution for selected directory, selected-file parent,
      no-selection root, directory context menu, blank-area root, and stale-target rejection with no
      recent/root/default fallback.
- [x] 2.5 Add Desktop authorization/delegation adapters and tests proving Renderer never receives
      absolute paths or direct Node/Electron filesystem capability.

## 3. Implement canonical Canvas and Cut creation

- [x] 3.1 Expose the existing canonical empty Canvas factory and NKC validation/serialization through
      the Canvas owner port, including proof that Desktop-authored substitute JSON is unreachable.
- [x] 3.2 Expose canonical OTIO construction/validation through the Cut owner port using the existing
      profile, factory, session, and codec paths.
- [x] 3.3 Implement explicit Resource Browser directory handling with extension append/mismatch rules
      and protected-path policy.
- [x] 3.4 Publish owner-produced bytes exclusively before Resource invalidation and exact Workbench
      open/focus; leave all projections unchanged on owner/publication failure.
- [x] 3.5 Add owner/coordinator tests for valid bytes, conflict races, staging cleanup, invalid owner
      output, wrong extension, path escape, duplicate focus, and exact owner-path counters.

## 4. Implement live Workspace directory projection

- [x] 4.1 Add a Workspace-scoped observation service in `packages/assets/node` whose events only
      invalidate the authoritative Resource Browser projection; document subscription and release
      lifecycle.
- [x] 4.2 Coalesce notification bursts and implement affected-subtree/bounded full reconciliation on
      scene mount, external mutations, Window/application focus restoration, and watcher restart.
- [x] 4.3 Invalidate the affected projection immediately after successful in-app create/trash while
      keeping duplicate watcher notifications semantically transparent.
- [x] 4.4 Project watcher/reconciliation failures as local diagnostics that preserve valid siblings and
      expose a one-shot Rescan action only while recovery is required.
- [x] 4.5 Add deterministic observer tests for external add/remove/change, duplicate/coalesced/missed
      notifications, focus reconciliation, watcher failure/restart, subscription release, and isolation
      across Workspaces.

## 5. Add Resource Browser creation interaction

- [x] 5.1 Complete the UI reuse audit and use public `@neko/ui` menu/focus primitives; do not create an
      Assets-local context-menu, icon, or theme foundation.
- [x] 5.2 Add the accessible icon-only Files `+` menu with New File, New Folder, New Canvas, and New Cut,
      resolved-target presentation, and no Import, normal Refresh, or Media Library configuration.
- [x] 5.3 Add capability-derived directory and blank-area creation menus; keep file item context menus
      scoped to file operations and support pointer plus `Shift+F10`/Menu-key focus behavior.
- [x] 5.4 Add inline tree naming at the exact target location with directory expansion, autofocus,
      Enter commit, Escape cancel, pending state, and local validation/conflict diagnostics.
- [x] 5.5 Add localized Chinese/English labels, accessible names/tooltips, stable compact layout, and
      focused Assets tests for all target contexts, capability filtering, keyboard behavior, and
      canonical command emission.
- [x] 5.6 Render immutable `.nkc`/`.otio` suffixes beside creative-document stem inputs and submit the
      complete canonical filename, with focused Canvas/Cut tests.
- [x] 5.7 Make the directory disclosure triangle single-click expand/collapse without changing
      selection-only row clicks, double-click navigation, or Arrow Left/Right behavior.

## 6. Retain safe open behavior

- [x] 6.1 Switch NKC/OTIO open/focus to the canonical lifecycle while preserving exact
      document identity, duplicate focus, Canvas side-open, Cut Timeline ownership, and unrelated Views.
- [x] 6.2 Prove View close, Media Library unlink, existing Trash, and forged rename remain distinct from
      creation without changing their current contracts or behavior.

## 7. Remove replaced paths and synchronize documentation

- [x] 7.1 Remove the old Resource Browser import UI, Electron picker/copy handler, normal Refresh UI,
      `onOpenCanvas` callback, asymmetric retired Cut open route, active/recent directory fallback, and
      direct permanent-delete entry inside this change boundary.
- [x] 7.2 Add path-level architecture tests proving Assets Webview remains browser-safe, Assets Node
      owns observation, Content owns creation coordination, Canvas/Cut owners produce domain bytes,
      Desktop delegates, and import/refresh/rename/generic-domain-file bypasses cannot succeed.
- [x] 7.3 Update Desktop/Assets and domain documentation with filesystem authority, observation
      lifecycle, target-resolution rules, ordinary versus domain creation, recovery-only Rescan, trash
      semantics, and the separately deferred rename lifecycle.

## 8. Verify the complete user path

- [x] 8.1 Run `pnpm --filter neko-assets test` and
      `pnpm --filter neko-assets typecheck:resource-browser`.
- [x] 8.2 Run Content, Canvas, and Cut focused tests/typechecks for portable creation, owner bytes,
      exclusive publication, and reserved-extension rejection.
- [x] 8.3 Run focused Desktop contract/Main/preload/renderer tests, then
      `pnpm --filter @neko/app-desktop test` and `pnpm --filter @neko/app-desktop typecheck`.
- [ ] 8.4 Run `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:legacy-debt`, and
      `pnpm check:unused` because the change alters shared contracts and deletes old routes.
- [x] 8.5 Extend and run `pnpm test:functional:headless` with isolated root/nested ordinary-file,
      directory, NKC/OTIO, external filesystem reconciliation, and watcher recovery assertions.
- [x] 8.6 Run `pnpm test:local:ui` against an isolated synthetic Workspace and record visible real
      Electron evidence for `+`, directory/blank menus, inline naming, target placement, automatic
      external-file appearance, local diagnostics, creative-document open/focus, and responsive layout.
- [x] 8.7 Run `pnpm package:desktop` on the supported host and record cross-platform watcher/name/trash
      residual risks that cannot be exercised locally.
- [x] 8.8 Make Workspace directory observer disposal terminal, explicitly settle concurrent diagnostic publication, and add pending-reconcile/dispose/reject plus sibling-isolation regressions.
