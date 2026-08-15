## Context

The current Workspace right dock is named “Project Resources” and mounts only
`@neko/assets-webview`'s Resource Browser. The Project-owned `ProjectContentRoot` already projects exact
Characters, Worlds, Other Elements and Candidates, but it is mounted only as the default Main View and is
therefore displaced whenever the user opens Canvas, Cut, Preview or an authoring surface.

Resources currently exposes Files, Shared Media and Installed Assets. Files are project-owned content, Media
is a projection of project-local bindings to user-global authorized directories, and Assets are installed
global packages. The Media toolbar exposes generic “link global library” and “add directory” operations even
though the binding service currently requires a pre-existing logical project reference. With no matching
required source the operation throws a raw Main-process error.

This design must preserve the existing authority split: Content owns project files, Assets owns media
connections/bindings and installed Asset presentation, Project owns Project Content, Chara and World own their
records and authoring, and Desktop owns only visible package Root composition plus native selection adapters.

## Goals / Non-Goals

**Goals:**

- Keep both Resources and Project Content continuously discoverable in the Workspace right dock.
- Present Resources as exactly Project Files, External Media and Assets.
- Preserve Project Content's exact Character, World, Entity and Candidate identities and route owner actions
  without copying payloads into Desktop or Assets.
- Make ordinary acquisition copy into project-owned storage without asking the user to understand storage
  authority.
- Make external-folder linking an explicit advanced action and make missing-source recovery item-scoped,
  validated and fail-local.
- Remove generic actions that can only fail because no exact project intent exists.

**Non-Goals:**

- Turning Character, World, Entity or Candidate into Asset records.
- Adding a universal Resource/ProjectContent contract, catalog or mutable cross-domain store.
- Moving Project Content mutation policy into the Workspace dock.
- Synchronizing `.neko`, global connection identities, physical paths or external bytes.
- Automatically authorizing an external folder because its name matches a logical source.
- Changing existing project document ContentLocator shapes or migrating user data.

## Decisions

### 1. Desktop composes one Project Browser from two owner Roots

The Workspace right dock becomes a Window-presentation component with two tabs: Resources and Project
Content. Resources mounts the existing Assets-owned `ResourceBrowserRoot`; Project Content mounts the existing
Project-owned `ProjectContentRoot`. Only the active Root is mounted. Tab selection is disposable presentation
state scoped to the current mounted Workspace and does not become a durable Session, Project fact or shared
store.

The two modes use a strong text-weight change and a two-pixel bottom indicator for selection. The switch row,
hover state, selected state and embedded Project Content root remain transparent; mode identity does not depend
on a filled background color and the content surface inherits the owning panel base.

Desktop owns this two-Root composition because deciding which product surface is visible in a Window slot is
an application-shell responsibility. It retains no Project/Assets business logic and calls only their public
bridges. The canonical producers and consumers are:

| Data/operation                | Owner and producer                          | Consumer                      | Runtime boundary                    |
| ----------------------------- | ------------------------------------------- | ----------------------------- | ----------------------------------- |
| Files/Media/Assets projection | `@neko/assets-domain` + `@neko/assets-node` | `@neko/assets-webview`        | sender-bound Desktop bridge         |
| Project Content projection    | `@neko/project` application service         | `@neko/project-webview`       | sender-bound Desktop Project bridge |
| Character/World open          | Chara/World authoring public contracts      | Desktop Main View composition | Renderer presentation command       |
| tab selection                 | Desktop Renderer component                  | same mounted component        | no persistence/IPC                  |

Alternative considered: add Character/World/Candidate as more Resource Browser sources. Rejected because it
would make Assets a semantic catalog and mix storage-origin filtering with domain identity.

Alternative considered: keep Project Content only as a Main View. Rejected because opening an editor removes
the only project-wide semantic navigation surface.

### 2. Resource labels describe ownership rather than implementation

The three source labels become Project Files, External Media and Assets. “External Media” means bytes retained
outside the synchronized project and reached through a local authorized source; it does not imply cloud or
collaboration. “Assets” means installed reusable packages and does not include Characters, Worlds or Entities.

The source tabs use three equal columns and source-specific search/action labels. The toolbar uses a list icon
for list presentation rather than a file icon. The generic Media plus menu is removed unless it offers one
valid explicit acquisition action. The search field and toolbar use separate containers: New/Link is one
standalone bordered action, while List/Grid is one two-state segmented control with exactly one raised selected
state. They do not share an input-like outer frame or show two simultaneous selected surfaces.

The embedded Project Content view uses the same compact sidebar list language as Resources: transparent
32-pixel rows, 24-pixel icon cells, 11-pixel labels, subdued secondary text, six-pixel corner radii and the same
hover/focus tokens. Its four semantic groups remain visibly separate, but empty copy stays directly beneath
each group header instead of expanding into card-like vertical panels. The standalone Project Content surface
keeps its wider editor presentation.

Alternative considered: “Shared Media”. Rejected because users reasonably interpret “shared” as team/cloud
sharing, which is not the authority represented by the current model.

### 3. Acquisition defaults to copying into Project Files

The canonical ordinary action is “Import files”. Native selection stays inside Desktop Main; the selected
source paths are passed only to the Assets Node application operation, which validates regular files, resolves
the current project destination, chooses conflict-free names, copies through a temporary file and atomically
renames. The resulting project-owned bytes use `workspace-file` locators and participate in normal project sync
and packaging.

The UI does not ask “copy or link?” on each import. Copy is the default because it produces a self-contained
project and the least surprising delete/sync semantics. The menu may separately expose “Link external folder”
with explanatory text for large or reusable directories; selecting it is the explicit authorization decision.

Alternative considered: show a copy/link dialog for every file selection. Rejected because it requires users
to understand storage and portability before performing the common action.

### 4. External linking and recovery are distinct intents

“Link external folder” may create or select one user-global directory record for user-facing management and
creates one direct managed link at `neko/assets/<libraryName>`. A fresh link may be unreferenced; this is an intentional
browseable state, not an error. It does not create project document references, copy bytes or modify the
external directory. When the selected physical directory already owns the exact available user-global
connection, fresh linking may reuse it for selection but still creates the missing project link. A same-name
connection targeting another directory, an existing project link or an unavailable directory fails visibly
before mutation.

Once a consumer stores a `workspace-file` locator below `neko/assets/<libraryName>/`, that exact link becomes
required. If the link is missing or unavailable, the exact source card offers “Reconnect”. Recovery validates
every currently referenced descendant against the selected directory before applying the existing immutable recovery plan. The global generic
“Use global connection” action is removed from the source toolbar.

The canonical resolver remains:

```text
project WorkspaceFileContentLocator("neko/assets/<libraryName>/<relativePath>")
  -> exact project-local managed symlink / junction
  -> contained physical descendant
```

Alternative considered: automatically bind a same-named global directory. Rejected because opening a project
must not authorize external filesystem access.

### 5. Management stays owner-qualified

Project Content entries appear in the dock for discovery and status. Character and World rows may open their
exact authoring Root through the existing Workbench navigation contract. Element and Candidate rows remain
read-only until Entity owns explicit confirm/ignore/merge contracts; the dock must not invent generic mutation.
Invalid records retain local diagnostics while sibling groups and Resources remain available.

The replaced successful presentation path is the Resources-only dock. The existing standalone Project Content
Main View remains a valid document/navigation target during this change; it is not a duplicate authority and
may be removed only through a separate navigation decision. No user data or persisted records are rewritten.

## Risks / Trade-offs

- **[Risk] Two tabs add one navigation step in a narrow dock.** → Keep two stable top-level labels, preserve the
  selected tab while the mounted Workspace remains active and show counts/empty states inside Project Content.
- **[Risk] Copying large media by default can be slow or consume disk.** → Show progress/failure visibly, copy
  atomically, preserve sources and retain the separate explicit external-folder action for large collections.
- **[Risk] Fresh unreferenced external bindings expand local authorization.** → Require direct user folder
  selection, store only the opaque connection identity, expose removal, and never mutate target bytes implicitly.
- **[Risk] Character/World rows become visible in two places.** → Treat both as projections/navigation entry
  points to the same exact domain identity; never duplicate payload or repository records.
- **[Risk] Project Content bridge failure could replace Resources.** → Mount only the selected owner Root and
  render its failure locally; the other tab remains operable.

## Migration Plan

1. Add the Project Browser presentation and labels without changing persisted data.
2. Add focused component and Desktop composition tests, then make the new browser the Workspace dock content.
3. Add the canonical project-file import and explicit fresh external-source link operations.
4. Remove the generic global-link action and obsolete labels/tests in the same boundary.
5. Validate visible Desktop flows for tab switching, import, external link, missing-source recovery and owner
   navigation. Rollback consists only of reverting code because no project or user-global records are migrated.

## Open Questions

- Candidate confirm/ignore and generic Entity editing remain intentionally unavailable until Entity exposes an
  owner-qualified Project Content management contract.
- Copy progress is initially bounded to the active operation. A durable background copy task requires separate
  evidence for resumable multi-gigabyte workflows and is outside this change.
