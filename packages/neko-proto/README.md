# @neko/proto

> Protobuf IDL 定义——OpenNeko 跨语言类型契约的唯一权威来源

## Context Summary

- 项目：OpenNeko - VSCode 创意工作套件
- 架构：纯 IDL 文件（.proto），TS/Rust 类型均从此派生

## Quick Reference

- **职责**：定义跨语言（Rust ↔ TypeScript）共享的数据结构契约
- **包名**：`@neko/proto`（目录名 `neko-proto`）
- **文件**：`timeline.proto`、`diff.proto`
- **零依赖**：仅 `.proto` IDL 文件，不产生运行时代码
- **被依赖**：`@neko/shared/generated/`（生成的 TS 类型）、neko-engine（Rust 域模型）

## Architecture

```
neko-proto（IDL 唯一来源）
  ├── timeline.proto   → 时间线/轨道/元素/关键帧/特效/转场数据结构
  └── diff.proto       → 媒体 Diff 比较结果数据结构
        │
        ├── → neko-engine (Rust)
        │     engine-kernel/src/domain/timeline.rs 等（手动保持一致）
        │
        └── → @neko/shared/src/generated/ (TypeScript)
              pnpm generate:types → scripts/proto-gen-ts.mjs 自动生成
```

### 关键 Proto 定义（timeline.proto）

| 消息/枚举 | 来源 Rust 文件 | 说明 |
|-----------|---------------|------|
| `Transform` | `domain/transform.rs` | 位置/缩放/旋转/锚点 |
| `Element` | `domain/timeline.rs` | 时间线元素（tagged union） |
| `Track` | `domain/timeline.rs` | 轨道（视频/音频/文本...） |
| `Timeline` | `domain/timeline.rs` | 完整时间线项目 |
| `BlendMode` | `gpu/compositor.rs` | 27 种混合模式 |
| `TransitionType` | `gpu/transition_processor.rs` | 18 种转场类型 |
| `EasingType` | `animation/easing.rs` | 31 种缓动函数 |
| `EffectType` | `types/effects.rs` | 特效类型枚举 |

### 生成 TypeScript 类型

```bash
pnpm generate:types   # 在 monorepo 根目录运行
```

> 生成器特性：内容哈希幂等输出、enum 前缀自动推断、proto 注释 → JSDoc、oneof 字段支持、.proto 文件自动发现。
> 修改 `.proto` 文件后，运行 `pnpm generate:types` 重新生成 TS 类型，并同步更新对应的 Rust 域模型。
