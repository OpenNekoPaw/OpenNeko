# canvas-media-host-contract Specification

## Purpose
TBD - created by archiving change close-p1-domain-boundary-gaps. Update Purpose after archive.
## Requirements
### Requirement: Canvas owns its media Host contract

The Canvas owning package SHALL define and export the single canonical media request, response, supported-kind catalog, and strict codecs used by Canvas Webview, Desktop preload, Desktop Main, and Desktop renderer adapters.

#### Scenario: Canonical producer and consumer

- **WHEN** Canvas Webview sends a media probe, playback, control, or frame request
- **THEN** every producer and consumer uses the same `@neko/canvas-domain` contract and no Desktop-local copy participates

### Requirement: Canvas Host messages use a closed route set

The Canvas Webview Host SHALL delegate only explicitly enumerated Canvas-owned media request kinds and SHALL reject every unknown message kind. Missing support SHALL fail visibly and SHALL NOT default to accepting arbitrary string message types.

#### Scenario: Supported media route

- **WHEN** the Webview emits a valid Canvas media request whose exact kind is supported by the installed delegate
- **THEN** the Host validates and delegates that request through the canonical media path

#### Scenario: Unknown route

- **WHEN** the Webview emits a message with an unregistered or malformed kind
- **THEN** the Host rejects it and does not call the delegate

### Requirement: Canvas media identity remains request-local

Canvas media codecs SHALL validate the exact Canvas runtime identity, node identity, authorized workspace locator fields, numeric playback fields, response owner, and resource descriptors for each request or response.

#### Scenario: Response owner mismatch

- **WHEN** a media response carries a node identity different from the pending request
- **THEN** the response is rejected without affecting sibling media nodes or the Canvas session
