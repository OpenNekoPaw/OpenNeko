## MODIFIED Requirements

### Requirement: Secrets and raw logs use dedicated authorities

Credentials, provider tokens, mount secrets and encryption material MUST use a dedicated sensitive
authority. A user-authored provider `api_key` MAY use the product-owned local configuration document
as its explicit authority only when the config owner keeps the secret outside ordinary DTOs and
projects it through a Host-only credential port. Credentials entered through protected product UI
MUST use SecretStorage/keychain. Raw logs/audit data MUST use owner-partitioned managed files with
retention/redaction and MUST NOT be stored as ordinary SQLite rows or replayed as business facts.

#### Scenario: Provider credential is configured in the user document

- **WHEN** a provider explicitly declares a valid `api_key` in canonical user TOML
- **THEN** the product config owner parses the secret under that provider identity
- **AND** secret bytes never enter SQLite, ordinary config facts, logs, Renderer projection or export
- **AND** no automatic migration or second persisted credential copy is created

#### Scenario: Provider credential is entered through protected UI

- **WHEN** the user enters a credential through the product credential interaction
- **THEN** SecretStorage/keychain is its sole persisted authority
- **AND** the product does not write the secret into user TOML
