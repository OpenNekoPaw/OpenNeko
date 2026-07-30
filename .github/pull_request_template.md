## Summary

- What changed:
- Why:
- User path affected:

For a Pull Request targeting `main`, the source branch must be `dev`.

## Risk Level

- [ ] L0 docs/copy/low-risk single-file fix
- [ ] L1 local component/hook/service/state logic
- [ ] L2 cross-layer contract, shared package, renderer/Desktop IPC message
- [ ] L3 Node/FFmpeg media runtime, Proto, media stream, rendering, project format, AI workflow, packaging
- [ ] L4 release, install/packaging, major UX, core creative workflow

## Impact Areas

- [ ] Webview / React
- [ ] Electron Main / preload / renderer
- [ ] Node/FFmpeg media runtime
- [ ] Proto / generated types
- [ ] `@neko/shared` / `@neko/media`
- [ ] Agent / AI workflow
- [ ] Assets / Market / Preview / Tools
- [ ] Docs / config / packaging

## Architecture Review

- Does this fit the existing architecture?
- How does this reduce coupling?
- Is it easy to extend and test?

For multi-module changes, summarize responsibility, dependency, interface, extension, and test impact.

## Functional Validation

- [ ] Main user path covered
- [ ] Empty/loading/error/cancel/retry states considered
- [ ] Contract changes tested or validated
- [ ] Regression test added for bug fix

## UX / Performance

- [ ] Not UI/performance sensitive
- [ ] UX evidence attached: screenshot, recording, or Desktop runtime smoke
- [ ] Performance evidence attached: before/after data or fixture smoke
- [ ] Professional software comparison considered for core workflow changes

## Commands Run

```bash
# paste commands and key results
```

- [ ] `pnpm gate:local` completed before promotion, or the blocking condition is recorded below

## Residual Risk

- Known gaps:
- Follow-up tasks:
