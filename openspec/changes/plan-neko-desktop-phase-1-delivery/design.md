## Program role

This change is coordination-only. It does not own package runtime code. Every implementation or
acceptance gate remains in one focused child change; the program closes only when the end-to-end Desktop
workflow and applicable package/release gates are complete.

## Dependency order

1. Close Desktop build/typecheck and supported package evidence.
2. Close Agent/Home and Canvas deterministic plus Electron acceptance; Asset Library, Media Library and
   Entity remain in their dedicated changes and are outside the current P0/P1 execution slice.
3. Complete Cut editing, Preview lifecycle and the Main-owned resource gateway.
4. Integrate retained Generation/Quality and Chara surfaces; keep retired Tools absent.
5. Run one frozen end-to-end qualification workspace and package/startup matrix.

## Ownership

- Owning packages own project facts, host-neutral workspace/application services, persistent-state
  contracts, business workflows and background Job state.
- Electron Main owns sender/window identity, trust/path authorization, concrete Electron/file/process
  adapters, native resource lifecycle, package wiring and result projection.
- Preload exposes fixed minimal typed ports.
- Renderer owns package Roots, interaction and recoverable presentation state only.
- Domain packages own their contracts and deterministic behavior; the app composition root injects Host
  effects without duplicating domain state.

## Completion workflow

The complete Phase 1 scenario remains launch → Home → Content Project → Agent → Media Library → Canvas
candidate/accept → Cut edit/preview/export. The current non-library P0/P1 slice qualifies Home, Agent,
Canvas, Cut and Preview independently and does not mark the complete Phase 1 program done while the
excluded library/entity changes remain open. Final qualification must prove
explicit Project/Workspace/View/document/conversation/job identities, stable content identity, package-
owned Roots and the Main resource handler. Demo, raw-path, active-object and retired-runtime poison paths
must remain untouched.

Deterministic CI, real-provider Agent Evaluation and graphical Electron evidence are reported separately.
A key-free harness cannot claim provider behavior; a browser/Vite render cannot claim preload/IPC/window
lifecycle; a package build cannot claim end-to-end user readiness.
