## 1. Authoring and publication

> Do not implement these tasks until Story/Experience producers and consumers are qualified. Foundation
> authoring, runtime, Save/branch and replay are owned by `refine-world-management-authoring-and-runtime`.

- [ ] 1.1 实现 World、World Story 和 Experience headless authoring/publication services。
- [ ] 1.2 实现 immutable dependency validation、install/catalog projection 和 invalid-record isolation。

## 2. Runtime and persistence

- [ ] 2.1 实现 exact ExperienceRun binding、owner intent/event/state、Story candidate 和 participant WorldView。
- [ ] 2.2 实现 Node atomic repositories、Save、checkpoint、branch、restore 和 model-free replay。
- [ ] 2.3 添加 concurrency、cross-run isolation、replay-without-provider 和 poisoned alternate-path tests。

## 3. Verification

- [ ] 3.1 运行 focused package/Node tests、typechecks、OpenSpec 与架构质量门禁。
- [ ] 3.2 记录持久化损坏、并发、性能和未接入 UI/AI/Gameplay 的剩余风险。
