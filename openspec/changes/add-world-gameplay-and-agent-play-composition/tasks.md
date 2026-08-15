## 1. Gameplay owner

> Keep all tasks gated until a real Gameplay consumer and persistence path are qualified; the deterministic
> Foundation Workbench does not satisfy this gate.

- [ ] 1.1 定义 Gameplay definition/session/seat/action/state/outcome contracts、strict codecs 和 repository ports。
- [ ] 1.2 实现 rule validation、ordered gameplay commit、result verification 与 record-local diagnostics。

## 2. Agent Play composition

- [ ] 2.1 定义 World Gameplay 与外部 Game 共用的 owner-scoped Play consumer boundary。
- [ ] 2.2 实现 exact seat/controller binding，并证明 user-controlled seat 不创建隐藏 Agent。
- [ ] 2.3 添加 cross-owner poison tests，禁止 World/Chara/Renderer/Agent 直接提交 Gameplay facts。

## 3. Verification

- [ ] 3.1 运行 headless gameplay fixtures、Agent Play tests/typechecks、OpenSpec 和架构质量门禁。
- [ ] 3.2 运行适用的真实 Agent Play Evaluation，记录外部 Game adapter 与 UI 未覆盖风险。
