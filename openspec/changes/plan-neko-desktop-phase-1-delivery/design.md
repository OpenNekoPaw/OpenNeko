## Program role

This change is coordination-only. It does not own package runtime code. Every implementation or
acceptance gate remains in one focused child change; the program closes only when the end-to-end Desktop
workflow and applicable package/release gates are complete.

## Dependency order

1. Close Desktop build/typecheck and supported package evidence.
2. Close Agent/Home and Assets/Canvas deterministic plus Electron acceptance.
3. Complete Cut editing, Preview lifecycle and the Main-owned resource gateway.
4. Integrate retained Generation/Quality, Chara/Entity and Tools/Diagnostics surfaces.
5. Run one frozen end-to-end qualification workspace and package/startup matrix.

## Ownership

- Electron Main owns workspace IO, project facts, sender identity, authorization, persistent state,
  background Jobs and resource lifecycle.
- Preload exposes fixed minimal typed ports.
- Renderer owns package Roots, interaction and recoverable presentation state only.
- Domain packages own their contracts and deterministic behavior; the app composition root injects Host
  effects without duplicating domain state.

## Completion workflow

The authoritative scenario is launch → Home → Content Project → Agent → Media Library → Canvas
candidate/accept → Cut edit/preview/export, with support-domain projections where retained. It must prove
explicit Project/Workspace/View/document/conversation/job identities, stable content identity, package-
owned Roots and the Main resource handler. Demo, raw-path, active-object and retired-runtime poison paths
must remain untouched.

Deterministic CI, real-provider Agent Evaluation and graphical Electron evidence are reported separately.
A key-free harness cannot claim provider behavior; a browser/Vite render cannot claim preload/IPC/window
lifecycle; a package build cannot claim end-to-end user readiness.
