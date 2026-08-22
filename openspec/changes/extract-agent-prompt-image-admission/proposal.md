## Why

Desktop prompt-image admission currently mixes sender/Workspace authorization and Content byte reads
with Agent-owned MIME, model-capability, normalization, count, and total-payload policy.

## What Changes

- Add a package-owned Agent prompt-image admission service.
- Reduce Desktop to a sender-bound authorized reference-byte port.
- Preserve the existing canonical payload and fail-before-prompt behavior without fallback.
- Delete the replaced Desktop admission service path.

## Impact

- Owner: `@neko/agent-runtime` application/input behavior.
- Desktop owner retained: exact Conversation/Window/Workspace grant and Content read authorization.
- Canonical public entry: `@neko/agent-runtime/application`.
- User data: none; inline and referenced image wire payloads remain unchanged.
