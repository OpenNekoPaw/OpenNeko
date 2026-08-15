## 1. Workspace Project Browser composition

- [x] 1.1 Add a Desktop-owned Project Browser presentation with Resources and Project Content tabs that mounts
      only the selected package Root for the exact Workspace.
- [x] 1.2 Embed the existing Project-owned Project Content projection in the dock and route exact Character and
      World entries to their existing authoring Main Views without copying domain payloads.
- [x] 1.3 Add package and Desktop tests for tab switching, unmount lifecycle, owner identities, local failure and
      continued availability of the sibling view.

## 2. Resource information architecture

- [x] 2.1 Rename the three Resource Browser sources to Project Files, External Media and Assets in Chinese and
      English, add source-specific search/actions, use three equal source columns and a semantic list icon.
- [x] 2.2 Remove the generic global-library recovery action and its obsolete visible labels so missing sources
      recover only from their exact source card.
- [x] 2.3 Update Assets Webview tests and focused Desktop selectors for the canonical three-source presentation
      and prove Character, World, Entity and Candidate records remain absent from Resources.
- [x] 2.4 Align the embedded Project Content groups, rows, typography, icon cells, empty copy and interaction
      states with the compact Resource Browser list language without changing the standalone Project surface.
- [x] 2.5 Separate the Resource Browser New/Link action from the compact List/Grid segmented control and remove
      the accidental search-field frame from the toolbar, with structure and visual regression coverage.
- [x] 2.6 Make the Resources/Project Content mode switch visibly selected through text weight and a bottom
      indicator while keeping the switch and embedded Project Content base transparent.

## 3. Low-decision acquisition

- [x] 3.1 Add one canonical Import Files intent and Node application operation that copies explicitly selected
      regular files atomically into the active Project Files directory without persisting source paths.
- [x] 3.2 Add one explicit fresh Link External Folder operation that creates a target-free unreferenced local
      binding after native directory authorization, without requiring an existing project reference.
- [x] 3.3 Keep exact-source Reconnect on required/unavailable source cards and return a user-facing empty/cancelled
      state instead of raw IPC errors when no valid recovery candidate exists.
- [x] 3.4 Add domain/controller, Node producer/path, Desktop delegation and Webview interaction tests covering
      import success/cancel/failure, fresh external link, collision, reconnect validation and source preservation.
- [x] 3.5 Reuse an exact existing global connection when linking the same physical directory into a Project,
      reject same-name/different-directory collisions and verify the External Media root projection.

## 4. Documentation and validation

- [x] 4.1 Update the creative resource architecture and affected package documentation with Project Browser
      composition, copy-default acquisition, explicit external linking and synchronization/packaging semantics.
- [x] 4.2 Run strict OpenSpec validation, focused Assets/Project/Desktop typechecks and tests, architecture checks
      and `git diff --check`; record the actual commands and residual failures.
- [ ] 4.3 Run `neko-ui-validation` through the visible isolated Electron Desktop for the two Project Browser views,
      three Resource sources, import/link/reconnect states and owner navigation, and inspect captured pixels.
      The current development bundle is owned by an existing Electron process, so the isolated development runner
      stopped before its checkpoints; the packaged runner also timed out before CDP attachment. Direct interaction
      with the existing visible runtime verified both views, all three sources, the import menu, the external-folder
      picker and owner navigation, but its captured pixels did not track the active window reliably. This task stays
      open rather than treating accessibility-tree evidence as authoritative graphical evidence.
      A later direct capture verified the compact empty Project Content state and the return to the populated
      Resources list in the current visible runtime; isolated import/link/reconnect evidence remains outstanding.
      Direct pixel inspection also verified the separated New/Link action, List/Grid selected states, New menu,
      External Media toolbar and the full List -> Grid -> List return cycle without clipping or adjacent regressions.
      Direct pixel inspection verified the transparent Resources/Project Content switch, stronger selected text,
      two-pixel selection indicator, transparent embedded Project Content base and Resources round trip.
      The current visible runtime also reused the exact existing `Assets` global connection after native folder
      selection and immediately projected the `Assets` root in External Media without a duplicate diagnostic.
- [x] 4.4 Run `neko-quality-review` for owner boundaries, unique canonical paths, fail-local behavior, user-data
      preservation, removed generic-link reachability and remaining risks.

## Validation evidence

- `openspec validate unify-workspace-resource-and-project-content-browser --strict`: passed.
- Focused Assets domain, Node, Webview, Project Webview and Desktop tests/typechecks: passed.
- Assets Webview toolbar structure, style contract and interaction suite: passed, 68 tests.
- `pnpm --filter @neko/assets-node test`: passed, 17 files and 85 tests.
- `pnpm --filter @neko/app-desktop test`: passed after the existing-connection link fix, 108 files and 710 tests.
- Application/package/Webview/content-access/Desktop-topology architecture checks: passed.
- `pnpm package:desktop`: passed and the packaged output was verified.
- `git diff --check`: passed.
- Isolated UI reports: `2026-08-14T02-04-23.257Z-project-content-development` and
  `2026-08-14T02-06-44.246Z-project-content-packaged`; neither produced authoritative checkpoints.
