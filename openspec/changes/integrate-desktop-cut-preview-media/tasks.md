## 1. Contract And Reuse Audit

- [x] 1.1 Audit Cut Root/controller/OTIO commands, Preview viewers/providers, `@neko/media`,
      ExportJob and Desktop workbench slots; record each path as reuse, extract, replace or poison
- [x] 1.2 Define versioned Cut and Preview runtime contracts with explicit Project/Workspace/Window/
      View/document/session/endpoint/revision identity and exhaustive route coverage
- [x] 1.3 Add parsers/builders and producer-consumer tests for unknown versions, stale owners,
      unsupported kinds, Range payloads and forbidden path/token fields
- [x] 1.4 Add architecture/debt guards preventing production Cut/Preview Roots from global VS Code,
      Node/Electron imports, fixed demo success and renderer-owned media transport

## 2. Full Cut Root Runtime

- [x] 2.1 Refactor `CutOtioControllerProvider` and the complete Cut Root to consume an injected runtime
      while preserving one shared Stage/Timeline session
- [x] 2.2 Migrate OTIO snapshot, command, save, undo/redo, dirty and presentation flows to the runtime
      with expected revision and command idempotency
- [x] 2.3 Migrate Cut preview/playback and ExportJob intents without duplicating `@neko/media`,
      Node/FFmpeg or export lifecycle
- [ ] 2.4 Migrate the VS Code Cut adapter to the same runtime and poison the global/fixed host-adapter
      production path
- [x] 2.5 Test Cut Root snapshot-first recovery, command fencing, playback/export lifecycle, focus and
      disposal

## 3. Unified Preview Root And Media Transport

- [x] 3.1 Define the package-owned Preview Root/runtime and explicit viewer registry over existing
      image, video, audio, document and model viewers
- [ ] 3.2 Refactor viewer message/state hooks to consume the injected runtime and migrate the VS Code
      Preview providers to the same contract
- [x] 3.3 Implement sender/session/revision-bound `neko-media:` descriptors with MIME, Range,
      cancellation, EOF and cleanup through existing media owners
- [x] 3.4 Implement temporary, pinned and explicit side Preview Views without replacing Canvas/Cut
      embedded previews
- [x] 3.5 Test unsupported viewers, cross-owner descriptor rejection, Range semantics, decoder/stream
      release and no raw path/URL/token leakage

## 4. Desktop Composition And Multi-View

- [x] 4.1 Implement fixed Main/preload Cut and Preview namespaces with sender-derived identity and
      AppHost-owned runtime/session disposal
- [x] 4.2 Mount the complete Cut Root across Main Stage and bottom Timeline slots; remove the
      unavailable surface only when every required effect exists
- [x] 4.3 Support multiple open Cut documents with duplicate focus, a compact switcher and exactly
      one rendered Cut session
- [x] 4.4 Mount Preview Root as temporary/pinned/side Main Views and persist only allowed View
      presentation state
- [x] 4.5 Test renderer reload, Project close/reopen, multi-window isolation and late event fencing

## 5. Resource Thumbnail And Handoff

- [x] 5.1 Complete lazy visible image/video thumbnail projection with bounded dimensions,
      cancellation, typed fallback and revision invalidation
- [x] 5.2 Add explicit Resource Browser Preview and Add-to-Cut intents carrying stable resource and
      target Cut document/session/revision identity
- [x] 5.3 Resolve ContentLocator through owning Cut authoring and reject unsupported, cancelled,
      stale or mismatched targets without mutation
- [x] 5.4 Test source search exclusions, linked libraries, thumbnail authorization, handoff path
      counters and absence of active/recent Cut fallback

## 6. Qualification

- [x] 6.1 Run Cut, Preview, Media, Assets, shared UI and Desktop tests/typechecks/builds plus
      architecture, legacy-debt, unused-code and strict OpenSpec validation
- [ ] 6.2 Validate Cut/Preview Webview behavior in an isolated Extension Development Host and record
      no-old-runtime/no-regression evidence
- [x] 6.3 Validate packaged Electron Resource → Preview → Cut → edit/play → ExportJob → close/reopen
      with canonical-path counters, media cleanup and user-visible evidence
  - 2026-07-29 packaged `darwin-arm64` evidence used the isolated synthetic media workspace:
    Resource Preview played the authorized H.264 asset; Add-to-Cut extended the OTIO from 6 s to
    12 s; the reused Cut Root edited and played the timeline; ExportJob produced a 12.000 s
    H.264/AAC MP4; close saved the added Clip and reopen restored the 12 s timeline.
  - Canonical-path assertions cover exact Resource/Cut identity, one idempotent authoring mutation,
    Node media-adapter disposal and file-URI adaptation at the Desktop boundary. Closing the
    packaged Cut left no FFmpeg/FFprobe process or staging file. User-visible screenshots are
    retained in the gitignored
    `reports/desktop-functional/integrate-desktop-cut-preview-media-2026-07-29/`.
  - Follow-up packaged Electron regression directly opened the 26.30 s `cut-second.otio`
    (Video + two Audio + Subtitle Tracks) through the Resource Browser into the reused Cut Root
    without a renderer exception. The same Resource Dock directly previewed PNG, GLB and Fountain
    content through authorized package-owned viewers and remained available after each temporary
    Preview.
- [ ] 6.4 Update capability docs and Phase 1 program 5.x only after full Cut/Preview runtime and all
      gates pass
