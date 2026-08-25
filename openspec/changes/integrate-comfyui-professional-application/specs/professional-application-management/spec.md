## ADDED Requirements

### Requirement: Professional applications are a separate managed capability

The product SHALL present Skill, MCP and Professional applications as sibling entries in a unified
Capabilities and integrations destination. Professional application inventory, binding, readiness
and actions MUST use a separate strict contract and authority. The existing Skill/MCP projection MUST
remain exactly DSH-owned Skill and MCP facts and MUST NOT gain application, executable, installation
or OS readiness fields.

#### Scenario: User opens Professional applications

- **WHEN** the user selects Professional applications from Capabilities and integrations
- **THEN** the package-owned Professional applications surface requests its own sender-bound
  projection
- **AND** the existing Skill and MCP projection and authority remain unchanged

#### Scenario: Professional application projection fails

- **WHEN** one application profile cannot be decoded or probed
- **THEN** that profile shows a bounded diagnostic
- **AND** Skill, MCP, sibling application profiles and Agent Sessions remain usable

### Requirement: Discovery is limited to qualified profiles

The Professional applications catalog SHALL list only product-qualified profiles and SHALL probe only
the exact vendor application/service identities declared by those profiles. It MUST NOT scan arbitrary
executables, execute discovery candidates, infer support from an application name or add an unknown
installed application to the supported catalog.

#### Scenario: A qualified ComfyUI installation exists

- **WHEN** the ComfyUI profile's exact application identity or configured loopback service passes its
  compatibility and readiness probes
- **THEN** the catalog reports the precise detected and ready capabilities
- **AND** it records the detected third-party version where the provider exposes it

#### Scenario: An unrelated same-named executable exists

- **WHEN** discovery finds a same-named executable without the qualified application identity
- **THEN** it is rejected as a match with a visible diagnostic
- **AND** no launch or automation action becomes available

### Requirement: Users can edit local bindings but not qualification policy

The product SHALL let users edit the approved application locator, allowed endpoint, launch preference,
domain-owned defaults and revocable grants declared user-configurable by the profile. It MUST keep
vendor identity, qualified versions, supported operations, transport, risk and evidence policy
product-owned. Persisted bindings MUST use stable identity, an OS-issued opaque locator or a
variable-backed PathResolver form rather than a raw absolute path.

#### Scenario: User selects a different qualified installation

- **WHEN** the user selects and confirms a different installation through the native authorized picker
- **THEN** only that application's local binding is replaced
- **AND** readiness is re-evaluated against the immutable profile policy

#### Scenario: Stored binding is invalid

- **WHEN** a non-authoritative stored locator or default no longer satisfies its current contract
- **THEN** only that profile returns to the canonical unconfigured state with a repair action
- **AND** user content and sibling bindings are not rewritten

### Requirement: Installation and companion contributions require explicit confirmation

Application detection SHALL NOT install, update, enable or remove a professional application, Skill,
MCP server, custom node, model or language dependency. An official download/help action MAY be shown.
A qualified companion Skill or MCP contribution MUST use the existing DSH-owned explicit management
flow and MUST require user confirmation.

#### Scenario: ComfyUI is not installed

- **WHEN** the user views the qualified but unavailable ComfyUI profile
- **THEN** the surface may offer official installation guidance
- **AND** no installer or package is downloaded or executed automatically

#### Scenario: ComfyUI becomes detectable

- **WHEN** a newly installed ComfyUI instance passes discovery
- **THEN** its supported application operations become configurable
- **AND** no Skill or MCP contribution is installed or enabled as a side effect
