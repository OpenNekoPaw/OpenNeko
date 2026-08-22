# media-provider-request-timeout Specification

## Purpose
TBD - created by archiving change align-agent-auto-mode-and-media-http-timeout. Update Purpose after archive.
## Requirements
### Requirement: NewAPI image transport uses the owning image timeout

The NewAPI image adapter SHALL allow up to ten minutes for response headers and response body delivery while remaining bounded by the owning image task AbortSignal.

#### Scenario: Provider returns after more than five minutes

- **WHEN** the configured NewAPI image endpoint accepts a request and returns a valid response after more than five minutes but before ten minutes
- **THEN** the client SHALL continue waiting and materialize the generated output
- **AND** SHALL NOT fail because of a five-minute transport default

#### Scenario: Image transport exceeds ten minutes

- **WHEN** the NewAPI image request does not complete within ten minutes
- **THEN** the owning request SHALL abort with an explicit image transport or task timeout diagnostic
- **AND** SHALL release its request-scoped transport resources

### Requirement: NewAPI routing does not fail over implicitly

The NewAPI image adapter SHALL send each request only to the exact configured provider URL and SHALL NOT switch to a secondary host after timeout, connection failure or ambiguous submission outcome.

#### Scenario: Configured endpoint fails

- **WHEN** the exact configured NewAPI endpoint times out or closes the connection
- **THEN** the request SHALL fail visibly against that endpoint
- **AND** SHALL NOT retry the operation through another domain

#### Scenario: Submission outcome is unknown

- **WHEN** the connection closes after an image request may have been submitted
- **THEN** the adapter SHALL mark the outcome unknown and non-retryable
- **AND** SHALL NOT automatically resubmit or switch provider URL

### Requirement: Fresh Neko Gateway routing is canonical

The fresh built-in Neko Gateway configuration SHALL use `https://www.nekoapi.com`. The custom NewAPI provider SHALL remain unset until the user supplies its URL.

#### Scenario: Fresh configuration resolves the canonical gateway

- **WHEN** the application constructs fresh provider defaults
- **THEN** the built-in Neko Gateway URL SHALL be `https://www.nekoapi.com`
- **AND** the custom NewAPI provider URL SHALL remain empty
