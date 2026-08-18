# W1 Desktop DSH Subprocess Supervisor

## Implemented Scope

`apps/neko-desktop/src/main/desktop-dsh-subprocess-supervisor.ts` is a concrete Electron Main/process-trust-boundary supervisor for the DSH ACP subprocess. It does not own Agent/Session/Tool business rules.

The supervisor:

- requires an explicit absolute executable path and absolute working directory; it never scans `PATH`, resolves an implicit provider, or falls back to another runtime;
- passes only the caller-provided controlled environment, with `DSH_HOME`/`HOME` supplied explicitly by the owning composition;
- keeps stdout as the ACP byte transport, stderr as a separate diagnostic channel;
- reports normal exit, unexpected exit, spawn errors, stop timeouts, and dispose idempotently;
- exposes `restart()` that stops the current owned child before starting the replacement, without a second concurrent runtime;
- exposes `dispose()` on both handle and supervisor for idempotent resource release.

## Focused Verification

Commands run in the integration worktree:

```bash
pnpm --dir apps/neko-desktop exec vitest run src/main/desktop-dsh-subprocess-supervisor.test.ts
pnpm --dir apps/neko-desktop exec tsc --noEmit --strict --noUncheckedIndexedAccess --noImplicitOverride --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM --types node --skipLibCheck --esModuleInterop src/main/desktop-dsh-subprocess-supervisor.ts src/main/desktop-dsh-subprocess-supervisor.test.ts
```

Both passed. Full Desktop typecheck remains blocked by the intentionally incomplete delete-first migration state outside this task; the focused supervisor files typecheck cleanly.

This evidence covers the supervisor-focused portions of OpenSpec task 4.1 and task 4.13. Task 4.1 remains open: the repository currently has no packaged `@deepseek-ai/dsh` executable in Forge `extraResource` and no Desktop composition-root resolver/wiring, so validating a caller-provided absolute executable is not full executable resolution. Product executable resolution, packaged resource layout, and composition-root wiring remain to be implemented before 4.1 can be checked. It does not claim completion of the full W1 migration.
