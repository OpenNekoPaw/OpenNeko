## Why

OpenNeko currently reports 30 React Hook ordering warnings and 14 production `any` warnings without failing CI. These warnings include real render-order defects and contract escapes, while their report-only severity allows new violations to hide inside the existing warning volume.

## What Changes

- Refactor affected Webview renderers and components so Hooks execute only inside stable React component or custom Hook boundaries and in an unconditional order.
- Replace production `any` usage with existing shared contracts, precise generic constraints, or `unknown` plus narrowing at real message boundaries.
- Make `react-hooks/rules-of-hooks` and production `@typescript-eslint/no-explicit-any` CI-blocking after the current violations are removed.
- Add focused regression coverage for renderer selection, conditional visibility, message projection, operation snapshots, keyframes, and Engine probe typing.
- Leave `react-hooks/exhaustive-deps`, security warnings, unused variables, console scoping, and non-null assertions to separate follow-up batches.

## Capabilities

### New Capabilities

- `critical-eslint-quality-gates`: Defines zero-warning enforcement and regression requirements for React Hook ordering and production explicit `any` usage.

### Modified Capabilities

None.

## Impact

- Canvas, Cut, Tools, and shared React test code containing current Hook-order or explicit-`any` warnings.
- Root ESLint severity for the two critical rules and repository quality-gate behavior.
- Webview runtime verification for Canvas preview/content surfaces, Cut shapes, and Tools media diff details.
- No project data, Webview message schema, Engine protocol, or public package API migration is intended.
