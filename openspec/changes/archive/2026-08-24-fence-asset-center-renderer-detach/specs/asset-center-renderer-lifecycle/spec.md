# Asset Center Renderer Lifecycle

## ADDED Requirements

### Requirement: Asset Center requests are fenced by the current Renderer identity

Every Asset Center Host request SHALL carry the exact `rendererSessionId` from the current Window Shell projection. Desktop Main SHALL validate the sender Window and Renderer identity before delegating to Assets Node. A stale read or mutation SHALL fail visibly and SHALL NOT reach the Asset Center session.

#### Scenario: Current Renderer requests an Asset operation

- **WHEN** the request Window and `rendererSessionId` match the authoritative Shell projection
- **THEN** Desktop Main delegates the request through the existing Asset Center runtime
- **AND** no alternate session or active-Window fallback participates

#### Scenario: Stale Renderer requests an Asset mutation

- **WHEN** an outgoing Renderer sends a non-detach request after the Window has registered a replacement Renderer
- **THEN** Desktop Main rejects the request with a stale-Renderer diagnostic
- **AND** the current Asset Center session remains unchanged

### Requirement: Stale Asset Center cleanup cannot release the replacement session

`session.detach` SHALL return an explicit lifecycle outcome. A detach from the current Renderer SHALL release the exact Asset Center session and return `detached`. A detach from a replaced Renderer SHALL return `stale` without calling Assets Node detach or changing the current Shell preview projection. A duplicate detach from the current Renderer SHALL remain fail-visible.

#### Scenario: Outgoing Renderer cleanup arrives after replacement attach

- **GIVEN** the Window has registered a replacement Renderer for the same Asset Center Scene
- **WHEN** the outgoing Renderer sends its delayed `session.detach`
- **THEN** Desktop Main returns the `stale` cleanup outcome
- **AND** the replacement Asset Center session and resources remain available
- **AND** no IPC handler error is emitted for the expected stale cleanup

#### Scenario: Current Renderer duplicates detach

- **GIVEN** the current Renderer already detached its Asset Center session
- **WHEN** that same Renderer sends another detach for the same session
- **THEN** the Assets Node unavailable-session diagnostic remains visible
- **AND** no default projection or fabricated success is returned
