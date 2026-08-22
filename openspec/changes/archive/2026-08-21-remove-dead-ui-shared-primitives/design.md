## Context

`@neko/ui/shared-primitives` originated as the "former Shared component surface". Its `./shared-primitives`
subpath has no external importer. Internal reachability is limited to:

- `primitives/resize-handle.ts` re-exports `ResizeHandle`/`ResizeHandleProps` from
  `shared-primitives/ResizeHandle`.
- `hooks/index.ts` re-exports `useDrag`, `useFileDrop`, `useResizable`, and the persisted-resize helpers
  plus their types from the barrel.

Every other shared-primitives component is reachable only through the dead subpath and is never imported.

## Goals / Non-Goals

**Goals:**

- Delete the ten zero-consumer components, trim the barrel to the live resize/drag/drop primitives, and
  remove the `./shared-primitives` package subpath.

**Non-Goals:**

- Migrating Preview's domain-specific media controls into `@neko/ui`.
- Merging Preview's `MacButton`/`MacIconButton`/`MacSlider`/`ProgressBar`/`DocumentContextMenu` with the
  generic `@neko/ui/primitives` Button/IconButton/Slider/Progress/ContextMenu — these are seek/playback
  controls with media semantics, not generic primitives.
- Changing the live resize/drag/drop primitives or their canonical `@neko/ui/hooks` / `@neko/ui/primitives`
  entries.

## Decisions

### 1. Delete dead components, keep canonical owners

The ten dead components duplicate the canonical `primitives`/`creative` surfaces and have no consumer, so
they are deleted. The resize/drag/drop primitives stay in `shared-primitives/` as their physical location
and keep exactly one canonical public entry (`hooks` for hooks, `primitives` for `ResizeHandle`).

### 2. Remove the redundant public subpath

`./shared-primitives` is dropped from `@neko/ui` `exports`. The barrel `shared-primitives/index.ts` remains
as an internal re-export used only by `hooks/index.ts`, trimmed to the live symbols.

### 3. Keep Preview media controls local

Preview's `MacButton`/`MacIconButton`/`MacSlider`/`ProgressBar`/`DocumentContextMenu` carry media
semantics (seek bar with `currentTime`/`duration`/`onSeekCommit`, macOS-styled media chrome). They are not
generic primitives, so they are not migrated; doing so would require a Preview-specific adapter/wrapper for
a single consumer.

## Replacement Plan

1. Create OpenSpec artifacts.
2. Delete the ten dead files; trim `shared-primitives/index.ts`; remove the `./shared-primitives` subpath.
3. Run `@neko/ui` and `preview-webview` typecheck/build/test, `check:shared-exports`, `check:unused`,
   `check:openspec`, `check:webview-boundaries`, and Desktop typecheck.

## Risks / Trade-offs

- **`shared-primitives` barrel remains for one consumer** → it is internal-only after the subpath removal;
  it can be inlined into `hooks/index.ts` later if desired.
