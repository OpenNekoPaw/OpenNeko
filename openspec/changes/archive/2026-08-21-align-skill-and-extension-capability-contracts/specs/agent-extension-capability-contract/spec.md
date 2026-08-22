## ADDED Requirements

### Requirement: Portable Skill is independently usable

The repository SHALL define a portable Skill as a directory containing `SKILL.md` and optional relative resources, and SHALL NOT require an OpenNeko plugin manifest, marketplace entry, MCP configuration, or private Skill overlay for Skill discovery, creation, validation, or loading.

#### Scenario: Load a plain project Skill

- **WHEN** a valid project Skill contains `SKILL.md` without plugin or MCP metadata
- **THEN** the documented canonical Skill path classifies it as independently discoverable and loadable

### Requirement: Composition and distribution remain separate

The repository SHALL classify the OpenNeko plugin manifest as a Host-specific composition contract used only for a shared install lifecycle, and SHALL classify the marketplace index as replaceable distribution data that is not runtime authority for installed packages or Skills.

#### Scenario: Skill does not need packaging metadata

- **WHEN** an author creates a single portable Skill
- **THEN** neither `plugin.json` nor `marketplace.json` is a required artifact

#### Scenario: Installed package outlives marketplace discovery

- **WHEN** a marketplace source no longer lists an already installed package
- **THEN** the documented runtime validity of that package is determined by installed package state rather than the marketplace index

### Requirement: MCP is an optional isolated adapter

The repository SHALL classify MCP as an optional external Tool adapter rather than the base protocol for Skills, package-owned Host capabilities, Extension Management, or marketplace discovery. Skill and MCP contributions SHALL be independent, and a failed MCP contribution SHALL NOT imply failure of an otherwise valid Skill or unrelated capability.

#### Scenario: Skill package has no MCP server

- **WHEN** a Skill or Skill-only composition package declares no MCP contribution
- **THEN** the capability contract classifies the Skill path as supported without degraded status

#### Scenario: MCP adapter fails locally

- **WHEN** one MCP server cannot connect
- **THEN** the capability contract requires the diagnostic and failure to remain scoped to that contribution while independent Skills and capabilities remain available

### Requirement: Compatibility claims are evidence based

The repository SHALL maintain a machine-readable capability surface that distinguishes portable-standard, OpenNeko-host-extension, executable, management-only, unsupported, and internal-experimental behavior, with canonical source evidence for each current claim.

#### Scenario: Inspect standards compatibility

- **WHEN** a maintainer reads the capability surface
- **THEN** Agent Skills, Agent Plugins, and MCP each have an explicit compatibility classification that does not claim unsupported behavior

### Requirement: Capability surface is audit input only

The machine-readable capability surface SHALL NOT be imported by production code or act as a runtime registry, installation catalog, permission authority, feature flag, schema generation, or compatibility dispatch path.

#### Scenario: Run extension capability audit

- **WHEN** the repository validation command reads the capability surface
- **THEN** it only compares documented facts with canonical files and returns fail-visible diagnostics without mutating runtime or user data

### Requirement: Boundary drift fails validation

The repository SHALL provide an automated check that rejects stale private Skill overlay claims, any statement that plugin or marketplace metadata is required for plain Skills, any statement that MCP is a universal extension prerequisite, and missing canonical evidence paths.

#### Scenario: Private overlay returns to an Accepted ADR

- **WHEN** an Accepted Skill architecture document again declares `agents/neko.yaml` as part of the canonical Skill format
- **THEN** the automated boundary check fails with an exact diagnostic

#### Scenario: Capability evidence path disappears

- **WHEN** a path named by the machine-readable surface no longer exists
- **THEN** the automated boundary check fails instead of preserving a stale compatibility claim

### Requirement: Evaluation disposition matches behavior impact

The change SHALL record that provider-backed Agent Evaluation is excluded because P0 changes documentation and static audit only, and SHALL require a new evaluation selection if later work changes Skill content, activation, Tool registration, capability routing, MCP injection, or Agent-visible behavior.

#### Scenario: P0 static boundary change is reviewed

- **WHEN** maintainers assess evaluation coverage for this change
- **THEN** the change records deterministic OpenSpec and boundary checks as evidence and does not misrepresent them as Agent behavior evidence
