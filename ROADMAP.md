# OpenNeko Desktop Development Roadmap

Status: directional roadmap; no release dates are promised.

Updated: 2026-07-31

This roadmap defines delivery order and qualification gates. Current product facts remain defined by
[`README.md`](README.md), [`docs/architecture/client-targets.md`](docs/architecture/client-targets.md),
and the codebase. Phase 1 domain integration is still in progress and Desktop is not a supported
release product. Only `darwin-arm64` currently has Forge package qualification. Linux, Windows, and
Intel Mac remain outside the supported set, and Desktop professional-tool/plugin integrations are
not implemented.

Each phase must be split into bounded OpenSpec changes. Shell, cross-platform work, the plugin
runtime, and every professional-tool adapter must not be developed as one permanent umbrella change.

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

## Phase 2: Cross-platform qualification

Qualify the same Desktop application on:

1. `darwin-arm64`;
2. `linux-x64`, with an explicit glibc/distribution boundary;
3. `win32-x64`, through a separate platform-contract change and real Windows evidence.

The current supported set contains only `darwin-arm64`. Linux, Windows, and Intel Mac remain
deferred until their contracts, runner/host evidence, packaging, signing, installation, updates,
paths, credentials, native modules, GPU/media, and end-to-end creative workflows pass.

Platform differences must stay behind narrow Host adapters and capability policies. Cross-compiling
or launching Electron alone is not platform qualification.

## Phase 3: MCP, plugins, and professional tools

Reuse the single MCP Manager, Agent Tool Call/Approval path, Skills, and capability catalog. Add a
versioned plugin manifest, isolated Node extension process, sandboxed panel partition, controlled
contribution slots, permission lifecycle, and fail-visible unload/crash behavior.

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
