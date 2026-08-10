## Context

本 change 只处理稳定边界，前置事实源是现有 Foundation contract。它不以完整产品 surface 为理由预建空包，也不把 Story、Experience、Character 或 Gameplay 压入一个 World aggregate。

## Decisions

- 以职责、依赖、接口、扩展、测试五层审计决定 subpath 或 package；没有独立依赖闭包时保持一个 host-neutral package 内的独立 public entry。
- World、World Story、World Experience 各自拥有精确 identity 和 lifecycle；Character/Character Story 只消费 Chara public refs。
- contract 只有一个 canonical shape，不包含内部版本、兼容 reader、active/latest fallback 或 registry wildcard。
- malformed record 逐条 fail-local；不得阻断 sibling record、package catalog 或 Desktop 启动。

## Runtime Boundary

Producer 是 `@neko/world` contract/domain；consumer 是后续 application services 和真实 boundary adapters。本 change 不接触 Electron、React、provider 或文件系统实现。

## User Data

不写入用户数据。后续 writer 只能使用这里冻结的 workspace-relative owner path，并需独立 OpenSpec 验证原子性和损坏隔离。
