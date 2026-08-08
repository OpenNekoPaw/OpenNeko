## ADDED Requirements

### Requirement: Workspace Files is an authoritative live directory projection

The Desktop Files facet SHALL project the authorized Workspace filesystem as its only file catalog.
A package-owned observation service SHALL treat OS filesystem notifications only as invalidations,
re-read authoritative directory state, and publish immutable Resource Browser snapshots. Files added,
removed, or changed through Finder, Explorer, terminal, or another process MUST become visible
without an application import operation or normal manual refresh.

#### Scenario: External file is added

- **WHEN** a regular file is added anywhere under the visible Workspace through an external tool
- **THEN** observation invalidates the affected projection and an authoritative rescan displays it
- **AND** Desktop does not copy, import, register, or rewrite that file

#### Scenario: Filesystem notification is duplicated or coalesced

- **WHEN** the OS emits duplicate, partial, reordered, or coalesced notifications
- **THEN** the observer uses them only to schedule an authoritative reconciliation
- **AND** notification order does not become file identity or a second source of truth

#### Scenario: Observation fails

- **WHEN** Workspace observation cannot continue or reconciliation fails
- **THEN** the Files facet retains valid sibling entries and displays a local diagnostic with a
  one-shot Rescan recovery action
- **AND** it does not report an empty successful catalog, disable unrelated facets, or expose a normal
  always-visible Refresh command

### Requirement: Desktop owns one canonical creation command path

Desktop SHALL execute ordinary file, directory, Canvas, and Cut creation through one sender-bound
command family owned by `@neko/content/project-file-io`. Assets and empty Main SHALL submit intents
and render projections; Canvas and Cut SHALL remain the only canonical producers of `.nkc` and
`.otio` bytes. Desktop MUST retain only Application-boundary authorization, concrete native adapters,
package wiring, and Workbench projection.

#### Scenario: A creation request crosses the Desktop boundary

- **WHEN** Renderer submits a creation command
- **THEN** Main validates the exact sender, Window, Project, Workspace, endpoint, request,
  target-directory, and projection identity before delegating to the package owner
- **AND** it does not use an active/recent Workspace or directory fallback

#### Scenario: One request is invalid

- **WHEN** one command has an invalid shape, stale identity, unauthorized directory, or unavailable
  owner
- **THEN** only that request fails with a typed diagnostic
- **AND** sibling files, projections, commands, Workspaces, and the application remain available

### Requirement: Creation target resolution is deterministic and visible

Every Resource Browser creation request SHALL carry one explicit workspace-relative target directory.
Files `+` SHALL target a selected directory itself, a selected file's parent, or Workspace root when
there is no selection. A directory context menu SHALL target that directory, and a blank-area context
menu SHALL target Workspace root. File context menus MUST NOT expose creation commands. Main SHALL
re-authorize the exact resolved target and MUST NOT substitute another directory after failure.

#### Scenario: User creates under a selected directory

- **WHEN** a directory is selected and the user invokes a Files `+` creation action
- **THEN** the tree expands that directory and places the inline name editor inside it
- **AND** the submitted command names that exact workspace-relative directory

#### Scenario: User creates while a file is selected

- **WHEN** a file is selected and the user invokes a Files `+` creation action
- **THEN** the inline editor appears beside that file under its parent directory
- **AND** creation does not target the file, Workspace root, or a recent directory

#### Scenario: User creates from blank area

- **WHEN** the user invokes the blank-area creation menu
- **THEN** the inline editor and command target Workspace root
- **AND** a previously selected child directory does not change that explicit blank-area target

#### Scenario: Target directory becomes stale

- **WHEN** the resolved target is removed, changed to a symlink, unauthorized, or leaves Workspace
  containment before commit
- **THEN** Main rejects that creation and the inline editor displays the diagnostic
- **AND** Desktop does not retry in Workspace root or an owner default directory

### Requirement: Ordinary file and directory creation is portable and non-overwriting

New File SHALL create one zero-byte regular file and New Folder SHALL create one empty directory.
Names MUST be NFC-normalized, visible, portable, non-empty single path segments and MUST reject path
separators, absolute paths, `.`/`..`, control characters, reserved names, trailing dot/space, and
Workspace escape. Publication MUST use fail-if-exists semantics and MUST NOT overwrite, infer a
suffix, or report partial success.

#### Scenario: User creates an ordinary file

- **WHEN** the user commits a valid unused ordinary filename through the inline editor
- **THEN** Content publishes exactly one zero-byte regular file in the authorized target directory
- **AND** Resources invalidates immediately and selects the exact created entry

#### Scenario: User creates a directory

- **WHEN** the user commits a valid unused directory name through the inline editor
- **THEN** Content creates exactly one empty directory in the authorized target directory
- **AND** the directory becomes selected without creating hidden metadata or an open runtime

#### Scenario: Target name already exists

- **WHEN** a file or directory already occupies the target path, including a publication race
- **THEN** creation fails with a conflict diagnostic and keeps inline naming active
- **AND** the existing entry is unchanged and no implicit numbered name is created

#### Scenario: Generic file uses a reserved domain extension

- **WHEN** New File is committed with `.nkc` or `.otio`, case-insensitively
- **THEN** Content rejects it and identifies New Canvas or New Cut as the required operation
- **AND** no zero-byte or substitute domain document is published

### Requirement: Canvas and Cut creation uses canonical domain owners

New Canvas and New Cut SHALL obtain valid bytes from the Canvas and Cut owner ports respectively and
publish them exclusively before opening/focusing the exact document. The Host MAY append the required
extension when absent and MUST reject a mismatched extension. Neither Desktop nor Assets MAY author
substitute NKC/OTIO JSON or create an untitled hidden document first.

#### Scenario: Canvas is created in an explicit directory

- **WHEN** a user commits a valid Canvas name in an authorized Resource Browser directory
- **THEN** the Canvas owner produces canonical NKC bytes and Content publishes the exact `.nkc` file
- **AND** only after publication succeeds Resources invalidates and Workbench opens/focuses it

#### Scenario: Owner or publication fails

- **WHEN** the matching owner is unavailable, produces invalid bytes, or exclusive publication fails
- **THEN** that request returns a typed diagnostic
- **AND** no partial file, alternate owner, generic-file fallback, View, or successful projection exists

#### Scenario: Publication succeeds but the editor cannot open

- **WHEN** canonical bytes publish successfully and exact Workbench open/focus then fails
- **THEN** the new file remains visible as authoritative user content and receives a local diagnostic
- **AND** Desktop does not delete the file, create a substitute View, or report the editor as opened

### Requirement: Files creation is discoverable and context-aware

The Files facet SHALL expose one accessible icon-only `+` toolbar button whose menu contains New File,
New Folder, New Canvas, and New Cut. Directory and blank-area context menus SHALL expose equivalent
authorized actions for their explicit targets. These menus SHALL be capability-derived, reuse the
public `@neko/ui` context-menu primitive, support pointer and `Shift+F10`/Menu-key invocation, and
restore focus after closing.

#### Scenario: Files `+` opens

- **WHEN** the Files facet is active and the user invokes `+`
- **THEN** the menu shows the four supported creation kinds and the resolved target context
- **AND** it does not show Media Library configuration, Import, or Refresh

#### Scenario: Inline naming commits or cancels

- **WHEN** a creation action starts
- **THEN** an inline name editor appears at the exact future tree location, Enter submits, and Escape
  cancels without a filesystem mutation
- **AND** validation/conflict diagnostics remain local without closing the editor or shifting target

#### Scenario: Creative-document suffix is fixed during naming

- **WHEN** New Canvas or New Cut starts inline naming
- **THEN** the user edits only the document stem while `.nkc` or `.otio` is displayed as a fixed,
  non-editable suffix
- **AND** commit submits the complete filename with that owning suffix exactly once

#### Scenario: Directory disclosure is clicked

- **WHEN** the user single-clicks the disclosure triangle beside a directory in list view
- **THEN** that exact directory expands when collapsed and collapses when expanded
- **AND** single-clicking elsewhere on the row remains selection-only

#### Scenario: File context menu opens

- **WHEN** the user invokes a context menu on a file
- **THEN** the menu contains only authorized operations on that file
- **AND** it does not contain New File, New Folder, New Canvas, or New Cut

### Requirement: Existing-file import is not an application operation

Desktop and Assets MUST NOT expose an existing-file import command, native import picker, or copy-into-
Workspace handler for the Files facet. Existing files SHALL enter the projection only by existing in
the authoritative Workspace directory.

#### Scenario: User wants to add an existing file

- **WHEN** a user copies or moves an existing file into the Workspace through the operating system
- **THEN** live directory reconciliation displays that same file
- **AND** OpenNeko does not create a duplicate copy, import record, or alternate project identity

#### Scenario: Retired import path is invoked

- **WHEN** a stale or forged client attempts the retired import command
- **THEN** the command is unregistered or rejected locally
- **AND** no picker opens and no source or Workspace file is mutated

### Requirement: Empty Main and trash remain outside creation

Empty Main SHALL remain presentation-only and SHALL NOT acquire directory-selection, naming, or
filesystem authority in this change. Existing Trash behavior SHALL remain unchanged. A future change
MUST define dirty-session, task, reference, authorization, rollback, and directory policies before
replacing that behavior.

#### Scenario: Empty Main remains presentation-only

- **WHEN** a Main group has no View during this change
- **THEN** it does not expose file, folder, Canvas, or Cut creation commands
- **AND** existing Trash routes and behavior are not replaced by a partial creation-owned lifecycle

### Requirement: Close, unlink, create, and rename remain distinct

Closing a Main View SHALL remain presentation-only. Removing a Media Library SHALL unlink only its
Workspace connection. Creation SHALL publish only the requested new entry. Rename SHALL remain
unreachable until a separate owner-coordinated contract exists. No alias, fallback, or generic
filesystem bridge MAY reinterpret one operation as another or report success. Existing Trash behavior
is unchanged by this requirement.

#### Scenario: User closes a creative document tab

- **WHEN** the user closes an NKC or OTIO View without invoking trash
- **THEN** Desktop removes only its View projection according to owner dirty policy
- **AND** the Workspace file remains visible and unchanged

#### Scenario: Rename is requested before its lifecycle exists

- **WHEN** a client attempts an unregistered or forged rename command
- **THEN** Desktop rejects only that operation
- **AND** it does not expose a raw Host rename call or mutate the file, session, View, or references
