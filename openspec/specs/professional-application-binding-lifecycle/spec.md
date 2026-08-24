# professional-application-binding-lifecycle Specification

## Purpose

Define how users add, enable, disable and remove OpenNeko bindings to supported Professional Applications without mutating the external applications.

## Requirements

### Requirement: Supported profiles and added integrations are distinct

The Professional Applications surface SHALL keep the immutable supported-profile catalog separate
from user-added bindings. A profile SHALL be considered added only when its canonical binding exists.

#### Scenario: User views added integrations

- **WHEN** the user selects the Added view
- **THEN** only profiles with a durable binding are shown
- **AND** unbound supported profiles remain available in the All view

### Requirement: Integration enablement gates execution

Every projected binding SHALL expose explicit enablement. The binding repository SHALL own its
enablement record; absence of an enablement override has the permanent canonical meaning "enabled".
Disabled bindings SHALL remain manageable but MUST NOT participate in launch, handoff, Agent
operation projection or workflow execution.

#### Scenario: User disables an integration

- **WHEN** the exact sender-bound surface disables an added integration
- **THEN** the owning service persists the disabled binding and returns the updated projection
- **AND** subsequent execution for that integration is rejected visibly
- **AND** sibling integrations remain usable

### Requirement: Removing an integration preserves the external application

Removal SHALL delete only the OpenNeko binding after explicit user confirmation. It MUST NOT delete,
move, uninstall or modify the external application or its vendor-managed data.

#### Scenario: User removes an integration

- **WHEN** the user confirms removal of an added Professional Application
- **THEN** its binding is removed from local metadata
- **AND** the profile returns to the available All catalog
- **AND** no external application file or installation is changed
