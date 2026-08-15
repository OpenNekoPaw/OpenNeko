## Why

The Workspace right dock currently exposes only Assets-owned Resources while the already implemented
Project Content projection is reachable only as a Main View. Users therefore lose access to project
Characters, Worlds, Elements and Candidates while authoring, and the existing Shared Media actions expose
binding mechanics as generic add/link operations that fail when no same-named recovery candidate exists.

## What Changes

- Replace the Workspace dock's Resources-only presentation with one Project Browser containing two explicit
  views: Resources and Project Content.
- Keep Resources limited to three parallel source labels: Project Files, External Media and Assets. Character,
  World, Entity and Candidate records remain Project-owned semantic content and never become Asset entries.
- Present Project Content in the dock through the existing Project-owned projection, grouped as Characters,
  Worlds, Elements and Candidates, without copying domain facts into Assets or Desktop state.
- Define one low-decision acquisition policy: ordinary import/add copies bytes into project-owned storage;
  retaining bytes outside the project is an explicit “Link external folder” advanced action.
- Replace generic global-library linking with source-specific recovery. A missing external source offers
  “Reconnect” on that exact logical source and allows the user to select an existing authorized connection or
  a directory containing all currently referenced descendants.
- Keep `.neko` bindings disposable and unsynchronized; project facts retain only portable logical locators.
  Missing external sources remain fail-local and do not block Project Files or Project Content.

## Capabilities

### New Capabilities

- `workspace-project-browser`: Defines the Workspace dock composition, Resources/Project Content navigation,
  source labels, ownership-preserving grouping and fail-local presentation.
- `workspace-resource-acquisition`: Defines default copy versus explicit external-folder linking, exact-source
  recovery and the user-visible decisions for adding media.

### Modified Capabilities

None. This change composes existing owner contracts and introduces the user-facing acquisition policy without
changing the canonical ContentLocator or Project Content record shapes.

## Impact

- `packages/assets/webview`: Resource Browser terminology, toolbar actions and External Media recovery UX; it
  remains the owner of Files/Media/Assets presentation only.
- `packages/assets/domain` and `packages/assets/node`: owner-qualified acquisition/recovery intents and exact
  binding operations; Assets remains the Media Library policy owner.
- `packages/project-webview`: reusable embedded Project Content presentation and owner-qualified navigation
  callbacks; Project remains the projection owner.
- `apps/neko-desktop`: thin Workspace dock composition and exact navigation wiring between package Roots. It
  does not own resource acquisition policy or Project Content facts.
- Focused package tests, Desktop composition tests, visible Electron UI validation, Chinese/English labels and
  the creative resource architecture documentation are affected.
