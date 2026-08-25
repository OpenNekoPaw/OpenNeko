## Why

OpenNeko currently hard-codes a product-owned subset of dialogue Provider presets and protocol values, so the settings UI and validation can lag behind the exact capabilities of the locked DSH runtime. Provider execution capability should come from DSH while the user's selected Provider, endpoint, credential reference, model catalog, and defaults remain in the canonical OpenNeko configuration file.

## What Changes

- Make the locked DSH runtime's public Provider capability catalog the authority for dialogue execution protocols and their configuration requirements.
- Project that catalog through the Host boundary so Desktop settings expose DSH-supported choices without maintaining a parallel protocol whitelist.
- Continue to persist user Provider and model configuration only in `~/.neko/config.toml`, with credentials retained by the Host credential authority.
- Reject unavailable or malformed DSH capability entries locally and visibly while preserving valid sibling capabilities and unrelated settings.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `desktop-dsh-provider-settings`: Derive dialogue Provider creation and protocol selection from DSH's public capability catalog while retaining OpenNeko TOML and Host credentials as the user configuration authorities.

## Impact

- DSH subprocess/profile integration must expose a bounded, secret-free Provider capability projection.
- `@neko/host` continues to own user Provider/model configuration and validates selections against the current DSH capability projection instead of a local protocol list.
- Desktop Main composes the DSH capability source with Host settings; preload/renderer consume only a typed settings projection.
- The Agent settings surface becomes data-driven for dialogue Provider/protocol choices without importing DSH runtime packages or private schemas into Renderer code.
