## 1. Package UI

- [ ] 1.1 定义 snapshot-first Webview host contract 和 Library/Studio/Runtime projection。
- [ ] 1.2 实现启动、交互、Save/branch/replay 控件及 loading/empty/error/denied states。

## 2. Desktop composition

- [ ] 2.1 实现 Host scenes、sender-bound IPC、preload ports、resource authorization 和薄 renderer composition。
- [ ] 2.2 添加 delegation/poison/lifecycle tests，证明没有 app-owned workflow、direct runtime shortcut 或隐藏 Root。

## 3. Verification

- [ ] 3.1 运行 focused tests/typechecks 与架构门禁。
- [ ] 3.2 通过真实可见 Electron 完成标准/小窗口功能、视觉、重开和资源释放验收。
- [ ] 3.3 保持 production gate，直到独立 promotion change 接受真实用户证据。
