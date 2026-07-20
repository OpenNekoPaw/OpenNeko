## ADDED Requirements

### Requirement: Extension Host loads the packaged NativeEngine through one validated boundary

The Engine extension SHALL lazily load the CommonJS `@neko-engine/host-napi` package through one Engine-owned boundary, SHALL resolve the binding object from the Node 24 dynamic-import namespace `default`, and MUST validate `NativeEngine.create` before starting Engine work. NativeMediaEngine, export, and frame-provider consumers MUST use that same boundary.

#### Scenario: Load the Node 24 CommonJS namespace

- **WHEN** dynamic import returns a namespace whose `default` value contains a callable `NativeEngine.create`
- **THEN** the canonical loader creates and returns the NativeEngine instance

#### Scenario: Reject an invalid packaged binding

- **WHEN** the imported namespace does not expose a callable `default.NativeEngine.create`
- **THEN** Engine startup fails with a specific native-module contract diagnostic before accepting media work

### Requirement: Engine loading failure remains visible at the owning boundary

The Engine extension MUST NOT replace native-module loading failure with a media timeout, alternate implementation, empty result, or successful no-op. Cut MAY continue timeline-only editing but SHALL receive Engine unavailable status until a valid Engine instance exists.

#### Scenario: Native Engine cannot start

- **WHEN** the canonical native-module boundary rejects the packaged module
- **THEN** the Engine command returns failure, Cut reports Engine unavailable, and no media request is presented as successful

#### Scenario: Native Engine starts successfully

- **WHEN** the packaged module satisfies the boundary and creates an Engine instance
- **THEN** Cut receives Engine ready status and media requests route through the existing Engine-backed service
