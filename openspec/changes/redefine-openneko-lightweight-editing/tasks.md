## 1. Package Ownership Convergence

- [x] 1.1 Move document/session/command routing, preview controller and ExportJob lifecycle from `desktop-cut-runtime.ts` into `@neko/cut-domain` / `@neko/cut-node` public application entries with independent instance state and producer tests.
- [x] 1.2 Reduce Desktop Cut runtime to sender/path authorization, Workbench/status projection, native file/process/resource adapters and disposal; delete or poison app-owned workflow/state and add delegation tests.

## 2. P0 document and playback closure

- [x] 2.1 Add producer/consumer and Electron coverage for new-target creation, explicit-target append,
      edit → dirty → save → reopen and temporary renderer reconstruction.
- [x] 2.2 Run isolated Electron scenarios for link, manual-mute separation, cross-Clip preview,
      playback/export and multi-document isolation.
- [x] 2.3 Move OTIO save from package-local temporary replacement to the shared authorized project-file
      writer and prove exact document/view identity plus fail-visible version conflict.

## 3. Basic presentation and interaction

- [x] 3.1 Place the resizable Inspector beside Preview and above the full-width Timeline; complete
      Project/Track/Clip/Gap controls without restoring a professional property system.
- [x] 3.2 Complete Timeline context menus, exact-time pointer placement, trim, snapping, autoscroll and
      cancellation cleanup through revisioned typed intents.
- [x] 3.3 Restore the canonical package-owned Preview/controls, Timeline/hooks, Inspector and Export
      component boundaries; remove parallel minimal replacements.
- [x] 3.4 Keep one document-scoped presentation store over immutable `TimelineView` and route every
      durable edit through the OTIO controller.
- [x] 3.5 Add renderer behavior/path tests for layout, boundaries, Gap placement, file drop,
      duration/speed/audio edits, menus, pointer/keyboard/focus and media-session cleanup.

## 4. P1 productivity

- [x] 4.1 Complete selection, multi-select, box-select, batch move, cut/copy/paste/duplicate/select-all,
      playhead follow and serialized multi-file drop through retained hooks and controller.
- [x] 4.2a Replace the old Cut AI helper with shared `AgentContextPayload` projection and explicit target
      identity; add contract tests and a key-free focused Evaluation case with no active-editor fallback.
- [ ] 4.2b Run the focused case with an explicitly authorized provider/model/credential/cost binding and
      record real Agent behavior evidence; do not convert infrastructure-blocked into a pass.
- [x] 4.3 Prove shared i18n/theme/icons/menu/property/error/logger/workbench/resize/keyboard/drop
      infrastructure remains canonical and no Cut-local replacement runtime exists.

## 5. Final qualification

- [x] 5.1 Run focused Domain/Node/renderer tests and builds, strict OpenSpec, Agent Evaluation where
      applicable, dependency/legacy/unused gates and isolated Electron Desktop scenarios.
- [ ] 5.2 Validate dirty export revision, mixed audio, multiple Clip boundaries, high-frequency playhead,
      exact stop, light/dark Preview themes, save/backup and ExportJob restore/cancel; record residual risk.
