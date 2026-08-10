# Verification status

## Implemented boundary

- Typed creator-visible artifacts and provenance are separated from Canvas mutation.
- Workspace Board is the default only without an explicit Canvas target.
- LocalMetadata ledger, stable identities, fenced writer claims, authoritative document checks and atomic `.nkc`
  mutation are implemented.
- Canvas document and user layout remain authoritative; completed receipts do not recreate deleted nodes.
- The canonical completed Agent Turn now invokes one Agent-owned delivery port after transcript
  durability. Collection or Host delivery failure returns a structured blocked outcome instead of
  preventing the terminal Turn result from converging.
- Desktop Main resolves the exact persisted Workspace identity, maps only typed durable artifacts,
  and composes the Canvas ledger/coordinator with package-owned atomic Node IO. Workspace open
  resumes pending deliveries without making a Board failure block the Project scene.
- Core `Write` results expose only a portable `workspace-file` locator and become output artifacts.
  Ordinary `Read` results remain source-only unless the same terminal batch contains a named
  reviewable result. Agent-linked Generation Tool attachments retain their Generation Job evidence.
- Workspace Board mutation and exact open Canvas session creation now share one Workspace-scoped serial
  boundary. Dirty sessions block before ledger mutation; clean sessions receive the committed document
  immediately, discard stale undo/redo history and keep the same nodes after save, detach and reopen.
- Canvas keyboard ownership now follows the delayed Webview Root through document-level focus/pointer
  observation. Select, pan, group, ungroup and zoom actions use the same shared dispatcher as the existing
  edit shortcuts and remain excluded while an editable boundary owns input.

## Deterministic evidence

- Assets linked-library search: 1 file / 1 test passed.
- Agent collector, core Tool and mention composition: 3 files / 36 tests passed.
- Canvas Node atomic mutation: 1 file / 7 tests passed, including readable but write-blocked
  directory and file symbolic-link targets.
- Desktop Board composition and mention effects: 2 files / 12 tests passed. The integration test uses
  the canonical LocalMetadata database, a real temporary Workspace and the real `.nkc` codec; replay
  produces one node and an unavailable Workspace returns one local blocked diagnostic. The public
  Conversation submit path also proves that blocked delivery retains a completed Turn, projects one
  Conversation-scoped renderer diagnostic and records the blocked result in neutral automation facts.
- Agent Runtime, Canvas Node and Desktop typechecks passed. Focused ESLint, Prettier and
  `git diff --check` passed.
- The follow-up live-session and keyboard regression set passed 4 files / 47 tests, including two attached
  exact Board Views, dirty prewrite rejection, stale undo isolation, save/reopen preservation, delayed Root
  mount, editable ownership and shortcut action mapping. Canvas Domain/Webview/Desktop typechecks and the
  full Electron Forge Desktop package build passed.
- Strict OpenSpec validation passed 72 items. Key-free Agent Evaluation passed 44 files / 294 tests and the
  all-suite dry-run passed 24 suites / 64 cases; these remain harness/contract evidence only.
- `pnpm check:quality` passed the internal-versioning, package, content, application and Agent
  boundaries, then stopped at the current dirty Renderer finding that
  `DesktopCanvasSurface.tsx` does not mount the public Canvas Webview root. The remaining quality
  commands were run directly and passed. `pnpm test:agent:eval` passed 44 files / 294 tests and strict
  dry-run discovery passed 23 suites / 60 cases. These Evaluation results prove key-free harness and
  contract readiness only.
- `pnpm check:unused` no longer reports any export from this change; it remains non-zero because the
  pre-existing dirty Renderer worktree exports unused `activateWorkbenchMainView`.

## Remaining evidence

- Independent recoverable background Generation delivery through the same production composition.
- First-process termination and fenced second-process resume.
- Real Electron visible projection, layout preservation and conflict diagnostics.
- Authoritative renderer save followed by another Generation delivery.

`neko-ui-validation` is applicable because the `@` candidate set and Workspace Board contents are
user-visible. The follow-up attempted `canvas-openneko-consumer` in a visible isolated development
fixture, but the Desktop CDP target never became ready (`fetch failed`), so no new screenshot or direct
interaction evidence was produced. No real-provider/cost authorization was supplied. Unit/Main integration
evidence and the successful Desktop package build do not replace that UI path.

The change remains incomplete until all three tasks pass through isolated Electron fixtures. Unit tests,
browser-only runs or retired Host evidence do not satisfy the remaining gate.
