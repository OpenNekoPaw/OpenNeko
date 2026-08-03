## Current design

`@neko/cut-domain` / `@neko/cut-node` own Cut document and export sessions;
`@neko/preview-domain` owns Preview View/session state and policy. Desktop Main owns sender/path
authorization, exact-resource registration, Workbench projection, concrete native adapters and application
disposal only. Preload exposes fixed typed intents; renderer mounts the package-owned Cut/Preview Roots and
never receives absolute paths or runtime handles.

Cut Stage and Timeline share one explicit document/session identity. Preview temporary, pinned and side
Views carry their own View/session/epoch and frozen resource dependency set. Close, reload and Project
switch dispose subscriptions, media leases, decoders and late events by identity.

Media bytes are projected only by the Main-owned OpenNeko resource gateway. OTIO edits and ExportJob
remain owned by Cut; Preview viewers remain owned by Preview. No demo timeline, active-editor fallback,
private scheme, arbitrary localhost URL, raw path or retired Host adapter can return production success.

## Remaining gate

After the remaining app-owned Cut/Preview session state moves to package public application entries and
the package-owned Electron scenarios pass, update current
capability documentation and Phase 1 program 5.x. The documentation must describe only the current
Desktop path and its remaining risks.
