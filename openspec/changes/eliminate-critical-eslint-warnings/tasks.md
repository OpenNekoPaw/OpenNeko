## 1. React Hook Ownership

- [x] 1.1 Make the Canvas preview registry store stable React component types and add renderer-selection regression coverage
- [x] 1.2 Separate conditional applicability from Hook-owning Canvas, Cut, and Tools components
- [x] 1.3 Make the shared `useResizable` test harness call its Hook exactly once per render

## 2. Production Type Contracts

- [x] 2.1 Replace Canvas operation snapshot explicit `any` casts with typed partial node contracts
- [x] 2.2 Replace Cut project traversal, keyframe value, and generic helper explicit `any` usage with owning types
- [x] 2.3 Return the canonical Engine probe result type from the Tools media service

## 3. Critical Lint Gates

- [x] 3.1 Add orchestration coverage for blocking Hook-order and production explicit-any rule severity
- [x] 3.2 Prove both critical rules have zero repository violations
- [x] 3.3 Promote both critical rules from warning to error while retaining the scoped test explicit-any override

## 4. Verification

- [x] 4.1 Run focused Canvas, Cut, Tools, and shared tests plus affected typechecks/builds
- [x] 4.2 Run repository lint, quality, OpenSpec, unused-code, legacy-debt, and diff hygiene checks
- [x] 4.3 Run local Extension Development Host/Webview smoke for affected surfaces or record a concrete environment blocker
- [x] 4.4 Complete Neko quality review and document residual warning batches

## Verification Evidence

- `pnpm lint` passes with 637 deferred warnings and zero violations for the two promoted rules.
- Repository build, test, dependency, quality, unused-code, legacy-debt, OpenSpec, and diff hygiene gates pass.
- Extension Development Host smoke loads Canvas and Cut Webviews; Canvas has no Neko runtime errors, while Cut visibly reports the unavailable local Engine and an existing unknown `preset:list` message.
- Tools Media Diff runtime interaction was not exercised because the isolated fixture did not contain a prepared two-media comparison; its Hook lifecycle regression test and production Webview build pass.
- L2 Neko quality review found no blocking architecture, contract, safety, or test issues. Remaining warning batches are exhaustive dependencies, security, unused variables, console scoping, and non-null assertions.
