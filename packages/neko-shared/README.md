# Neko Types (`@neko/shared`)

> 共享基础设施：Logger、i18n、Theme、Errors、路径、项目文件 IO 与稳定的跨包基础契约。

## 边界

- 主入口是 L0 host-neutral API，不依赖 Electron、DOM、React 或功能包。
- Desktop Main/Node 能力从明确的 Node 子路径或应用 adapter 注入，不从 shared 暴露宿主兼容层。
- Webview/React 能力只从 `@neko/shared/i18n/webview`、`@neko/shared/i18n/react` 等浏览器入口导出。
- 项目格式目前由 NKC codec 和各 owning domain schema 拥有；Cut Timeline 使用 OTIO。
- 功能包专属消息、编辑 operation 和领域 projection 留在 owning package，不下沉到 shared。

## 主要入口

| 入口                             | 职责                                      |
| -------------------------------- | ----------------------------------------- |
| `@neko/shared`                   | host-neutral 类型与 utility               |
| `@neko/shared/path`              | 可移植路径解析                            |
| `@neko/shared/project-file-io`   | 通用项目文件 IO 骨架与 NKC codec registry |
| `@neko/shared/project-authoring` | client-neutral authoring contract         |
| `@neko/shared/local-metadata/*`  | 本地可重建 metadata projection            |
| `@neko/shared/i18n/webview`      | 浏览器 i18n                               |
| `@neko/shared/i18n/react`        | React i18n                                |

```ts
import { BaseError, ConsoleLogger, I18nService } from '@neko/shared';
import { createNkcProjectFormatCodecRegistry } from '@neko/shared/project-file-io';
```

旧 NKV codec、Timeline DTO、通用 `EditOperation`、Diff/Timeline generated interface
已经删除。Canvas operation 属于 `@neko-canvas/domain`，Cut Timeline contract 属于
`@neko-cut/domain`。未形成 Desktop producer 的 Tools media-diff 原型已经退役。
