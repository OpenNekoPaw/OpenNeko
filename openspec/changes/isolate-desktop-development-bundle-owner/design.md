## Context

`@electron-forge/plugin-vite` owns the development build lifecycle and removes `apps/neko-desktop/.vite` in its `preStart` hook. Both the normal developer command and `scripts/desktop-functional/runner.mjs` currently invoke the same `@neko/app-desktop dev` script. A second invocation can therefore erase hashed Main chunks while the first Electron Main still holds an older entry graph in memory. Lazy provider loading then requests a chunk that no longer exists.

This is a local build-output ownership problem. Agent provider routing correctly requests the OpenAI completions adapter, and the current build contains that adapter under a newer hash. Recovering inside the provider or transcript would hide the build defect and leave every other lazy Main chunk exposed to the same race.

Five-layer analysis:

- **Responsibility:** repository development orchestration owns exclusive access to the disposable `.vite` build output. Electron Main owns application runtime, not cross-process build locking.
- **Dependency:** the launcher uses Node process/filesystem primitives before Forge starts. No renderer, preload, package domain or Agent contract depends on it.
- **Interface:** the existing `@neko/app-desktop dev -- <electron args>` command remains canonical; only its package script implementation delegates through the owner launcher.
- **Extension:** every normal and functional development launch passes through the same owner boundary. Packaged scenarios bypass it because they consume immutable package output.
- **Testing:** deterministic tests cover acquisition, conflict, stale recovery, token-fenced release and argument forwarding. A development process test proves rejection occurs before Forge deletes `.vite`.

Ownership evidence:

- **Owner / package role:** repository test/development tooling under `scripts/desktop-functional`; `apps/neko-desktop` only wires its development command to that tooling.
- **Canonical path:** root or functional runner -> `pnpm --filter @neko/app-desktop dev` -> development owner launcher -> `pnpm exec electron-forge start`.
- **Producer / consumers:** the launcher produces one process-owned lock record; normal developers and the Desktop functional runner consume the same command. Electron Forge consumes the unchanged application configuration only after acquisition succeeds.
- **Runtime boundary:** host Node tooling outside Electron Main/preload/renderer.
- **Replaced path:** direct package-script invocation of `electron-forge start` is removed. There is no alternate successful development launch in this checkout.
- **User data:** no user storage is read or changed. The lock is disposable tooling state under the OS temporary directory.

## Goals / Non-Goals

**Goals:**

- Prevent concurrent development starts from deleting or replacing the active checkout's Vite output.
- Fail before Electron Forge starts and provide an actionable owner diagnostic.
- Recover a well-formed owner record after its exact process is no longer alive.
- Release only the current launcher's ownership token.
- Preserve all existing Electron arguments, environment and process exit semantics.

**Non-Goals:**

- Run two development Electron instances from one checkout.
- Add fallback provider loading, retry a missing chunk or suppress the Agent diagnostic.
- Serialize packaged application executions.
- Change Vite chunk naming, disable lazy provider adapters or retain unbounded old chunks.
- Repair an already-running process whose build graph has already been replaced; the complete pre-change Forge launcher and any orphaned Electron process must exit before the guarded command starts. Restarting only the Electron window or entering `rs` leaves the unguarded Forge owner active and is insufficient.

## Decisions

### Use one atomic owner file keyed by canonical checkout path

The launcher derives a bounded lock filename from the canonical Desktop application directory and the OS temporary directory. It creates the file with exclusive-create semantics and restrictive permissions before spawning Forge. This avoids repository modifications and distinguishes separate checkouts.

Alternatives rejected:

- Stable chunk names do not prevent a mixed old/new graph and can collide across many generic `index` chunks.
- Retaining hashed chunks indefinitely hides concurrent ownership and allows unbounded stale output.
- Provider-level retry or re-import is a fallback around a corrupted application graph.
- A process scan is platform-specific and races with startup; the canonical launcher is a smaller owning boundary.

### Treat a live owner as a hard conflict

If the existing record is valid and its process is alive, the second launch throws before Forge executes. If the recorded process no longer exists, the launcher removes that exact stale record and retries atomic acquisition. An unreadable or malformed record fails visibly instead of being guessed stale.

### Fence release by an unguessable token

The record contains the launcher PID and a random ownership token. Cleanup rereads the record and removes it only when the token still matches, preventing an exiting older launcher from deleting a newer owner's record.

### Keep the existing public development command

`@neko/app-desktop` continues exposing `dev`, so root commands, functional scenarios and developer workflows do not gain a parallel entry. The launcher forwards all arguments to `electron-forge start` and propagates the exact exit status.

### Evaluation disposition

The defect can prevent provider behavior, but the change does not alter Agent prompts, models, Tool routing or provider contracts. Reuse `agent-runtime.stream-delivery` only as adjacent key-free regression evidence. The owning acceptance is deterministic orchestration plus a real development launch conflict because a real model cannot establish build ownership correctness.

## Risks / Trade-offs

- **[Stale PID is reused by an unrelated process]** -> conservatively reject the launch and report the owner file; never delete build output based on uncertain ownership.
- **[Launcher exits without normal async cleanup]** -> synchronous exit cleanup is token-fenced; a hard kill leaves a well-formed record that the next launch can reclaim after PID liveness fails.
- **[Existing direct Forge commands bypass ownership]** -> package/root/functional canonical commands are covered and tests assert the package script no longer directly starts Forge. Manually invoking the third-party CLI is unsupported tooling bypass.
- **[A pre-change direct Forge process remains alive]** -> terminate that exact Forge/Electron process chain before the first guarded launch. Window reload and Forge's `rs` Main restart do not replace the parent development command, so they cannot acquire the new owner.

## Migration Plan

1. Add the owner launcher and deterministic tests.
2. Atomically replace the package `dev` script with the launcher path.
3. Fully stop every pre-change `electron-forge start` process for this checkout, including an orphaned Electron child if its Forge parent already exited. Then start `@neko/app-desktop dev` once and verify the process chain includes `run-development.mjs`; an Electron window reload or `rs` restart is not a migration.
4. Run one development owner, attempt a second canonical launch, and verify the second fails without changing the first owner's sentinel/build files.

Rollback restores the direct package script and removes the launcher; no user or project data requires migration.

## Open Questions

None.
