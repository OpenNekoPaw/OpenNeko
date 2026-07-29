## Verification Snapshot

日期：2026-07-27

### Architecture and reuse

- `@neko/host/projection-attachment` 是 owner-neutral attachment envelope 的唯一公共实现；
  Agent projection 类型通过别名组合该 primitive，公共行为未改变。
- Desktop Main 拥有 Workspace/Project catalog、Window/Tab/View state、CAS persistence、
  picker 和 lifecycle；renderer 只消费去路径 projection，不拥有项目事实或文件能力。
- Shell bridge 只有 fixed sender-bound methods；mutation 使用 endpoint epoch 与 Window
  revision，unknown/stale sender 在目录 picker 前 fail-visible。
- UI 复用 `@neko/ui` primitives；P1.3-P1.6 surface 和 Character/World profile 不创建
  parallel runtime、mock fact 或 no-op success。

### Packaged runtime evidence

在 `darwin-arm64` production package、隔离 `userData` 和合成 Content workspace 中完成：

1. 启动 `neko-app://desktop/index.html`，Home 显示 0 Projects、Content Available、
   Character/World Unavailable。
2. directory picker 取消不落盘；选择合成 workspace 后出现唯一 Content Project Tab、
   Project shell、Context Dock 和 typed unavailable surfaces。
3. Home recent projects 显示一个 Content Project；关闭 Tab 后 Project 保留，重新选择同一
   workspace 创建新 View，但 catalog 仍只有一个 Project/Workspace。
4. 使用同一隔离 `userData` 重启后，恢复相同 Project Tab、active target、View identity 和
   Window revision。
5. 应用菜单 Quit 先完成 Window lifecycle，再释放 AppHost；修复前可复现的
   `Unknown or disposed Desktop window` 主进程异常不再出现。进一步修复 Window security
   disposer 在 `closed` 后重新访问已销毁 `BrowserWindow.webContents` 的资源 owner 错误；
   最终进程退出码为 0 且 stderr 为空。
6. 独立故障注入终止 renderer 后，main 保持存活；首次 crash 使用一次性 recovery budget
   reload，并沿正常 lifecycle 建立新 renderer epoch 和 Home snapshot。重复 crash 不进入
   无限 reload。
7. `codesign --verify --deep --strict` 通过；main/preload 使用 `.cjs`，renderer 使用
   `neko-app://`，sandbox、CSP、ASAR integrity 与 security fuses 保持启用，`file://`
   extra privileges 关闭。
8. `@electron/fuses` v2 reader 可命名并验证 Electron 43 全部 9 个 V1 fuse；严格配置启用
   `WasmTrapHandlers`，并按 macOS 分发资源契约关闭 browser-specific V8 snapshot。曾启用
   该 snapshot 的故障注入在主进程初始化阶段稳定产生 `Error loading V8 startup snapshot
file` / `SIGTRAP`，最终配置下 packaged app 正常启动。

测试只使用合成 workspace；完成后已将该目录移入废纸篓。renderer projection、文档与证据
摘要不包含 fixture 的绝对路径或用户私有配置。

### Focused validation

- `pnpm --filter @neko/app-desktop typecheck`：通过。
- `pnpm --filter @neko/app-desktop lint`：通过，0 warning。
- `pnpm --filter @neko/app-desktop test`：15 个测试文件、51 个用例通过。
- `pnpm --filter @neko/app-desktop package`：通过；运行态验证后发现远端 checksum 请求
  不稳定，现已固定参考平台归档 SHA-256，并由 architecture test 锁定。
- `pnpm --filter @neko/host test:run`：5 个测试文件、15 个用例通过。
- `pnpm exec vitest run packages/neko-agent-types/src`：11 个测试文件、98 个
  用例通过。
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
- `git diff --check`：通过。

### Remaining risk

- P1.2 只建立 Shell/navigation/state authority；Agent、Assets/Media Library、Canvas、Cut、
  Preview、Generation/Quality、Chara/Entity 和 Tools runtime 仍由 P1.3-P1.6 接入。
- Activity/Attention 当前是诚实的空 projection，Agent Context Dock slot 显示 P1.3
  unavailable；不代表领域能力已完成。
- 正式 Developer ID signing、hardened runtime、notarization、installer、update 与多平台
  资格属于 Phase 2。
