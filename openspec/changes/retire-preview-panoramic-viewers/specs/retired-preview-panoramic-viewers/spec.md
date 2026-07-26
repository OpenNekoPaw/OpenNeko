## ADDED Requirements

### Requirement: Panoramic Preview viewers are absent

The product MUST NOT contribute, register, route to, or bundle panoramic image
or panoramic video Preview viewers.

#### Scenario: Preview package activation

- **WHEN** the Preview extension manifest and activation path are inspected
- **THEN** no `neko.preview.panoramic*` custom editor, command, menu, setting,
  provider, or Webview entry exists

#### Scenario: Agent opens a panorama-named file

- **WHEN** Agent opens an HDR image or a video whose name contains a panorama
  hint
- **THEN** the image uses the default editor and the video uses
  `neko.videoPreview`
- **AND** no retired panoramic view type is selected

#### Scenario: Canvas opens media

- **WHEN** Canvas requests Preview for an image, video, or audio asset
- **THEN** it selects only the normal VS Code editor or the canonical
  video/audio Preview editor
- **AND** no panoramic-thumbnail message or retired route participates

### Requirement: 3D panorama environments remain isolated

The product SHALL preserve Model Preview's authorized panoramic environment
source handling without exposing it as a standalone panoramic viewer.

#### Scenario: 3D environment selection

- **WHEN** Model Preview stages an authorized panoramic image environment
- **THEN** the model-owned source authorization validates and projects it
- **AND** no panoramic Preview command or custom editor is required

### Requirement: Video controls expose no Engine connection status

Video controls MUST NOT display the legacy connection dot or describe internal
playback-session state as an Engine connection.

#### Scenario: Playback has no active descriptors

- **WHEN** a video is loaded, stopped, or rejected by hardware capabilities
- **THEN** the controls remain usable
- **AND** no connection dot or disconnected label is rendered
- **AND** capability failures use the localized diagnostic notice
