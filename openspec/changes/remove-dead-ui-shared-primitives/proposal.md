## Why

`@neko/ui/shared-primitives` is a legacy transfer surface whose only external consumers are zero. The
`./shared-primitives` package subpath is imported by nothing outside `@neko/ui` (only a doc comment
mentions it). Ten of its components — `Toolbar`, `CollapsibleSection`, `Panel`, `ContextMenu`,
`TimelineRuler`, `ProgressBar`, `MacButton`, `MacIconButton`, `MacSlider`, and `MacTabs` — are reachable
only through that dead subpath and duplicate the canonical `@neko/ui/primitives` and `@neko/ui/creative`
surfaces. The remaining resize/drag/drop primitives (`ResizeHandle`, `useDrag`, `useFileDrop`,
`useResizable`/persisted-resize helpers) are already exported canonically through `@neko/ui/primitives`
and `@neko/ui/hooks`.

## What Changes

- Delete the ten zero-consumer shared-primitives components.
- Trim `shared-primitives/index.ts` to the live resize/drag/drop primitives and remove the dead
  `./shared-primitives` package subpath so the live primitives keep one canonical public entry each.
- Keep the Preview-local `MacButton`/`MacIconButton`/`MacSlider`/`ProgressBar`/`DocumentContextMenu`
  media controls: they are domain-specific seek/playback controls (`currentTime`/`duration`/
  `onSeekCommit`, macOS-styled media chrome), not generic UI primitives, and are not merged into `@neko/ui`.

## Capabilities

### New Capabilities

- `dead-ui-shared-primitives-removal`: Deletion rule for the zero-consumer legacy `@neko/ui/shared-primitives`
  components while preserving the canonical primitives/hooks entries and Preview-owned media controls.

### Modified Capabilities

<!-- None. -->

## Impact

- `packages/ui`: remove dead `shared-primitives` components, trim the barrel, drop the `./shared-primitives`
  subpath. No other package imports the removed surface. No behavior, style, or user-data change.
