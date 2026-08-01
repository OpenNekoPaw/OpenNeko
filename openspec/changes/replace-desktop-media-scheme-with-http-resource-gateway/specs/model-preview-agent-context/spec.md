## MODIFIED Requirements

### Requirement: Model Preview uses one canonical typed Agent context

Preview SHALL send model evidence through the canonical `AgentContextPayload` discriminator
`model-preview`. The payload data MUST include a contract version, validated source
`ContentLocator`, source fingerprint, standard source format, normalized model facts, an
identity-bearing staging snapshot, and a validated locator for the bounded derived preview image.
It MUST NOT contain Three.js instances, runtime resource URLs, Webview URIs, panel authorization
tokens, raw absolute user paths, provider credentials, or provider/model routing arguments.

#### Scenario: Build a model preview context

- **WHEN** a valid model preview session submits a capture and staging snapshot for Agent delivery
- **THEN** the Extension materializes the bounded capture as a derived preview resource and constructs one `model-preview` context whose source, preview image, facts, and staging revision refer to the same source fingerprint and panel revision

#### Scenario: Reject an incomplete context

- **WHEN** the source locator, preview-image locator, fingerprint, contract version, session identity, or staging revision is missing or inconsistent
- **THEN** the bridge reports an invalid-context diagnostic and does not send a degraded payload as if the requested model evidence were complete
