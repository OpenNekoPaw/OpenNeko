## Context

`@neko/host` 已提供 environment、workspace、filesystem、path、policy、secret、external
和 diagnostic ports。它们不依赖 Electron，也不应因 Desktop 实现而引入 Electron 类型。
TUI 已有 Node adapter，但该实现拥有 TUI 的 headless identity、workspace 选择和策略；
Desktop 需要图形化 host identity、窗口 owner、preload bridge 和 Electron 生命周期。

`apps/neko-desktop` 是新的 composition root，不恢复历史 Desktop、Workbench Core 或
`neko-home`。本变更只交付可启动 foundation，不把功能包简化 surface 描述为已接入。

## Goals / Non-Goals

**Goals:**

- 建立可以启动、reload、关闭窗口和退出的安全 Electron 应用。
- 让 renderer 只能通过固定、版本化、purpose-scoped bridge 获取安全 bootstrap
  projection。
- 实现 Electron 环境所需的 `NekoHostPorts`，并保持 workspace/path/IO 权限边界。
- 用显式 application identity 和 instance identity 支撑后续多窗口状态协议。
- 用 contract test 和 Electron fixture 证明 canonical path 与资源释放。

**Non-Goals:**

- 实现 Phase 1 Shell、Project catalog 或领域 UI。
- 把 TUI Node adapter 直接移动为未经验证的通用 Node host。
- 提供 raw IPC、任意 command、任意本地路径或 credential 给 renderer。
- 实现媒体 streaming protocol、外部进程、插件、MCP 或 Computer Use。
- 声明 Linux、Windows、HDR、10-bit 或 codec 发布支持。

## Five-Layer Analysis

| 层 | 设计结论 |
| --- | --- |
| 职责 | main 拥有 Electron 与 privileged lifecycle；preload 拥有窄 bridge；renderer 只拥有浏览器 UI；`@neko/host` 继续拥有 host-neutral ports。 |
| 依赖 | renderer 不依赖 Node/Electron/VS Code；preload 只依赖 Electron 和 shared serializable contract；main 不依赖 React；packages 不依赖 application root。 |
| 接口 | bootstrap request/response 使用固定 version、requestId、windowId、application identity 和 diagnostic；Host ports 继续使用现有公共 contract。 |
| 扩展 | 后续领域各自增加 versioned namespace/adapter；不得增加跨领域万能 command router。 |
| 测试 | parser、sender/window identity、security preferences、reload/close/quit disposal、architecture import 和真实 Electron smoke 分层验证。 |

## Decisions

### 1. Electron Host 留在 composition root

目标结构：

```text
apps/neko-desktop/
  src/main/
    app-host.ts
    electron-host-ports.ts
    lifecycle.ts
    security.ts
    window-registry.ts
  src/preload/
    index.ts
  src/renderer/
    main.tsx
  src/shared/
    bridge-contract.ts
```

`ElectronNekoHostPorts` 组合现有 `NekoHostPorts`。只有当 Desktop 与 TUI 出现第二个经过
测试、语义一致的 Node primitive 后，才以独立变更把共同实现提升到 `@neko/host/node`。

### 2. Bridge 是固定能力，不是 IPC 转发器

P1.1 只暴露：

```text
desktop.bootstrap.get()
desktop.lifecycle.subscribe()
```

公开值必须是可序列化 DTO，不包含 Electron event、WebContents、Buffer、Node path、
credential 或函数句柄。每个 request 和 event 携带 contract version、application
instance、window identity 与 sequence。未知 version、channel、sender 或 window 必须
返回明确 diagnostic 或拒绝 promise。

### 3. Window registry 是身份 authority

main 创建 `WindowId` 并绑定真实 `BrowserWindow`/`WebContents`。IPC handler 根据
`event.sender` 和 frame URL 反查 identity；renderer 自报的 windowId 只能用于匹配，
不能授予权限。reload 产生新的 renderer epoch；window close 终止该 owner 下的
subscription 和 disposable；app quit 终止全部 runtime handle。

### 4. 安全配置集中且可测试

窗口必须使用：

- `sandbox: true`
- `contextIsolation: true`
- `nodeIntegration: false`
- `nodeIntegrationInSubFrames: false`
- `webSecurity: true`
- `allowRunningInsecureContent: false`

preload 不暴露 raw `ipcRenderer`。导航、窗口创建和 permission request 默认拒绝；仅
P1.1 明确支持的本地 renderer origin 可以加载。CSP 不允许 `unsafe-inline`、任意远程
script、`file:` 或任意 localhost。

### 5. Desktop identity 直接替换旧 Home identity

`NekoApplicationId` 改为 `neko-desktop | neko-tui | neko-vscode`。
`parseNekoApplicationIdentity()` 对 `neko-home` 返回
`unknown-application-identity`。迁移计划仍允许 `sourceApplicationId` 使用 string
描述旧来源，但 target 只能是 canonical identity。

审计按以下分类记录处置：

| 分类 | P1.1 处置 |
| --- | --- |
| settings | 已知 schema 显式迁移，否则拒绝 |
| conversations | 复用 owning workspace identity |
| project-registry | 保留 workspace identity，后续由 P1.2 投影 |
| credentials | 保留 OS secret owner，不读取或复制明文 |
| trust-state | 只复用相同 workspace/config digest |
| installed-packages | 保留记录，不在 P1.1 激活 |
| generated-artifacts | 保留 stable locator，不移动源文件 |
| rebuildable-cache | 显式重建 |

如果仓库、fixture 和应用已知 storage roots 中没有 `neko-home` 数据，只删除成功路径并
增加拒绝测试；不得制造空迁移器或双读。

### 6. Foundation UI 只证明真实路径

renderer 显示 application/window/runtime bootstrap 信息和明确的 “Desktop foundation”
状态。它不使用 mock store，不渲染假的项目、Agent 或编辑器。开发模式和打包模式都必须
通过同一 preload contract 获取 bootstrap projection。

## Risks / Trade-offs

- Electron 增加安装体积和供应链面；通过精确版本、lockfile、fuses/packager 配置和
  安全测试控制。
- P1.1 直接实现 Node filesystem/path primitives，可能与 TUI 有少量重复；只有经过
  两个宿主的语义对比后再提取，避免让 TUI 细节成为错误公共契约。
- 自动化启动 Electron 依赖图形会话；contract/security tests 必须可在无 UI 环境运行，
  真实 smoke 使用隔离 fixture 并记录无法执行时的阻塞条件。
- P1.1 不实现 media custom protocol；后续 P1.5 必须使用独立、授权、支持 Range 的
  canonical adapter，不能从 foundation bridge 暴露文件路径。
