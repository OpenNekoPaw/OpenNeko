# Application Composition Roots

Status: Accepted target architecture under active OpenSpec migration
Date: 2026-07-14
Change: `restructure-client-applications-and-retire-desktop-shell`

## Purpose

OpenNeko separates installable product applications from reusable platform and domain packages. Application directories own composition, host lifecycle, product manifests, packaging, and release entry points. They do not own domain implementations.

## Ownership Matrix

| Layer | Target root | Owns | Must not own |
| --- | --- | --- | --- |
| OpenNeko Home | `apps/neko-home` | Electron lifecycle, Home navigation/composition, global project/resource/Agent/task projections, lightweight Engine Core connection, professional-tool handoff, Home packaging and functional fixtures | Project editor state, Scene/Timeline truth, domain authoring implementations, VSCode adapters, professional viewport truth |
| OpenNeko TUI | `apps/neko-tui` | Canonical executable, terminal lifecycle, application command routing, Workspace selection, Node/headless host composition, TUI packaging | AgentSession semantics, domain capability implementations, React/Webview UI, VSCode/Electron adapters |
| OpenNeko for VSCode | `apps/neko-vscode` | Product/Extension Pack manifest, product composition, Home handoff entry, packaging, release and application acceptance | Domain Extensions, Custom Editors, Webview roots, domain commands/providers |
| Neko Studio | reserved; no product root in the current migration | Future native professional application composition after an accepted change proves Engine-native viewport and layout requirements | A successful build/start/release path before productization; dependency on the retired Desktop shell |
| Shared platform | `packages/neko-types`, `packages/neko-host`, `packages/neko-workbench-core`, `packages/neko-client`, `packages/neko-content`, `packages/neko-ui` | Host-neutral contracts, host primitive ports, Workbench contribution contracts, Engine client, content semantics, reusable UI | Application lifecycle, product manifests, domain implementations, imports from `apps/*` |
| Domain packages | `packages/neko-agent`, `packages/neko-canvas`, `packages/neko-cut`, `packages/neko-story`, `packages/neko-assets`, and peers | Domain core, authoring, validation, capability providers, domain host adapters and public UI roots | Product composition, imports from `apps/*`, parallel application-local domain implementations |
| Engine | `packages/neko-engine` | Binary media, Scene/runtime computation, devices, ML, viewport/output truth, host runtimes | Product navigation, application UI, project/editor ownership in TypeScript |

## Dependency Direction

```text
apps/*
  -> documented public package entries
  -> host/platform/domain contracts
  -> Engine client / Proto

packages/* -X-> apps/*
```

Applications may use local relative imports within their own root. They must not reach into `packages/*/src`, feature-package internal directories, or another application. Reusable packages must never import application implementation.

Each domain surface remains package-owned. Home, TUI, VSCode, and a future Studio select an appropriate public adapter or projection; they do not copy Canvas, Cut, Story, Agent, Assets, Market, Skills, or content behavior.

## Application Matrix

| Product | Current priority | Primary scope | Canonical real-host validation |
| --- | --- | --- | --- |
| Home | Active | Global/personal workspace, lightweight creation and management | Electron application functional suite |
| TUI | Active | Terminal/headless operation and real Agent path | Deterministic tests plus focused Agent Evaluation |
| OpenNeko for VSCode | Active | Project-bound professional editing and code-centric workflows | Extension Development Host plus focused Webview functional suite |
| Studio | Deferred | Native Scene/media professional editing | Future accepted OpenSpec; no current product entry |

The applications remain in the same monorepo and mainline history but expose independently addressable build, test, package, and release tasks. A shared contract change validates its producer and affected application consumers in the same revision.

## Canonical Entry Rule

Each active product has exactly one successful product entry. Migration may keep an old entry only until the replacement passes its real-host and data-preservation gates. The migration boundary then deletes or poisons the old entry; permanent forwarding aliases and dual release paths are forbidden.

Source-directory movement does not authorize changing durable application identity. Settings, conversations, project registry, credentials, trust state, installed packages, generated artifacts, and rebuildable caches require an explicit reuse, migration, rebuild, or rejection policy.

## Application Contract Ownership

`@neko/host/application` owns the minimal host-neutral application contract:

- supported application and instance identity;
- startup/handoff diagnostics;
- explicit `workspaceId`-bound professional-tool handoff;
- application storage migration inventory categories and dispositions.

Home, TUI, and VSCode are callers and concrete host implementations. The contract lives for one application instance, rejects unknown versions and identities, and never infers the current project, Workspace, window, or editor. Electron IPC, VSCode commands, terminal process state, AgentSession, project authoring, Tool Registry, and Engine runtime handles remain outside `@neko/host`.

Concrete Electron code was not extracted into a shared package during this audit because Home is its only accepted current product owner. Existing host primitive ports are the only proven multi-host boundary; a second real native host is required before extracting an Electron/Tauri implementation abstraction.
