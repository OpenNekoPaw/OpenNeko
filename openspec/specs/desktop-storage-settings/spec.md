# desktop-storage-settings Specification

## Purpose
Define host-owned Desktop storage projection, default project location and safe native directory actions.
## Requirements
### Requirement: Settings projects actual storage without filesystem authority leakage

The Desktop SHALL project application data, registered project storage and media-library locations with usage or a local diagnostic. Renderer requests SHALL identify controlled targets and SHALL NOT carry raw host paths.

#### Scenario: One storage root is unreadable

- **WHEN** one storage root cannot be measured
- **THEN** that entry shows a diagnostic while readable sibling entries remain available

### Requirement: Default workspace changes only future project selection

Changing the default workspace locator SHALL affect only subsequent project directory selection and SHALL NOT move or rewrite existing project records.

#### Scenario: Existing projects remain registered

- **WHEN** the user changes the default workspace directory
- **THEN** existing project locators and content remain unchanged

### Requirement: Font size applies to the complete Desktop UI

Font-size preferences SHALL be applied at the Renderer root and SHALL NOT scale only the Settings overlay.

#### Scenario: Large font selected

- **WHEN** the user selects large font size
- **THEN** the background Desktop UI and Settings overlay use the same root scale
