# OpenNeko Desktop Development Roadmap

Status: directional roadmap; no release dates are promised.

Updated: 2026-08-11

This roadmap defines delivery order and qualification gates. Current product facts remain defined by
[`README.md`](README.md), [`docs/architecture/client-targets.md`](docs/architecture/client-targets.md),
and the codebase. Phase 1 domain integration is still in progress and Desktop is not a supported
release product. The sole native package/release target is `darwin-arm64`; macOS has a verified
local ad-hoc DMG path published as an ordinary GitHub Release with explicit unnotarized disclosure,
while Developer ID/notarization remains a Phase 2 gate. GitHub Actions does not build or upload native
Desktop artifacts. Windows x64 and Linux are deterministic test hosts only. Intel Mac and other
architectures are unsupported. Desktop already has an OpenNeko-owned Skill and extension catalog with supported
Skill/MCP contribution wiring; a general extension ecosystem and professional-tool integrations are
not implemented.

Each phase must be split into bounded OpenSpec changes. Shell, cross-platform work, the plugin
runtime, and every professional-tool adapter must not be developed as one permanent umbrella change.

## Product focus and experimental promotion

The current roadmap prioritizes general AI-assisted content creators and closes a real path from
local project context through Agent planning/generation, source and result management,
Canvas/Cut/Preview lightweight processing, and export or professional-tool handoff. “General” means
a portable, cross-media, cross-model path for common individual creation work; it does not mean
recreating a complete NLE, DCC, image editor, or every creative-industry workflow inside OpenNeko.

Chara and Interactive World are independent experiments rather than committed current-phase
deliverables. Boundary design, synthetic fixtures, and minimum prototypes may continue, but either
direction can become a core navigation, release capability, or current product claim only when:

- a concrete audience and repeated job appear across independent users;
- users already solve that job inefficiently in real projects rather than merely expressing interest;
- a minimum prototype produces repeated creation, return experience, save, or sharing behavior; and
- a smallest creation-to-experience loop works through real owners, models, and durable facts.

Before promotion, Character projects/rooms/Play and World projects/Experiences/Runs/Saves/branches
remain fail-visibly unavailable. Multi-character Play, VLA/game control, complete 3D or realtime-video
presentation, and social distribution must not expand the validation baseline. OpenSpec designs and
task inventories do not by themselves commit roadmap delivery.

## Phase 1: Desktop UI and retained-package integration

Development proposal and implementation slices:
[`plan-neko-desktop-phase-1-delivery`](openspec/changes/plan-neko-desktop-phase-1-delivery/).

Complete `apps/neko-desktop` with Electron main/preload/renderer, AppHost, typed IPC, Home, Project
Tabs, Content Project, Context Dock, and Activity/Attention. Integrate real public paths from Agent,
Assets/Content/Media Library, Canvas, Cut, Preview/Media, Generation/Quality, Chara/Entity, and
Tools/Diagnostics.

Implementation progress, blockers, and verification evidence belong to the corresponding OpenSpec
changes and dated status snapshots. This roadmap does not duplicate task-level state. Phase 1
remains incomplete until every phase gate passes.

The phase is complete only when:

- a real Home → Content Project → Agent/Media Library/Canvas/Cut/Preview → Generation/Export path
  works without mocks or no-op success;
- Host snapshots, owner-keyed Renderer replicas, Window/View stores, sequence/revision/CAS, and stale
  response rejection pass lifecycle and race tests;
- Desktop imports public host-neutral package entries rather than VS Code Extension internals;
- missing Character/World capabilities remain explicitly unavailable;
- no retired Desktop, Workbench, Engine, or client path is restored.

Phase 1 uses an OpenSpec-selected reference platform and does not claim full cross-platform support.

## Phase 2: macOS release qualification

Qualify `darwin-arm64` through real installation, startup, credential, native, media, creative
workflow, Developer ID, notarization, Gatekeeper, and published-artifact evidence.

The native package/release set contains exactly `darwin-arm64`. Windows and Linux remain
deterministic test hosts and must not produce a Desktop artifact; Intel Mac and other architectures
are unsupported.

Platform differences must stay behind narrow Host adapters and capability policies. Cross-compiling
or launching Electron alone is not platform qualification.

## Phase 3: Extension ecosystem and professional tools

Extend the existing OpenNeko Skill/extension catalog and its supported Skill/MCP contribution path
through the single MCP Manager, Agent Tool Call/Approval path, Skills, and capability catalog. Add
the remaining versioned lifecycle, isolation, controlled contribution slots, permission handling,
and fail-visible unload/crash behavior needed for a general extension ecosystem.

Professional integrations use explicit capability levels:

```text
L1 Discover / Launch
L2 Export and Open
L3 MCP or stable vendor API automation
L4 Explicit Computer Use for remaining visible UI
L5 Round-trip import / relink / review with evidence
```

Delivery slices cover:

- ComfyUI API/MCP workflows and output import;
- DaVinci Resolve and a Jianying/CapCut target through Cut exchange and review;
- Blender through controlled scene/asset exchange and stable automation;
- Unity through controlled project/package handoff and Editor/CLI/MCP automation;
- Photoshop and Live2D Cubism through separately qualified public interfaces and exchange formats.

MCP/API is preferred. Computer Use never silently replaces a failed stable integration and must bind
the Tool Call, app/process/window/document, target epoch, observation revision, Approval, takeover,
and independent completion evidence.

The detailed Chinese roadmap, package matrix, implementation slices, and completion gates are in
[`ROADMAP_CN.md`](ROADMAP_CN.md).
