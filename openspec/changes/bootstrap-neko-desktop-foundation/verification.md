## Verification Snapshot

日期：2026-07-27

### Legacy application identity audit

审计限定在仓库、测试 fixture、OpenNeko 已知用户元数据目录和应用支持目录；只检索路径名
及 `neko-home` identity 引用，没有读取 credential、token 或 secret 内容。

- 未发现名为或包含 `neko-home` 的本地数据目录、fixture 或用户元数据文件。
- 仓库生产代码不再接受 `neko-home`；剩余引用只存在于拒绝测试、历史/状态文档和
  OpenSpec 迁移约束。
- 本机存在 canonical `neko-desktop` 应用支持目录；本变更不删除、移动或读取其中内容。

因此没有需要迁移的旧 Home 用户数据，不创建双读、双写或空 migration runtime。分类
处置如下：

| Storage category | Disposition |
| --- | --- |
| settings | 无旧 Home 数据；新 Desktop 由 canonical app owner 创建 |
| conversations | 无旧 Home 数据；后续复用 workspace/Conversation authority |
| project-registry | 无旧 Home 数据；P1.2 复用 workspace identity 建立 projection |
| credentials | 未读取；继续由 Host secret/OS credential owner 持有 |
| trust-state | 无旧 Home 数据；后续只接受相同 workspace/config digest |
| installed-packages | 无旧 Home 数据；Phase 1 不激活插件 |
| generated-artifacts | 无旧 Home 数据；后续只使用 stable locator |
| rebuildable-cache | 无旧 Home 数据；仅 canonical owner 可重建 |

### Dependency and supply-chain decision

- Electron `43.2.0`：2026-07-27 当前稳定系列，Node 24 与仓库基线一致。
- Electron Forge、Vite/Fuses plugins `7.11.2`：精确锁定，Vite plugin 的 experimental
  状态保留为升级风险。
- `@electron/fuses` `2.1.3`：覆盖 Electron 43 的全部 9 个 V1 fuse；Forge plugin
  `7.11.2` 只透传稳定的 `FuseConfig` / `flipFuses` API，pnpm workspace 对该精确版本显式
  扩展 v2 peer range，未保留第二条 fuse 写入路径。
- Vite `6.4.2` 与 `@vitejs/plugin-react` `4.3.4`：遵循仓库 override。
- React/React DOM `18.3.1`：与现有 Webview/共享 UI 主版本一致。

### Runtime evidence

- Forge 生成 ad-hoc signed `darwin-arm64` packaged app，并写入 ASAR/fuses。
- 使用隔离 packaged app 启动真实 Electron 窗口，renderer URL 为
  `neko-app://desktop/index.html`。
- preload bootstrap 返回 `neko-desktop`、`electron`、`darwin/arm64` 和显式 WindowId。
- reload 后同一窗口 renderer epoch 从 `1` 递增到 `2`。
- 关闭窗口后应用进程退出；未留下运行中的 OpenNeko 实例。
- 视觉与 accessibility tree 均显示真实 foundation projection，没有 mock project 或
  domain success surface。

P1.2 packaged smoke 进一步补齐了 P1.1 验证未发现的两个打包边界：

- `"type": "module"` package 必须输出并引用 `main.cjs` / `preload.cjs`，否则 production
  Electron 会在项目代码执行前拒绝 CommonJS main bundle；architecture regression test
  已锁定该边界。
- 无 Apple Team ID 的开发产物使用显式 ad-hoc identity，并清除 inherited hardened
  runtime flag；`codesign --verify --deep --strict` 通过，sandbox、CSP、ASAR integrity 和
  security fuses 保持启用，`GrantFileProtocolExtraPrivileges` 显式关闭。
- Forge 为 Phase 1 `Electron 43.2.0` `darwin-arm64` 归档提供固定 SHA-256；本地缓存仍经
  checksum 校验，但构建不再依赖每次联网重新获取 `SHASUMS256.txt`。
- V1 fuse 使用 `strictlyRequireAllFuses: true` 并显式配置全部 9 位；新增
  `WasmTrapHandlers` 保持启用，fuse reader 不再显示未知 `undefined` 位。
  `LoadBrowserProcessSpecificV8Snapshot` 显式关闭：启用时真实 package 因 Electron macOS
  分发包缺少 browser-specific snapshot 而 fail-visible 退出，关闭后恢复 canonical 启动。
- Window security 在配置时捕获其 `webContents` owner；Electron 已销毁 BrowserWindow 后
  不再通过失效 getter 清理 listener。回归测试先稳定复现 `Object has been destroyed`，
  最终 packaged app 从应用菜单 Quit 后退出码为 0 且 stderr 为空。

### Validation results

- `pnpm --filter @neko/app-desktop typecheck`：通过。
- `pnpm --filter @neko/app-desktop lint`：通过，0 warning。
- `pnpm --filter @neko/app-desktop test`：15 个测试文件、51 个用例通过。
- `pnpm --filter @neko/app-desktop build`：通过，生成 `darwin-arm64` package。
- `pnpm --filter @neko/host test:run`：5 个测试文件、15 个用例通过。
- `pnpm build`：9/9 Turbo tasks 通过。
- `pnpm test`：28/28 Turbo tasks 通过。
- `pnpm check`：unused 与 dependency-cruiser 通过，1264 modules、4242 dependencies
  无违规。
- `pnpm check:quality`：通过；67 个 OpenSpec items 严格校验通过。
- `pnpm check:legacy-debt`：通过。
- `codesign --verify --deep --strict apps/neko-desktop/out/OpenNeko-darwin-arm64/OpenNeko.app`：
  通过。
- `pnpm exec electron-fuses read --app out/OpenNeko-darwin-arm64/OpenNeko.app`：9 个 V1 fuse
  均可命名并与严格配置一致。
- `pnpm lint`：退出码 0；Desktop 为 0 warning，仓库其他既有代码仍报告 259 个 warning。
- `git diff --check`：通过。

### Remaining risk

- 产物只有本地 ad-hoc 签名，尚未使用 Developer ID、hardened runtime、公证或进入 release
  channel；这些属于发布/Phase 2 工作。
- 当前真实运行证据只覆盖 `darwin-arm64`，不声明 Linux 或 Windows 支持。
- P1.1 不包含 project catalog、domain adapters、media protocol、secret storage、
  auto-update、MCP、Computer Use 或专业工具控制。
