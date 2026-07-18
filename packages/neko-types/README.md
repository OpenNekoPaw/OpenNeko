# Neko Types (@neko/shared)

> 共享基础设施：类型定义、横切关注点（Logger/i18n/Theme/Errors）

## Context Summary

- 项目：OpenNeko - VSCode 创意工作套件
- 架构：三层导出隔离（Core / VSCode / Webview），被所有 11 个包依赖

## Quick Reference

- **职责**：跨包类型定义 + 统一运行时基础设施（Logger/i18n/Theme/Errors）
- **包名**：`@neko/shared`（目录名 `neko-types`）
- **入口**：`src/index.ts`（Layer 0 Core）
- **子路径导出**：`/vscode/extension`（Layer 1）、`/i18n/webview`、`/i18n/react`（Layer 2）
- **零内部依赖**：不依赖任何其他 `@neko/*` 包

## Architecture

### 三层导出架构

```
Layer 0 - Core        import from '@neko/shared'
                      零依赖，Node.js + Browser 均可用

Layer 1 - VSCode      import from '@neko/shared/vscode/extension'
                      依赖 vscode API，仅 Extension Host 使用

Layer 2 - Webview     import from '@neko/shared/i18n/webview'
                      依赖 DOM，仅 Webview（Browser）

Layer 2 - React       import from '@neko/shared/i18n/react'
                      依赖 React，提供 I18nProvider + useTranslation
```

### 目录结构

```
src/
├── index.ts          # Layer 0 主入口
├── types/            # 纯类型（50+ 文件：timeline / agent / AI / canvas / 协议 / 资产 / 媒体引擎）
├── operations/       # EditOperation 指令系统（apply / invert / helpers）
├── errors/           # BaseError + IErrorHandler
├── logger/           # ILogger + ConsoleLogger + ILogTransport
├── i18n/             # II18nService + I18nService + webview/react 子模块
├── theme/            # VSCode CSS Token 映射 + nekoTailwindPreset
├── config/           # 统一配置管道（reader / adapter / normalizer）
├── utils/            # 工具函数（animation / media / colorCorrectionMapping）
├── core/             # ConcurrencyPool 等核心工具
├── tools/            # Agent 工具基类（BaseTool）
├── generated/        # Protobuf 生成类型（勿手动修改）
└── vscode/           # Layer 1（Extension Host 专用）
    └── extension/
        ├── logger.ts          # OutputChannelTransport + createVSCodeLogger()
        ├── error-reporter.ts  # VSCodeErrorHandler
        └── i18n-bridge.ts     # getVSCodeLocale() + injectLocaleAttribute()
```

## Deep Dive

### 本地元数据与语义 projection

`@neko/shared/local-metadata/node` 只提供 Host-owned repository/binding；feature package 不直接打开 SQLite 或拼接 SQL。语义 source、segment、mention、candidate cluster 和 freshness 属于用户级 `~/.neko/neko.db` 的可重建 cache projection，按 source 原子替换并递增 workspace partition revision。Confirmed Entity、binding 和显式 candidate review decision 仍由项目事实文件拥有。

### 使用方式

```typescript
// Layer 0: 所有环境
import type { VideoProject, TimelineElement } from '@neko/shared';
import { ConsoleLogger, I18nService, BaseError } from '@neko/shared';

// Layer 1: Extension Host
import { createVSCodeLogger, VSCodeErrorHandler } from '@neko/shared/vscode/extension';

// Layer 2: Webview DOM
import { detectWebviewLocale } from '@neko/shared/i18n/webview';

// Layer 2: React
import { I18nProvider, useI18n } from '@neko/shared/i18n/react';

// Tailwind（tailwind.config.js）
import { nekoTailwindPreset } from '@neko/shared/theme/tailwind-preset';
```

### EditOperation 指令系统

`src/operations/` 提供统一的编辑操作抽象，支持 undo/redo、AI 集成和操作审计：

```
operations/
├── types.ts      # 操作类型定义（audio / canvas / sketch + neko-cut 原有）
├── apply.ts      # applyOperation() — 将操作应用到项目数据
├── invert.ts     # invertOperation() — 生成逆操作（用于 undo）
└── helpers.ts    # createMeta() / isUserOperation() 等工具函数
```

**操作域**：

| 域          | 前缀                                                     | 操作类型                         |
| ----------- | -------------------------------------------------------- | -------------------------------- |
| neko-cut    | `track.*` / `element.*`                                  | 轨道/元素 CRUD、移动、修剪、分割 |
| neko-canvas | `canvas.node.*` / `canvas.connection.*`                  | 节点/连接 CRUD、分组、重排       |
| neko-audio  | `audio.effect.*` / `audio.marker.*`                      | 效果链/标记 CRUD、排序、切换     |
| neko-sketch | `sketch.layer.*` / `sketch.stroke.*` / `sketch.canvas.*` | 图层/笔画/画布操作               |

**使用方式**：

```typescript
import type { EditOperation } from '@neko/shared';
import { applyAudioOperation, invertOperation, createMeta } from '@neko/shared';
```

### 设计原则

| 原则     | 说明                                               |
| -------- | -------------------------------------------------- |
| 三层隔离 | Core 零依赖，VSCode 层隔离 API，Webview 层隔离 DOM |
| 接口优先 | ILogger / II18nService / IErrorHandler 面向抽象    |
| 策略模式 | Transport / Bundle / ErrorHandler 可插拔替换       |
| 向后兼容 | 类型变更用可选属性，不破坏现有 API                 |

> ⚠️ **修改影响大**：类型变更会传播到所有 11 个依赖包，请确保向后兼容。
