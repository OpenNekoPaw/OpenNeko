## ADDED Requirements

### Requirement: Generation defaults use canonical type defaults

Image, video and audio settings SHALL write exact model references to the existing canonical `default_models` fields consumed by generation runtime.

#### Scenario: Image default is changed

- **WHEN** the user selects an enabled image model from an available provider
- **THEN** subsequent image generation resolves that exact model through the existing generation provider resolver

### Requirement: Invalid generation bindings fail visibly

A default model update SHALL reject missing, disabled or type-incompatible Provider/Model references and SHALL NOT fallback to another model.

#### Scenario: Video target references an image model

- **WHEN** an image model is submitted as the video default
- **THEN** the update fails locally and the previous video default remains unchanged
