# agent-resource-link-presentation Specification

## Purpose
TBD - created by archiving change render-agent-resource-links-as-file-links. Update Purpose after archive.
## Requirements
### Requirement: Agent resource links remain structured across DSH replay

The DSH bridge SHALL preserve ACP resource links as structured user-message presentation metadata and
SHALL replay them as ACP resource-link content. It SHALL NOT serialize resource identity into
model-visible or transcript-visible pseudo text.

#### Scenario: User submits text and one Workspace file

- **WHEN** Desktop submits ordered text and `resource_link` blocks through the canonical ACP prompt
- **THEN** DSH receives the user text and exact turn context without an encoded resource URI in model
  content
- **AND** live projection and Session replay emit one user message containing the same ordered text
  and resource blocks

#### Scenario: User submits only a Workspace file

- **WHEN** a valid prompt contains a resource link and no visible text
- **THEN** the DSH turn is admitted with the resource in exact turn context
- **AND** transcript presentation contains only the filename resource block, not a synthetic sentence

### Requirement: Desktop projects only canonical resource identities

Desktop Main SHALL decode Agent resource links into canonical `ContentLocator` values before crossing
the preload/Renderer contract. Invalid resource links SHALL fail locally and SHALL NOT expose their
URI or remove valid sibling transcript events.

#### Scenario: Resource URI is valid

- **WHEN** an ACP user-message block carries a valid `openneko-content:` URI
- **THEN** Desktop projects its label and validated `ContentLocator`
- **AND** the Renderer receives neither the encoded URI nor an absolute path

#### Scenario: Resource URI is malformed

- **WHEN** one projected resource has an unsupported scheme, malformed encoding, invalid JSON, or an
  invalid locator
- **THEN** Desktop emits a local resource-projection diagnostic for that event
- **AND** unrelated messages, resources, Conversations and Workspaces remain usable

### Requirement: Agent user messages render resources as filename links

The existing Agent user-message component SHALL render each structured resource block as the existing
compact filename reference token in source order. It SHALL preserve the existing bubble layout and
SHALL NOT render ACP syntax, encoded URIs or an additional outer container. Any secondary metadata
must use the same projection as the composer token.

#### Scenario: Long or Unicode filename is displayed

- **WHEN** a user message contains a long or Unicode resource label
- **THEN** the label and shared secondary metadata wrap or truncate within the existing user-message width without overlapping
  adjacent content
  - **AND** light and dark themes retain readable token and focus-state contrast

#### Scenario: Message mixes text and resources

- **WHEN** a user message contains text before or after one or more resources
- **THEN** all blocks render in their original order inside one existing user bubble
- **AND** no protocol text or duplicate resource container is shown
