## 1. Canonical Workspace Generation Runtime

- [x] 1.1 Reconcile `extract-generation-domain-package` with
      `unify-agent-launch-and-domain-bindings` and define one Workspace-qualified Generation owner,
      exact configuration authority and direct-vs-Tool no-fallback boundary.
- [x] 1.2 Implement the host-neutral Workspace Generation application runtime in
      `@neko/generation/job` with exact identity, concurrent single-owner creation, fail-local errors and
      application lifecycle disposal.
- [x] 1.3 Move concrete Workspace GenerationJob owner construction and output commit out of Canvas into
      the Generation Node/media boundary, accepting Host-injected execution/config facts.
- [x] 1.4 Make Desktop own one Workspace config authority and compose one Generation application runtime;
      delete Canvas-local `ConfigManager`, coordinator and store construction.
- [x] 1.5 Inject the exact shared GenerationJob port into Canvas actions and Agent Workspace Tool
      registration without giving either consumer Job-store or disposal authority.
- [x] 1.6 Route explicit Agent composer image/video/audio operations through a typed direct Generation
      port that creates no Conversation, Turn, Pi Session or Tool Call; poison the old media
      `sendMessage` success path.
- [x] 1.7 Add path tests proving both entries hit the same Workspace owner, preserve exact purpose/model
      and Job/artifact identity, reject cross-Workspace/stale binding, and never fallback between entries.
- [x] 1.8 Reuse/update `agent-runtime.workflow-controller` GenerationJob Evaluation coverage and run the
      key-free suite validation, recording that it does not prove provider behavior.
- [ ] 1.9 Run one configured-provider visible Desktop case only with explicit cost authorization; record
      effective model, GenerationJob, artifact and canonical-path evidence plus no-fallback facts.
