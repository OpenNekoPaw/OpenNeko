# dead-ui-shared-primitives-removal Specification

## Purpose
TBD - created by archiving change remove-dead-ui-shared-primitives. Update Purpose after archive.
## Requirements
### Requirement: Zero-consumer shared-primitives components are removed

The system SHALL delete the `Toolbar`, `CollapsibleSection`, `Panel`, `ContextMenu`, `TimelineRuler`,
`ProgressBar`, `MacButton`, `MacIconButton`, `MacSlider`, and `MacTabs` components from
`@neko/ui/shared-primitives`, and SHALL remove the `./shared-primitives` package subpath. The live
`ResizeHandle`, `useDrag`, `useFileDrop`, and `useResizable`/persisted-resize primitives SHALL remain
exported through `@neko/ui/primitives` and `@neko/ui/hooks`.

#### Scenario: Dead subpath is absent

- **WHEN** the `@neko/ui` manifest and barrel are inspected
- **THEN** `./shared-primitives` is not a public export
- **AND** the ten deleted components are not reachable from any public entry

#### Scenario: Live primitives keep their canonical entries

- **WHEN** a consumer imports `@neko/ui/hooks` or `@neko/ui/primitives`
- **THEN** `useResizable`/`useDrag`/`useFileDrop` and `ResizeHandle` remain available

### Requirement: Preview media controls remain Preview-owned

Preview's `MacButton`, `MacIconButton`, `MacSlider`, `ProgressBar`, and `DocumentContextMenu` SHALL remain
Preview-owned domain controls and MUST NOT be merged into generic `@neko/ui` primitives.

#### Scenario: Preview controls are unchanged

- **WHEN** Preview renders media or document viewers
- **THEN** the existing seek/playback and context-menu controls are used
- **AND** no generic `@neko/ui` primitive replaces them with different media semantics
