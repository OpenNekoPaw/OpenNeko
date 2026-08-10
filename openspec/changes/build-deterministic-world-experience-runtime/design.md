## Context

前置条件是 `define-world-topology-and-data-contracts`。本 change 建立唯一 headless 成功链，不包含 Renderer、Desktop scene、Agent role、realtime provider 或 Gameplay authority。

## Decisions

- World、Story 和 Experience 各自 authoring/publication；Experience 只绑定精确不可变 refs。
- 每个 intent 只由其 owner 校验并产生 ordered committed event；projection 和 checkpoint 不是第二事实源。
- Save 锁定精确 immutable baseline；branch 不重写 parent history；replay 不调用模型。
- Node adapter 使用 workspace-relative path 和原子写入，损坏记录逐项失效并保留原始用户数据。

## Canonical Path

`authoring service -> immutable publication -> Experience binding -> owner intent -> event commit -> state/view projection -> Save/checkpoint -> replay`。

## User Data

所有写入必须显式、原子且可诊断。不得自动迁移、修复、重建或以旧 projection/cache 作为成功来源。
