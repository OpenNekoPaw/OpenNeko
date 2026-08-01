## ADDED Requirements

### Requirement: Desktop owns one creative-document lifecycle command path

Desktop SHALL execute `.nkc` and `.otio` create, import, open, trash-plan, and trash-apply operations
through one versioned sender-bound creative-document lifecycle contract. Assets and empty Main SHALL
only submit intents and render projections; Canvas and Cut SHALL remain the canonical document
producers and session owners. Missing, stale, mismatched, or unauthorized identity MUST fail visibly
without falling back to an active or recent project, document, View, or directory.

#### Scenario: Resource Browser and empty Main create through the same path

- **WHEN** a user creates a Canvas from a Resource Browser directory and later creates a Cut from
  empty Main
- **THEN** both requests reach the same Desktop lifecycle coordinator with explicit Project,
  Workspace, Window, endpoint, request, and target/default-directory identity
- **AND** neither surface writes project bytes or constructs a parallel document session

#### Scenario: Forged lifecycle identity is submitted

- **WHEN** a renderer submits a stale Resource Browser revision, mismatched Workspace, stale endpoint
  epoch, or target outside its sender-owned Project
- **THEN** Main rejects the request with a typed diagnostic
- **AND** no picker, file mutation, session creation, Workbench mutation, or fallback executes

### Requirement: New creative documents are explicit canonical workspace files

Desktop SHALL create a new document in an explicit authorized Resource Browser directory or the
matching owner default directory. Canvas SHALL produce valid empty NKC through its canonical factory
and codec; Cut SHALL produce a valid OTIO v1 project through its canonical factory, profile, session,
and codec. The Host MUST normalize and validate a visible portable name, require the matching
extension, publish exclusively through same-directory staging, and MUST NOT overwrite or leave a
partial file.

#### Scenario: Canvas is created in the selected directory

- **WHEN** the user invokes New Canvas on an authorized Files directory and submits an available name
- **THEN** the Canvas owner produces canonical empty NKC bytes and Desktop publishes the exact
  workspace-relative `.nkc` target
- **AND** Desktop refreshes Resources and opens/focuses that document only after publication succeeds

#### Scenario: Cut is created from empty Main

- **WHEN** no Main View is open and the user invokes New Cut without a directory context
- **THEN** Desktop resolves the Cut owner default project directory and Cut creates the canonical v1
  OTIO project
- **AND** the resulting Cut View and Timeline bind to the exact new document identity

#### Scenario: Requested document name conflicts

- **WHEN** the normalized target already exists or publication loses an exclusive-create race
- **THEN** Desktop returns a conflict diagnostic and removes any staging file
- **AND** it does not overwrite bytes, allocate a hidden suffix, open a View, or report success

#### Scenario: Owner document construction fails

- **WHEN** the matching Canvas or Cut factory, codec, or storage dependency is unavailable or rejects
  the document
- **THEN** creation fails visibly and leaves the filesystem, Workbench, and Resource Browser
  projection unchanged
- **AND** Desktop does not construct substitute JSON, use another codec, or create an in-memory
  untitled document

### Requirement: External creative-document import is explicit and bounded

Desktop SHALL import only an explicitly selected external regular non-symlink `.nkc` or `.otio`
file through a sender-bound native picker. The matching owner MUST validate the source bytes before
Desktop copies them into an explicit authorized workspace directory through exclusive staging.
Import MUST preserve document bytes and MUST NOT infer a source workspace, copy adjacent media,
rewrite references, or open an external absolute path as a project document.

#### Scenario: Valid external project document is imported

- **WHEN** a user selects a valid external NKC or OTIO and an available workspace destination
- **THEN** Desktop validates it through the matching owner, publishes one workspace file, refreshes
  Resources, and opens the imported document
- **AND** renderer receives only portable document identity and diagnostics

#### Scenario: External document is invalid or a symlink

- **WHEN** the selected source is a symlink, not a regular file, has the wrong extension, or fails its
  owning codec
- **THEN** Desktop rejects import before destination publication
- **AND** it does not follow the link, copy bytes, create a View, or fall back to generic JSON parsing

#### Scenario: Imported references are unavailable in the destination

- **WHEN** preserved NKC workspace locators or OTIO-relative media references do not resolve in the
  destination Workspace
- **THEN** the owning Canvas or Cut session opens the valid document structure with explicit missing
  content diagnostics
- **AND** Desktop does not use the external source directory as hidden context, automatically copy
  media, or silently rebase paths

### Requirement: Resource management provides capability-driven toolbar and context menus

The Assets-owned Resource Browser SHALL derive its visible toolbar, item context menu, directory
context menu, and blank-area context menu from immutable Host-authorized capabilities and SHALL reuse
the public `@neko/ui` context-menu primitive. Context menus SHALL select their target before opening,
support pointer and `Shift+F10`/Menu-key invocation, separate destructive actions, and MUST NOT be the
only way to discover create/import operations.

#### Scenario: Files facet exposes document management

- **WHEN** the Files facet is active
- **THEN** the visible add menu and blank-area menu expose New Canvas, New Cut, and Import Document,
  while a directory menu applies those operations to that explicit directory
- **AND** Refresh remains available without showing Media Library configuration as an unrelated Files
  action

#### Scenario: Creative document context menu opens

- **WHEN** the user opens the context menu for a workspace NKC or OTIO item
- **THEN** the item becomes selected and the menu shows only its authorized open, supported side-open,
  reveal, and move-to-trash actions
- **AND** OTIO does not offer side-open until the Cut owner and Workbench explicitly support it

#### Scenario: Media Library root context menu opens

- **WHEN** the user opens a context menu for a linked Media Library root
- **THEN** the menu exposes only applicable recover, relink, unlink, and refresh operations
- **AND** it does not expose workspace-file trash or describe unlink as deleting target contents

#### Scenario: Context menu is invoked from the keyboard

- **WHEN** a selected resource receives `Shift+F10` or the platform Menu key
- **THEN** the same capability-derived menu opens with managed focus and keyboard navigation
- **AND** closing it restores focus without changing project facts

### Requirement: Empty Main is a shortcut surface rather than a document owner

When a Main group contains no View, Desktop SHALL render compact New Canvas, New Cut, and
Import/Open shortcuts for ready domain capabilities. Each shortcut MUST submit the same lifecycle
intent used by Resource Browser, and Main MUST remain free of project byte construction, target path
state, document dirty state, and owner session state.

#### Scenario: User creates from empty Main

- **WHEN** the user chooses New Canvas or New Cut in an empty Main group
- **THEN** Desktop uses the owner default directory, publishes the canonical file, and replaces the
  empty state with the exact opened View
- **AND** no anonymous or hidden in-memory document exists before publication

#### Scenario: Domain capability is unavailable

- **WHEN** Canvas or Cut is unavailable
- **THEN** empty Main omits or disables only that owner's shortcut with a typed diagnostic
- **AND** it does not render a simulated successful action or redirect through another owner

### Requirement: Creative-document trash is recoverable and two-phase

Desktop SHALL implement project-document deletion as short-lived `trash.plan` and `trash.apply`
operations that move an authorized workspace-owned regular file to the operating-system trash.
Planning MUST bind target fingerprint, sender, Project, Workspace, endpoint, open View/session state,
dirty state, running owner tasks, reference coverage, and referencing owners. Apply MUST repeat
authorization, reject stale plans, require an explicit dirty resolution and reference acknowledgement
when applicable, release owner resources, and invoke the injected trash adapter. It MUST NOT use
permanent delete, cascade deletion, or reference rewriting.

#### Scenario: Clean unreferenced document is moved to trash

- **WHEN** a valid non-expired plan still matches a clean, unreferenced, task-free document and the
  user confirms
- **THEN** Desktop releases its owner session, moves the exact file to system trash, removes matching
  Views, and refreshes Resources
- **AND** unrelated documents, references, Entity identities, Media Library links, and files remain
  unchanged

#### Scenario: Open document is dirty

- **WHEN** planning finds an open dirty Canvas or Cut session
- **THEN** apply requires the user to choose save-and-trash, discard-and-trash, or cancel
- **AND** no trash call executes until the owning session successfully completes the selected
  resolution

#### Scenario: Document has a running owner task

- **WHEN** planning or apply finds an active Cut export, Generation operation, or other
  document-scoped owner task
- **THEN** Desktop rejects trash with the exact blocking task diagnostic
- **AND** it does not silently cancel the task, detach its owner, or move the file

#### Scenario: Document is referenced

- **WHEN** complete project-content inspection finds Canvas, Cut, or Entity representation owners
  referencing the target
- **THEN** the plan lists those owner identities and apply requires explicit acknowledgement
- **AND** successful trash leaves the references unchanged so their owners project missing-content
  diagnostics

#### Scenario: Reference inspection is incomplete

- **WHEN** registered reference coverage is incomplete or an owning project document cannot be parsed
- **THEN** Desktop rejects trash with the incomplete or invalid owner diagnostic
- **AND** it does not assume zero references or offer an unguarded apply path

#### Scenario: Trash target changes after planning

- **WHEN** the file fingerprint, session identity, dirty state, task state, Project ownership, or
  endpoint epoch changes before apply
- **THEN** Desktop rejects the stale plan and requires a new plan
- **AND** it does not apply using a label, previous absolute path, active View, or stale confirmation

#### Scenario: Operating-system trash fails

- **WHEN** owner resources are released but the trash adapter fails while the source file remains
- **THEN** Desktop keeps the Workbench mutation uncommitted, remounts the previous Views from the
  unchanged file, and reports failure
- **AND** it does not report deletion or leave a successful empty projection

### Requirement: Trash authorization protects ownership and special resources

Creative-document and directory trash SHALL accept only visible, workspace-owned, authorized,
non-symlink targets. Ordinary trash MUST reject the protected `neko/boards/workspace.nkc`, Media
Library roots and external linked contents, hidden/internal paths, and non-empty directories.
Directory trash SHALL be limited to empty directories and MUST NOT set a recursive deletion flag.

#### Scenario: Protected workspace Canvas is selected

- **WHEN** the target is `neko/boards/workspace.nkc`
- **THEN** Resource Browser does not project ordinary trash capability and Main rejects a forged plan
  request
- **AND** the document can only be changed through a future explicit reset workflow

#### Scenario: External or linked source is selected

- **WHEN** the target belongs to an external Media Library, is a symlink, or resolves outside the
  authorized Workspace
- **THEN** Desktop rejects file trash before reference or session mutation
- **AND** it does not follow the target, delete external bytes, or reinterpret unlink as trash

#### Scenario: Empty workspace directory is moved to trash

- **WHEN** a visible authorized workspace directory has zero entries and a matching non-expired plan
  is confirmed
- **THEN** Desktop moves that exact directory to system trash and refreshes Resources
- **AND** it does not recursively inspect or delete descendants

#### Scenario: Non-empty directory is selected

- **WHEN** a directory contains any visible or hidden entry
- **THEN** Desktop rejects trash with a non-empty-directory diagnostic
- **AND** no recursive delete, partial child mutation, or fallback executes

### Requirement: Close, unlink, trash, and representation lifecycle remain distinct

Closing a Main View SHALL remain a presentation operation. Removing a Media Library SHALL unlink only
the workspace connection. Creative-document trash SHALL mutate only the explicitly authorized
workspace file. Generated-output deletion and Entity representation lifecycle SHALL retain their
own contracts. No legacy alias, callback, or conditional fallback MAY make one operation execute as
another or report success.

#### Scenario: User closes a creative document tab

- **WHEN** the user closes an NKC or OTIO Main View without invoking trash
- **THEN** Desktop removes only its View projection and follows the owner close/dirty policy
- **AND** the project file remains in Resources and on disk

#### Scenario: User removes a Media Library

- **WHEN** the user confirms Remove Media Library
- **THEN** Desktop removes only the workspace link and retains target contents
- **AND** the confirmation and diagnostic remain distinct from Move to Trash

#### Scenario: New creative-document path is accepted

- **WHEN** create, open, import, or trash succeeds through the new lifecycle contract
- **THEN** path-level tests prove the new coordinator and matching Canvas/Cut owner were invoked
- **AND** the legacy Canvas open callback, asymmetric Cut open route, direct permanent delete, active
  document fallback, and compatibility aliases are poisoned or absent
