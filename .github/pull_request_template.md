## Summary

- What changed:
- Why:
- User path affected:

## Risk Level

- [ ] L0 docs/copy/low-risk single-file fix
- [ ] L1 local component/hook/service/state logic
- [ ] L2 cross-layer contract, shared package, EngineClient, Webview/Extension message
- [ ] L3 Rust engine, Proto, media stream, rendering, project format, AI workflow, packaging
- [ ] L4 release, install/packaging, major UX, core creative workflow

## Impact Areas

- [ ] Webview / React
- [ ] VSCode Extension Host
- [ ] Rust engine
- [ ] Proto / generated types
- [ ] `@neko/shared` / `@neko/neko-client`
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
- [ ] UX evidence attached: screenshot, recording, or VSCode smoke
- [ ] Performance evidence attached: before/after data or fixture smoke
- [ ] Professional software comparison considered for core workflow changes

## Commands Run

```bash
# paste commands and key results
```

## Residual Risk

- Known gaps:
- Follow-up tasks:
