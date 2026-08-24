## ADDED Requirements

### Requirement: Dialogue and generation Provider catalogs remain separate

Desktop Settings SHALL expose separate dialogue and generation Provider add flows. Dialogue presets SHALL
only create DSH-expressible LLM Provider configurations; generation presets SHALL only create Provider
configurations consumed by GenerationJob execution.

New or edited Provider configurations SHALL belong to exactly one directory. Existing readable records that
declare both families remain visible until the user splits them, but cannot be saved again as a hybrid owner.

#### Scenario: MiniMax is added from generation settings

- **WHEN** the user selects the MiniMax H3 generation preset and saves a credential-bearing endpoint
- **THEN** the Provider is persisted with exact type `minimax` and family `generation`
- **AND** it has no fabricated DSH dialogue protocol

#### Scenario: Dialogue preset cannot own a video model

- **WHEN** a video model is submitted for a dialogue-only Provider
- **THEN** the mutation fails locally and no ModelConfig is persisted

### Requirement: Provider presets populate canonical connection metadata

Each builtin preset SHALL provide the exact Provider type, default endpoint, connection kind, credential
requirement and optional dialogue protocol. Editing the endpoint SHALL NOT change the Provider type.

#### Scenario: Official MiniMax URL is replaced

- **WHEN** the user changes the MiniMax preset URL to a compatible custom endpoint
- **THEN** the saved Provider remains type `minimax`
- **AND** runtime routing does not infer another Adapter from the URL

### Requirement: Builtin model templates express application support

Model templates SHALL contain exact API model identity, ModelType and application-supported capabilities.
Remote Provider model availability SHALL NOT silently grant unsupported application capabilities.

#### Scenario: H3 template is selected

- **WHEN** the user adds the H3 template to a MiniMax Provider
- **THEN** ModelConfig uses API model name `MiniMax-H3`, type `video` and the template capabilities

#### Scenario: Unsupported MiniMax model is entered

- **WHEN** a MiniMax generation Provider receives a custom video model not owned by a builtin template
- **THEN** saving fails visibly without creating a generic or fallback execution path

### Requirement: Configuration refresh reaches all current consumers

After a successful Provider/model mutation, all instantiated ConfigManager owners SHALL reload the canonical
configuration. DSH refresh SHALL retain its `applied`/`pending` lifecycle, while existing GenerationJobs SHALL
not be rewritten.

#### Scenario: Workspace ConfigManager already exists

- **WHEN** application settings change a generation Provider or model
- **THEN** the existing Workspace ConfigManager reloads the same canonical configuration
- **AND** subsequent GenerationJobs resolve the new configuration
