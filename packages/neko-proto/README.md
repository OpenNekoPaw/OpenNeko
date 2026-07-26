# @neko/proto

> Protobuf IDL 定义——OpenNeko 结构化媒体类型契约的唯一权威来源

## Context Summary

- 项目：OpenNeko - VSCode 创意工作套件
- 架构：纯 IDL 文件（.proto），当前只生成 TypeScript 结构化数据类型

## Quick Reference

- **职责**：定义 Timeline 与 Diff 的共享数据结构契约
- **包名**：`@neko/proto`（目录名 `neko-proto`）
- **文件**：`timeline.proto`、`diff.proto`
- **零依赖**：仅 `.proto` IDL 文件，不产生运行时代码
- **被依赖**：`@neko/shared/generated/`（生成的 TS 类型）

## Architecture

```
neko-proto（IDL 唯一来源）
  ├── timeline.proto   → 时间线/轨道/元素/关键帧/特效/转场数据结构
  └── diff.proto       → 媒体 Diff 比较结果数据结构
        │
        └── → @neko/shared/src/generated/ (TypeScript)
              pnpm generate:types → scripts/proto-gen-ts.mjs 自动生成
```

### 关键 Proto 定义（timeline.proto）

| 消息/枚举 | 领域来源 | 说明 |
|-----------|---------------|------|
| `Transform` | Timeline IDL | 位置/缩放/旋转/锚点 |
| `Element` | Timeline IDL | 时间线元素（tagged union） |
| `Track` | Timeline IDL | 轨道（视频/音频/文本...） |
| `Timeline` | Timeline IDL | 完整时间线项目 |
| `BlendMode` | Timeline IDL | 27 种混合模式 |
| `TransitionType` | Timeline IDL | 18 种转场类型 |
| `EasingType` | Timeline IDL | 31 种缓动函数 |
| `EffectType` | Timeline IDL | 特效类型枚举 |

### 生成 TypeScript 类型

```bash
pnpm generate:types   # 在 monorepo 根目录运行
```

> 生成器特性：内容哈希幂等输出、enum 前缀自动推断、proto 注释 → JSDoc、oneof 字段支持、.proto 文件自动发现。
> 修改 `.proto` 文件后，运行 `pnpm generate:types` 重新生成 TS 类型，并同步更新对应的 owning domain codec/consumer。

`@neko/proto` 不定义 Node/FFmpeg、loopback Range、PCM 或 Webview
message；这些运行时契约由 `@neko/media` 和 owning package 持有。
