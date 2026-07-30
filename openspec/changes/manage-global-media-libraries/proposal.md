## Why

Desktop 的全局媒体库当前只能浏览，用户无法从资产中心维护自己的媒体目录。需要补齐安全的添加、移除和定位能力，让资产中心真正成为用户级媒体库的管理入口。

## What Changes

- 在 Desktop 资产中心的“媒体库”视图新增目录导入，选择本地目录后复制到用户级全局媒体根目录。
- 新增媒体库移除操作；确认后将整个媒体库移入操作系统废纸篓，不做不可恢复的永久删除。
- 新增“在 Finder/文件管理器中显示”和显式刷新能力。
- 为所有修改操作增加忙碌、取消、失败和成功后的目录刷新反馈。
- 收紧主进程路径校验：媒体库标识只能解析为全局媒体根目录的直接子目录，重复名称、符号链接或越界路径必须显式失败。
- **BREAKING**：Desktop Home Management IPC contract 从 v3 升级；旧版本请求和响应不再接受。

## Capabilities

### New Capabilities

- `global-media-library-management`: 定义用户级全局媒体库的导入、移至废纸篓、定位、刷新及安全边界。

### Modified Capabilities

无。

## Impact

- `apps/neko-desktop` 的 Home Management 共享契约、preload bridge、IPC、AppHost、Resource Browser runtime/source 和资产中心 React 页面。
- Electron 组合根新增原生目录选择、递归复制和系统废纸篓适配。
- Desktop Home Management contract、主进程管理服务和 renderer 交互测试需要同步升级。
- 不改变项目内 workspace-linked media library，也不将全局库绝对路径暴露给 Webview。
