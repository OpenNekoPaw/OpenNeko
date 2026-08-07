## Why

The All Projects catalog grows beyond the available Desktop viewport without assigning scrolling to
the collection, so later projects and their manual cleanup actions become unreachable. Historical
functional runs also left fixture Workspaces in the user catalog; the current isolation path needs a
permanent, path-level contract that prevents every canonical Desktop test launch from opening the
user database.

## What Changes

- Make the All Projects collection own the remaining vertical space and scroll independently while
  its heading and controls remain visible.
- Preserve list mode, unavailable-record diagnostics, and explicit per-record removal throughout
  long and compact catalog layouts.
- Require Desktop functional and Agent Evaluation launches to bind HOME, SQLite, Electron userData,
  and Workspace to one isolated temporary root before application storage opens.
- Add canonical-path tests that prove functional launch arguments resolve to the fixture database and
  ordinary product startup continues to resolve to the user database.
- Do not infer, filter, migrate, rewrite, or delete historical catalog rows based on path names;
  retained records remain visible for explicit user handling.

## Capabilities

### New Capabilities

- `project-catalog-scroll`: Defines bounded, independently scrollable All Projects collection behavior.

### Modified Capabilities

- `local-storage-authority-policy`: Requires canonical Desktop test runtimes to use a physically
  isolated database and fail before storage access when isolation is incomplete.

## Impact

- `apps/neko-desktop/src/renderer`: Desktop Shell presentation ownership for the All Projects layout;
  no package-owned project facts or mutations move into the renderer.
- `apps/neko-desktop/src/main`: Electron application-boundary validation of functional fixture HOME,
  userData, and Workspace before Local Metadata opens the SQLite authority.
- `scripts/desktop-functional` and `scripts/agent-eval`: host-side test orchestration that produces the
  isolated launch contract; Agent Evaluation remains a consumer of the shared runner.
- `@neko/local-metadata`: remains the producer of the canonical database layout; no schema, version,
  migration, compatibility reader, or new repository is introduced.
- User data: existing `~/.neko/neko.db` bytes and retained Workspace rows are not changed. Functional
  runs use `${FIXTURE_HOME}/.neko/neko.db`; cleanup remains explicit and identity-scoped.
