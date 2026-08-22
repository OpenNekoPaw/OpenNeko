## Why

The canonical `~/.neko/config.toml` reader currently rejects the whole Agent configuration when it
encounters an unknown field and treats provider `api_key` as unknown, while one invalid provider or
model also disables valid siblings. This conflates extensible user-authored input, secret handling,
and runtime validity, causing valuable local configuration to disappear instead of failing locally.

## What Changes

- Ignore unsupported TOML fields without diagnostics, runtime projection, export, or rewrite support.
- Parse provider `api_key` as a supported secret through a Host-only credential projection; never add
  it to ordinary provider/model DTOs, Renderer messages, logs, diagnostics, or portable exports.
- Replace whole-document semantic validation with field/record-local diagnostics so valid providers,
  models, MCP servers, and bindings remain usable when a sibling is invalid.
- **BREAKING** Remove internal compatibility paths and false-supported fields: `base_url`, legacy model
  `protocol`, `ui_locale`, `prompt_locale`, and provider/model/MCP override maps no longer participate
  in runtime configuration.
- Keep malformed TOML syntax and an unreadable file as document-blocking failures; keep known invalid
  values fail-visible at their exact owning field or record.
- Amend credential authority policy so explicitly authored provider API keys are parsed by the product
  config owner and consumed only through a host-only credential port, without migration, dual write,
  environment fallback, or secret export.

## Capabilities

### New Capabilities

- `user-config-parsing`: Defines tolerant unknown-field handling, local semantic diagnostics, canonical
  fields, and secret-safe provider credential parsing for the user TOML document.

### Modified Capabilities

- `agent-storage-authority`: Defines the exact ownership and runtime projection of explicitly authored
  provider API keys without mixing them into ordinary Agent configuration facts.
- `local-storage-authority-policy`: Allows the user-authored config owner to hold an explicitly entered
  provider API key while preserving host-only access and forbidding migration or fallback authorities.

## Impact

- Owning responsibility: `@neko/host` owns user TOML parsing, canonical field projection, local
  diagnostics, and the Host-only credential source contract.
- Producer: `packages/host/src/settings`; consumers: `@neko/agent-runtime` credential composition and
  the Desktop Main composition adapter. Renderer receives only secret-free provider status and local
  diagnostics through package-owned Agent contracts.
- Affected code includes Host config parsing/management, Agent credential runtime composition,
  secret-safe Desktop wiring, Agent configuration diagnostics, and their producer/consumer tests.
- Existing `version`, retired fields, aliases, and override maps remain untouched on disk until an
  explicit config write, but they no longer select runtime behavior. Existing provider `api_key`
  values become usable without an automatic migration or second persisted copy.
- No cloud synchronization, remote credential service, schema version, table version, data migration,
  compatibility shim, or fallback reader is introduced.
