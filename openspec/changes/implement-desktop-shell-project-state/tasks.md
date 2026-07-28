## 1. Contracts And Shared Primitive

- [x] 1.1 Add owner-neutral projection attachment envelopes to `@neko/host`
- [x] 1.2 Migrate Agent projection types to compose the shared primitive without changing public behavior
- [x] 1.3 Define Desktop Project/Window/Tab/View/Shell DTOs, parsers and diagnostics

## 2. Host Authorities And Persistence

- [x] 2.1 Implement canonical workspace resolver and revisioned Project catalog
- [x] 2.2 Implement atomic CAS Shell state repository with protected Host-only workspace locators
- [x] 2.3 Implement per-Window Shell controller, duplicate-open focus, cross-window projection and profile rejection
- [x] 2.4 Integrate local metadata and Shell authority into AppHost startup/quit lifecycle

## 3. Bridge And Renderer

- [x] 3.1 Add fixed sender-bound Shell IPC/preload methods and projection events
- [x] 3.2 Implement Home, recent projects, Project Tabs and Content Project layout with `@neko/ui`
- [x] 3.3 Implement Context Dock, Activity/Attention projection and explicit unavailable domain states
- [x] 3.4 Remove the foundation-only renderer success surface and keep P1.3-P1.6 slots fail-visible

## 4. Tests And Verification

- [x] 4.1 Add parser/shared primitive compatibility and architecture boundary tests
- [x] 4.2 Add CAS, duplicate open, multi-window, stale revision/epoch and close/reopen/restart tests
- [x] 4.3 Add fixed bridge, sender validation, StrictMode subscription and unavailable profile tests
- [x] 4.4 Run affected package typecheck/test/build, full build/test/check/quality, strict OpenSpec validation and Electron functional smoke
- [x] 4.5 Record runtime evidence, unavailable checks and remaining P1.3 integration risk
