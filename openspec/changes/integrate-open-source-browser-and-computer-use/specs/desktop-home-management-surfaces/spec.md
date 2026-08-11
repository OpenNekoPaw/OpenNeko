## MODIFIED Requirements

### Requirement: Extensions manages Skills and extension packages

The Extensions Surface MUST manage global personal/plugin Skills and OpenNeko extension packages through the canonical
Agent extension application service. For reviewed first-party packages it MUST support platform artifact installation,
enable, disable, update and removal as distinct operations. Runtime readiness MUST separately report package integrity,
enablement, dependency/MCP connection, platform qualification and required Host permissions. It MUST NOT install or
update a runtime merely because the user opened Agent, Extensions, a Skill or a conversation.

#### Scenario: User installs an automation extension

- **WHEN** the user confirms installation after reviewing publisher, package release, platform, download size, licenses
  and declared capabilities
- **THEN** Main SHALL download the exact artifact to staging, verify checksum, package containment, provenance and
  license inventory, and atomically install it under the OpenNeko extension root
- **AND** installation SHALL NOT execute a remote shell, curl, pip, uv, npm or upstream install script
- **AND** the extension SHALL remain disabled until the user explicitly enables its declared permissions

#### Scenario: User enables an installed automation extension

- **WHEN** the user enables an installed Browser Use or Computer Use extension
- **THEN** the extension service SHALL validate the current platform artifact and permission declaration, connect the
  exact MCP server, discover and filter the reviewed Tool set, and project runtime readiness
- **AND** only Tools whose effective policy is valid SHALL enter Pi
- **AND** install success or manifest declarations SHALL NOT produce ready status

#### Scenario: Installation is interrupted

- **WHEN** download cancellation, network failure, disk exhaustion, verification failure or application restart
  interrupts installation
- **THEN** only the exact operation-owned staging data SHALL be discarded or resumed for the same artifact identity and
  digest
- **AND** the installed authoritative package and sibling extensions SHALL remain unchanged

#### Scenario: User leaves Extensions during download

- **WHEN** an install or update download is active and the Extensions scene unmounts
- **THEN** the extension application service SHALL continue or explicitly cancel the exact background operation according
  to the user action
- **AND** reopening Extensions SHALL project its current progress without retaining the previous React Root

#### Scenario: User updates an extension

- **WHEN** a newer reviewed plugin release is available and the user confirms update
- **THEN** the extension service SHALL stage and qualify the exact new platform artifact before committing the package
  replacement
- **AND** update SHALL be rejected while an Agent turn or automation session owns the extension
- **AND** a failed candidate SHALL leave the previously installed package authoritative without registering a parallel
  runtime path

#### Scenario: Update expands permissions

- **WHEN** an update adds a Tool, action class, environment secret, network scope, OS capability or data access
- **THEN** the candidate SHALL remain unregistered and disabled until the user separately accepts the expanded declared
  capability set
- **AND** previous enablement or OS permission SHALL NOT authorize the expansion

#### Scenario: User disables or removes an active automation extension

- **WHEN** the exact extension owns an active automation session
- **THEN** disable and remove SHALL fail visibly until the user stops or takes over that session
- **AND** unrelated extensions and conversations SHALL remain available

#### Scenario: Marketplace is refreshed

- **WHEN** the user refreshes the bundled reviewed catalog
- **THEN** no runtime artifact SHALL download or execute
- **AND** unknown, unsigned, checksum-invalid or unsupported-platform records SHALL not become installable

#### Scenario: Extension introduction follows the Desktop locale

- **WHEN** an extension manifest declares a localized introduction for the current Desktop locale
- **THEN** Extensions SHALL display that introduction consistently in grid/list results and the selected configuration detail
- **AND** search SHALL use the same locale-resolved introduction
- **AND** a locale without a declared introduction SHALL display the manifest's canonical default introduction
- **AND** invalid locale keys or localization metadata SHALL invalidate only the affected plugin manifest

### Requirement: First-delivery catalog trust is application-anchored

The first Browser Use and Computer Use delivery MUST use only the reviewed catalog shipped inside the signed OpenNeko
application as the catalog authenticity root. Network access MAY download only the exact artifact named by that catalog.
A remotely mutable catalog MUST NOT be introduced without a separate trust, key-rotation and revocation design.

#### Scenario: Network content attempts to change the catalog

- **WHEN** refresh or artifact download returns a new package record, release, URL, digest or permission declaration not
  present in the application-owned catalog
- **THEN** the record SHALL be rejected
- **AND** installed packages and the reviewed catalog SHALL remain unchanged

### Requirement: Installed package facts remain visible and independently owned

The extension application service MUST separately own installed artifact identity and digest, enablement, accepted
declared permissions and operation ownership. Current integrity, MCP connection, OS permission and platform
qualification MUST be queried facts used to compute readiness. An invalid installed package MUST remain visible and
MUST NOT execute.

#### Scenario: Installed package becomes invalid

- **WHEN** an installed package fails manifest, digest, signature or executable validation
- **THEN** Extensions SHALL retain its package identity and display an invalid diagnostic with explicit reinstall and
  remove actions
- **AND** it SHALL not hide, auto-repair, enable or register the package

#### Scenario: User removes an extension runtime

- **WHEN** the user confirms runtime removal while the extension owns no active turn, process or automation session
- **THEN** the installed runtime SHALL move to trash
- **AND** browser profiles, downloads and extension data SHALL remain until a separate data-removal action is confirmed
