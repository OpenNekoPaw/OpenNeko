# desktop-generation-model-settings Specification

## Purpose

Define validated default image, video, audio and music generation model settings without duplicating provider routing.

## Requirements

### Requirement: Generation defaults use canonical type defaults

Image, video, audio and music settings SHALL write exact model references to the existing canonical `default_models` fields. Audio and music SHALL remain separate flat model types because their provider operations and required capabilities are not interchangeable. No purpose-specific default-model configuration SHALL be created.

#### Scenario: Image default is changed

- **WHEN** the user selects an enabled image model from an available provider
- **THEN** subsequent image generation resolves that exact model through the existing generation provider resolver

#### Scenario: Music and audio use different defaults

- **WHEN** the user configures an audio model and a music model
- **THEN** the settings projection preserves independent `default_models.audio` and `default_models.music` references
- **AND** an installed operation resolves only the default for its declared model type
- **AND** neither type falls back to the other model type

### Requirement: Invalid generation bindings fail visibly

A default model update SHALL reject missing, disabled or type-incompatible Provider/Model references and SHALL NOT fallback to another model.

#### Scenario: Video target references an image model

- **WHEN** an image model is submitted as the video default
- **THEN** the update fails locally and the previous video default remains unchanged
