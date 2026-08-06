## 1. Freeze contracts and owner boundaries

- [ ] 1.0 Establish `@neko/content/project-file-io` as the canonical owner of the host-neutral
      creative-document lifecycle coordinator and public contract; Desktop may retain only sender/path
      authorization, native picker/trash/file adapters, Workbench projection and composition.
- [ ] 1.1 Define the canonical Desktop creative-document create/import/open/trash-plan/trash-apply
      request, result, diagnostic, identity, document-kind, and plan contracts with strict parsers and
      producer/consumer tests.
- [ ] 1.2 Extend the Assets Resource Browser contract with explicit creative-document, workspace-file
      trash, empty-directory trash, and container-action capabilities without exposing absolute paths or
      Desktop implementation types.
- [ ] 1.3 Define narrow Canvas and Cut document-owner ports for canonical create, validate,
      save/discard, dirty-state, task-state, and session-release behavior; document their owner,
      lifecycle, error contract, and replacement condition.
- [ ] 1.4 Add Main/preload/renderer bridge contract tests proving sender binding, stale
      project/workspace/window/endpoint/revision rejection, and the absence of generic IPC or filesystem
      exposure.

## 2. Implement canonical document owner operations

- [ ] 2.1 Expose the existing canonical empty Canvas factory and NKC validation/serialization through
      the Canvas owner port, including a regression test that forbids Desktop-authored substitute JSON.
- [ ] 2.2 Expose canonical Cut v1 OTIO construction/validation through the Cut owner port using the
      existing profile, `createOtioTimeline`, `CutDocumentSession.create`, and codec path.
- [ ] 2.3 Implement owner default-directory resolution for Canvas and Cut as portable
      workspace-relative configuration, with path/name/extension validation and protected
      `neko/boards/workspace.nkc` handling.
- [ ] 2.4 Add owner tests for valid create bytes, invalid imports, dirty save/discard, task blockers,
      session release, and explicit identity mismatch failures.

## 3. Implement Desktop create, import, and open coordination

- [ ] 3.1 Add package-owned `CreativeDocumentLifecycleCoordinator` with explicit owner and Host-port
      injection; keep sender binding in the Desktop adapter and require
      workspace authorization, portable directory/name resolution, request idempotency, and typed
      fail-visible diagnostics.
- [ ] 3.2 Implement same-directory staging and exclusive publication for new/imported documents,
      including conflict detection and cleanup that cannot overwrite an existing target or leave partial
      bytes.
- [ ] 3.3 Implement create so publication precedes Resource refresh and exact Workbench open/focus,
      and so failed owner/publish operations leave every projection unchanged.
- [ ] 3.4 Implement sender-bound native NKC/OTIO import selection, regular-file and symlink guards,
      owner validation, byte-preserving copy, and explicit missing-reference projection without adjacent
      media copy or path rebasing.
- [ ] 3.5 Switch NKC and OTIO open/focus atomically to the lifecycle coordinator while preserving
      document-scoped Canvas/Cut identity, duplicate focus, Canvas side-open, and Cut Timeline ownership.
- [ ] 3.6 Add focused coordinator tests for create/import/open success, conflict races, staging
      cleanup, invalid codec, wrong extension, path escape, symlink input, missing references, duplicate
      focus, and exact owner-path counters.

## 4. Implement reference-aware two-phase trash

- [ ] 4.1 Extend the existing project-content reference reader with exact target matching and
      registered owner coverage so Canvas, Cut, and Entity representation references and invalid-owner
      diagnostics can be reported without rewriting project facts.
- [ ] 4.2 Implement a bounded short-lived trash-plan registry bound to sender, project, workspace,
      endpoint, target locator, file/directory fingerprint, session state, task state, and reference
      snapshot.
- [ ] 4.3 Implement document trash planning that rejects protected, hidden, external, library-root,
      symlink, stale, or unauthorized targets and projects dirty resolutions, running-task blockers, and
      reference acknowledgement requirements.
- [ ] 4.4 Implement trash apply with repeated authorization/fingerprint checks, explicit
      save-and-trash or discard-and-trash resolution, owner resource release, injected Electron
      `trashItem`, post-success Workbench reconciliation, and Resource refresh.
- [ ] 4.5 Implement trash-failure recovery that leaves Workbench removal uncommitted and remounts
      previous Views when the unchanged source remains after the operating-system trash call fails.
- [ ] 4.6 Implement empty-directory plan/apply with visible workspace ownership and zero-entry checks;
      prove recursive deletion is unreachable and reject every non-empty directory.
- [ ] 4.7 Add regression tests for clean trash, dirty resolution/cancel, active task rejection,
      referenced acknowledgement, incomplete reference coverage, expired/stale plans, changed bytes,
      multi-View/multi-window reconciliation, protected workspace Canvas, external/library sources,
      non-empty directories, trash failure recovery, and absence of permanent delete.

## 5. Add Resource Browser management interaction

- [ ] 5.1 Complete the UI reuse audit and use public `@neko/ui` `ContextMenu` and existing menu/theme
      primitives; do not create Assets-local menu, focus, icon, or theme foundations.
- [ ] 5.2 Replace the unconditional Resource Browser `+` behavior with facet-aware visible actions:
      Files create/import, Media Library link/add-directory, and only implemented Materials actions.
- [ ] 5.3 Build capability-derived item, directory, and blank-area context menus with
      selection-before-open, destructive separators, exact unlink/trash wording, and no unauthorized or
      unsupported side-open commands.
- [ ] 5.4 Add pointer plus `Shift+F10`/Menu-key invocation, managed focus restoration, disabled/pending
      states, and localized Chinese/English labels and diagnostics.
- [ ] 5.5 Remove redundant row-action clutter after menu replacement while retaining immediately
      actionable recovery/status controls and discoverable toolbar commands.
- [ ] 5.6 Add Assets component/contract tests for every facet and target role, capability filtering,
      keyboard navigation, selection, menu separation, protected/external items, and the canonical
      lifecycle request path.

## 6. Add empty-Main shortcuts and lifecycle reconciliation

- [ ] 6.1 Replace the diagnostic-only no-View Main body with compact ready-capability New Canvas, New
      Cut, and Import/Open shortcuts that reuse existing `@neko/ui` controls and responsive Workbench
      styling.
- [ ] 6.2 Route empty-Main shortcuts through the same renderer lifecycle client with no target path,
      optimistic Workbench mutation, document bytes, dirty state, or owner session state in Renderer.
- [ ] 6.3 Reconcile create/open/trash results with exact Main Groups, Canvas side split, Cut Timeline,
      matching Views across project windows, and unrelated View preservation.
- [ ] 6.4 Add Desktop renderer/lifecycle tests for no-View rendering, unavailable owner diagnostics,
      create/import command identity, successful View replacement, failed-operation stability, and
      responsive non-overlapping controls.

## 7. Remove replaced paths and synchronize documentation

- [ ] 7.1 Remove the Resource Browser `onOpenCanvas` callback, asymmetric retired Cut open
      route, direct workspace permanent-delete entry, active/recent target fallback, and any aliases
      replaced inside this change boundary.
- [ ] 7.2 Add path-level architecture tests proving Assets stays browser-safe, Main stays React-free,
      preload exposes only the lifecycle port, the package-owned coordinator and owner codecs/sessions
      are invoked, app-local workflow is absent, and retired paths cannot return success.
- [ ] 7.3 Update Desktop/Assets documentation and relevant architecture/domain navigation with the
      lifecycle owner, Resource Browser versus empty-Main responsibilities, import reference behavior,
      system-trash semantics, and protected workspace Canvas boundary.

## 8. Verify the complete user path

- [ ] 8.1 Run `pnpm --filter neko-assets test`,
      `pnpm --filter neko-assets typecheck:resource-browser`,
      `pnpm --filter @neko/canvas-domain test`, `pnpm --filter @neko/canvas-domain typecheck`,
      `pnpm --filter @neko/cut-domain test`, and `pnpm --filter @neko/cut-domain typecheck`.
- [ ] 8.2 Run the focused Desktop contract/Main/preload/renderer tests, then
      `pnpm --filter @neko/app-desktop test` and `pnpm --filter @neko/app-desktop typecheck`.
- [ ] 8.3 Run `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:legacy-debt`, and
      `pnpm check:unused` because the change modifies shared contracts and removes old paths.
- [ ] 8.4 Extend and run `pnpm test:functional:headless` with isolated create/import/trash path
      assertions and a controlled trash adapter.
- [ ] 8.5 Run `pnpm test:local:ui` against an isolated synthetic workspace and record real Electron
      evidence for Files toolbar/context menus, empty Main, NKC/OTIO create/import/open, protected and
      referenced rejection, dirty resolution, successful system trash, View cleanup, Resource refresh,
      focus, and responsive layout.
- [ ] 8.6 Run `pnpm package:desktop` on the supported host and document any cross-platform
      system-trash residual risk that cannot be exercised locally.
