## Why

Electron Forge removes the shared `apps/neko-desktop/.vite` directory whenever a development instance starts. Starting an isolated Desktop functional scenario while another development app is running can therefore replace hashed Main chunks underneath the first process, leaving it unable to load a provider adapter and exposing `Cannot find module './openai-completions-*.cjs'` in the Agent transcript.

## What Changes

- Establish one exclusive owner for the development Vite bundle directory per repository checkout.
- Make every `@neko/app-desktop dev` launch acquire ownership before Electron Forge can delete or rebuild `.vite`.
- Reject a concurrent development launch with an explicit diagnostic while leaving the active application and its build output untouched.
- Reclaim an owner record only when its process is no longer alive, and release only the exact ownership token acquired by the current launcher.
- Keep packaged Desktop functional scenarios independent from the development bundle owner.
- Add deterministic orchestration tests and real development-launch evidence for conflict rejection and later owner reuse.

## Capabilities

### New Capabilities

- `desktop-development-bundle-ownership`: Defines exclusive development Vite output ownership, stale-owner recovery and fail-visible concurrent launch behavior.

### Modified Capabilities

None.

## Impact

- `scripts/desktop-functional` owns the repository-local Desktop development launcher and functional-runner orchestration. It gains the exclusive owner lifecycle and tests.
- `apps/neko-desktop` remains the thin Electron composition root; its `dev` script delegates to the launcher before Electron Forge starts. No Main, preload, renderer, Agent, provider or package-owned business contract changes.
- Development startup behavior changes: a second development instance from the same checkout is rejected instead of deleting the active instance's Vite chunks. Packaged application behavior and user data are unchanged.
- No dependency, persisted project, configuration, credential, conversation or artifact migration is introduced.
