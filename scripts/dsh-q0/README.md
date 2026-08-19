# DSH Q0

This standalone, non-release fixture qualifies the exact DSH subprocess and ACP boundary required by `replace-pi-with-dsh-runtime-atomically`.

It must not read the user's DSH credentials or profiles, contact a model provider, become a Desktop artifact, or import private DSH modules. A failed qualification blocks production consumer cutover and must not trigger a fallback runtime.

Run the deterministic boundary check with:

```bash
pnpm --dir scripts/dsh-q0 install --ignore-workspace
pnpm --dir scripts/dsh-q0 test
pnpm --dir scripts/dsh-q0 qualify
```

The fixture creates one isolated temporary `DSH_HOME` with three custom profiles. The recovery profile composes public `dsh-base` with the packaged `@neko/dsh-bridge` and a Q0-only contributor that materializes deterministic history, Tool events and inbox state without sending a provider prompt. It registers one fixture Tool through the official DSH ToolRuntime and exercises `success → typed failure → success`, exact Host Tool cancellation with a late success result, oversize request rejection before Host dispatch, oversize response rejection before DSH Tool success, and a valid success afterward through the bridge's ACP reverse Host port. The W2 profile additionally loads the packaged `@neko/generation-dsh-plugin` and `@neko/canvas-dsh-plugin` bundles and executes the real first-party Generation `describe` and Canvas `query` Tool definitions through the same runtime.

The Prompt-admission profile registers a Q0-only provider through DSH's public `LlmAdapter` boundary. Four standard ACP Prompt requests drive the real DSH Agent loop while external release files keep exactly two active, prove queued Sessions enter FIFO, and prove an exact queued cancellation never reaches the adapter. The adapter records only Session identity and active counts under the temporary `DSH_HOME`; it does not retain prompt content or contact a network provider.

The qualifier verifies exact Session/turn/call/Tool/operation identities and the `completed → failed → completed → cancelled/failed → failed → failed → completed` standard ACP projection, proving cancellation, payload-bound failures, and domain failure are local while later work still succeeds. It also verifies active-session inbox read/replace/remove with exact identities, live and replayed standard ACP Tool call/result updates, creates and closes a session, restarts to list/resume/close it without replay, restarts again to load/replay/close it, verifies standard ACP history updates plus exact OpenNeko event notifications, and requires clean shutdown. It rejects any stdout line that is not one JSON-RPC message. DSH rc.7 clears pending inbox during `AgentHandle.dispose()`, so pending-inbox preservation across close/restart remains explicitly unqualified. Real provider/API behavior, extension management, crash injection, and Desktop integration remain outside this qualification slice.
