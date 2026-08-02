# @neko/shared

> 最小跨领域基础设施：异步 utility、Errors、Logger、可移植路径与通用 Job lifecycle。

## 边界

- 主入口是 L0 host-neutral API，不依赖 Electron、DOM、React 或功能包。
- Desktop Main/Node 能力由 owning package 的 Node entry 或应用 adapter 注入，不从 shared 暴露宿主兼容层。
- React、Theme、i18n 与 Webview 组件属于 `@neko/ui`；项目文件 IO、codec 和 authoring contract 属于 owning domain/package。
- 项目格式由 NKC codec 和各 owning domain schema 拥有；Cut Timeline 使用 OTIO。
- 功能包专属消息、编辑 operation 和领域 projection 留在 owning package，不下沉到 shared。

## 主要入口

| 入口                         | 职责                                     |
| ---------------------------- | ---------------------------------------- |
| `@neko/shared`               | 精简的 host-neutral 汇总入口             |
| `@neko/shared/core`          | 异步、并发与稳定值 utility               |
| `@neko/shared/errors`        | 基础错误 contract 与 handler             |
| `@neko/shared/logger`        | Logger contract、diagnostic 与 transport |
| `@neko/shared/path`          | 可移植路径解析                           |
| `@neko/shared/job-lifecycle` | 通用 Job 状态、存储、转换与 observation  |

```ts
import { BaseError, ConsoleLogger } from '@neko/shared';
import { PathResolver } from '@neko/shared/path';
```

不存在的 subpath 必须 fail-visible；不得重新增加 project-file、i18n、Theme、local-metadata 或
领域 DTO 的兼容 re-export。Canvas operation 属于 `@neko/canvas-domain`，Cut Timeline contract
属于 `@neko/cut-domain`，本地 metadata 属于 `@neko/local-metadata` 及其领域 adapter。
