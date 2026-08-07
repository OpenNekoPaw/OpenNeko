## Context

`@neko/host` currently casts a parsed TOML document to `NekoTomlConfig`, applies a small strict
unknown-field whitelist, then throws one `TomlConfigValidationError` for all semantic issues. The
throw converts the entire file into one blocking `ConfigReadResult`, so valid siblings disappear.
Provider `api_key` was removed from the TOML contract when ordinary provider definitions were made
secret-free, but that removal incorrectly coupled safe projection with source parsing.

The product is local-first. The canonical source is the user-authored `~/.neko/config.toml`; no cloud
sync, schema version, migration dispatcher, environment credential fallback, or legacy config reader
is in scope. Existing UI-entered credentials remain protected by the Agent CredentialStore.

## Goals / Non-Goals

**Goals:**

- Make unknown TOML fields inert while keeping known invalid values visible.
- Preserve valid provider/model/MCP records and bindings beside invalid siblings.
- Parse inline provider API keys without allowing secret bytes into ordinary config DTOs or exports.
- Select one credential owner per provider and make invalid explicit credentials fail closed.
- Delete the scoped aliases, override maps, no-op fields, diagnostics, and tests for old paths.

**Non-Goals:**

- Migrating, rewriting, deleting, or repairing existing user config automatically.
- Adding a cloud credential service, environment-variable resolution, or credential precedence chain.
- Changing provider protocols, model selection semantics, or Agent prompt behavior.
- Treating portable config import as the user TOML reader; portable imports retain their separate
  trust-boundary validation and remain secret-free.

## Decisions

### 1. `@neko/host` owns a structured user-config document result

The canonical Host public path will parse TOML into a result containing:

- a secret-free `UnifiedConfig` of usable records and fields;
- a Host-only provider credential snapshot keyed by exact provider identity;
- record/field-local diagnostics with stable owner identity;
- a document-blocking error only for unreadable files or malformed TOML syntax.

Unknown fields are not copied into any result. Known fields are decoded explicitly from `unknown`;
the parser does not trust a TypeScript cast as validation.

Alternative considered: loosen the existing whitelist and keep the throw-based validator. Rejected
because it still lets one invalid component disable every valid sibling.

### 2. Credential source selection is explicit and fail-closed

For a provider with a valid inline `api_key`, the user config document is that provider's credential
owner for the loaded snapshot. For a provider without the field, the existing interactive
CredentialStore/SecretStorage is the owner. If the field is present but invalid, the provider reports
the config credential diagnostic and MUST NOT read a stored or environment credential.

The Host-only credential port returns a credential plus provenance, or an owner-qualified diagnostic.
The Agent runtime consumes this port when building the provider snapshot. Ordinary provider
definitions remain `ProviderDefinition = Omit<ProviderConfig, 'apiKey'>`; Desktop renderer messages,
portable exports, logs, and diagnostics never contain the secret value.

Alternative considered: import the key into SecretStorage. Rejected because automatic copy/write is a
migration and creates two persisted authorities. Alternative considered: restore `apiKey` on ordinary
provider DTOs. Rejected because it broadens the secret propagation surface.

### 3. Semantic failure is localized by owner

Each provider, model and MCP entry is decoded independently. A failed record produces a diagnostic
with section, record identity when readable, field path and message. Duplicate identities invalidate
the conflicting entries without invalidating unrelated identities. Invalid default bindings remove
only that binding. Invalid top-level scalar fields remove only that scalar.

Malformed TOML syntax remains document-blocking because no stable record boundaries can be trusted.
Config availability is determined from the remaining valid records and can therefore be unavailable
for a specific purpose without claiming the whole document failed.

### 4. One canonical field path remains

`api_url` and `protocol_profile` remain canonical. `base_url`, model `protocol`, `ui_locale`,
`prompt_locale`, and all `*_overrides` maps are removed from production parsing, serialization,
manager APIs, templates, and ordinary tests. When present in a source document they are unknown and
therefore inert; no alias, warning, migration, or fallback path remains.

### 5. Desktop remains a thin adapter

`packages/host/src/settings` produces parsed config, credential source status and diagnostics.
`packages/agent/runtime` owns credential source selection and provider runtime composition through a
small injected port. `apps/neko-desktop` only wires the Host snapshot and protected SecretStorage
adapter because Electron userData/safeStorage access requires the Application boundary. No parsing,
credential precedence, or diagnostic policy remains in `apps/*`.

The canonical package entries are `@neko/host/settings` and `@neko/agent-runtime` public exports. The
producer is Host config parsing; consumers are Agent runtime composition and secret-safe Agent
configuration projection across Desktop Main/preload/renderer.

### 6. User-data handling is non-migrating

Startup reads the existing file without rewriting it. Unsupported fields remain untouched on disk
until the user invokes an existing structured write. A structured write emits only canonical fields
and preserves valid inline API keys through the Host-only document writer; it does not retain aliases,
override maps, retired fields, or unknown fields.

## Risks / Trade-offs

- [Existing configs rely on `base_url`, model `protocol`, or overrides] -> Those paths become inert by
  explicit prelaunch decision; diagnostics identify resulting missing canonical endpoint/binding while
  the original bytes remain untouched until an explicit write.
- [A secret leaks through a projection or export] -> Keep credentials outside `UnifiedConfig`, rebuild
  renderer/export DTOs from allowlists, add sentinel-secret tests, and scan diagnostics/log payloads.
- [Local diagnostics are accidentally treated as blocking] -> Separate blocking document status from
  recoverable diagnostics in the contract and test valid-sibling runtime selection.
- [Config writes drop valid inline keys] -> The Host document writer accepts the separate credential
  snapshot and round-trips only exact provider-owned keys in dedicated tests.
- [Real Agent behavior differs despite deterministic parser tests] -> This change does not alter prompt,
  tools, sessions, or provider/model selection for valid known fields, so Agent Evaluation is excluded;
  focused Host, Agent credential-runtime and Desktop composition tests provide deterministic evidence.

## Migration Plan

1. Delete unsupported-field blocking diagnostics and scoped alias/override APIs/tests.
2. Add the structured Host parse result and local diagnostic contract.
3. Add the Host-only credential snapshot/port and wire it into Agent credential selection.
4. Update secret-safe projections and structured writes.
5. Verify malformed TOML blocking, valid sibling retention, explicit invalid credential fail-closed,
   secret redaction, and absence of removed paths.

Rollback is source-code rollback only. No automatic data mutation occurs, so existing config bytes do
not need restoration.

## Open Questions

None. The latest product direction selects inline provider `api_key` as a supported explicit local
credential source and unsupported fields as inert input.
