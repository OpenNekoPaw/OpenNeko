## Context

OpenNeko 的发布和本地原生加载链路当前声明了超过产品实际验证范围的平台。平台身份分散在 GitHub Actions matrix、Engine package config、FFmpeg 下载/打包脚本和 N-API loader 中，导致 `darwin-x64` 等目标即使没有真实硬件验证，仍可能被 workflow、可选依赖或本地二进制分支视为受支持。已移除的 GitHub `macos-13` runner 还会让对应 job 永久排队。

职责分析：GitHub workflow 拥有 runner 与发布编排；repository quality runtime matrix 拥有各 Host 的系统兼容性声明；Engine package config 拥有 canonical target 集合及 artifact identity；FFmpeg/平台打包脚本只消费该集合；N-API loader 拥有运行时 OS/architecture 到唯一 binding artifact 的解析和不支持平台诊断；文档拥有用户可见支持矩阵。

依赖分析：CI/Release matrix 选择 runner 并调用 packager，packager 依据 target 选择 N-API 与 FFmpeg 产物，VSIX/宿主在运行时由 loader 解析对应 native binding。任何上游新增 target 都会扩大发布承诺，因此必须先进入 canonical target contract，再被各消费者投影。

接口分析：唯一公开平台集合是 `darwin-arm64`、`linux-x64`。workflow matrix、package config、artifact name 和 loader 映射必须与该集合精确一致；Windows 和其他未知或不支持的 OS/architecture 不得回退到通用包、本地候选或其他架构产物。

扩展分析：未来新增平台必须显式修改 OpenSpec、canonical target 配置、真实 runner、FFmpeg 来源、N-API packaging、loader 映射、文档和防回流测试。不得仅添加 loader case 或 optional dependency 形成部分支持。

测试分析：静态编排测试断言 CI/Release matrix 精确一致且不含 Windows runner；Engine 脚本测试断言 target 列表和各 artifact projection；loader 测试注入 platform/arch 并证明 Windows 与其他非目标平台 fail-visible，且不会尝试 optional/local binding；在当前 macOS ARM64 主机执行聚焦 packaging smoke。

## Goals / Non-Goals

**Goals:**

- 将当前产品发布支持范围收敛为 macOS Apple Silicon 和 Linux x64。
- 让 CI、Release、Engine packaging、FFmpeg bundle 和 native loader 使用同一闭合集合。
- 删除 Intel macOS、Linux ARM64/musl、所有 Windows 架构、FreeBSD 等非产品成功路径。
- 对不支持平台提供明确、可测试且不会回退成功的诊断。
- 使用当前 GitHub Apple Silicon runner 执行 macOS ARM64 构建。

**Non-Goals:**

- 不提供 Rosetta/通用二进制或 Intel macOS 兼容 artifact。
- 不改变项目文件、用户设置或用户数据格式。
- 不承诺在两个目标之外的开发主机、发行版或 CPU 架构上运行。
- 不在本变更中修复或验证保留的 Windows 专用 Rust 实现；这些实现不得被当前发布、打包或 loader 路径命中。
- 不在本变更中重构媒体引擎、FFmpeg 功能或 TypeScript/Rust 构建流程。

## Decisions

### 1. 支持矩阵是闭集而非最佳努力列表

canonical targets 精确为 `darwin-arm64`、`linux-x64`。所有发布消费者必须投影这一集合，不允许 package config 声明额外 target 后再由 workflow 过滤。

替代方案是保留额外 packaging/loader 分支但不在 CI 运行；这会继续制造未经验证的隐式支持承诺，并允许错误 artifact 被加载，因此拒绝。

### 2. macOS 仅使用 Apple Silicon 原生 runner

`darwin-arm64` 使用 GitHub 当前 Apple Silicon runner 标签。删除 `darwin-x64` matrix entry 和 Intel runner，不做跨架构编译或 Rosetta 验证。

替代方案是在 ARM runner 上交叉生成 x64 artifact；FFmpeg、N-API 与运行时行为仍缺少真实 Intel 主机验证，不符合发布证据要求。

### 3. Host runtime matrix 投影相同的平台闭集

VS Code Extension、Node CLI 和 Bun TUI 的 runtime matrix 都只组合两个 canonical OS/architecture target，共 6 个 Host target。它不再用 OS 与 architecture 的笛卡尔积制造额外兼容承诺。

### 4. package config 是 Engine artifact target 的唯一事实来源

Engine target 配置只列出两个 canonical targets；平台打包、FFmpeg 下载和 package metadata 从该配置读取。各脚本不得维护额外支持列表或通过默认分支推断目标。

### 5. native loader 对非目标组合 fail-visible

loader 只映射两种 `process.platform`/`process.arch` 组合。Windows 和其他组合在尝试 require optional package 或本地 binding 前立即抛出包含实际平台和支持列表的错误。

替代方案是保留 napi-rs 常见平台模板；这些分支会让未打包、未测试目标偶然成功，违反唯一 canonical path。

### 6. 防回流测试比较精确集合和执行路径

测试不仅检查两个目标存在，还要比较排序后的精确集合，防止 Windows 或其他目标静默加入。loader 测试通过 poison unsupported require path，证明错误发生在任何 optional/local binding 尝试之前。

### 7. Windows 重新准入必须有真实平台证据

保留的 Windows 专用 Rust 源码仅代表尚未完成的实现，不构成支持承诺。未来恢复 `win32-x64` 必须通过独立 OpenSpec 同步 canonical target、workflow、FFmpeg/N-API packaging 和文档，并在真实 Windows runner 上验证 Rust/N-API 构建、平台 VSIX 安装与启动，以及至少一条 Engine 媒体读取和导出路径。macOS 交叉 `cargo check` 只能作为前置反馈，不能替代该证据。

## Risks / Trade-offs

- [Intel Mac 用户无法安装后续版本] → 在支持矩阵明确 Apple Silicon 要求；预发布阶段不迁移 artifact，用户需使用支持设备。
- [Linux x64 不覆盖所有 libc/发行版] → 本变更只声明现有 `linux-x64` artifact identity，不新增 musl 成功路径；具体最低运行环境继续由 Engine 发布验证定义。
- [三处 workflow/config 再次漂移] → 增加精确集合的编排和 package tests，漂移直接阻断质量门禁。
- [GitHub runner 标签未来再次退役] → runner 是 workflow-owned 配置；标签变更必须保持 target identity 不变并通过编排测试。
- [Windows 专用源码在暂缓期继续漂移] → 当前 loader/package path 对 Windows fail-visible；未来重新支持前必须在真实 Windows 环境修复并完成准入验证，不能把源码存在视为兼容性证据。
- [本机只能真实执行 macOS ARM64 smoke] → Linux 由远端确定性 packaging matrix 验证，交付中明确本地与远端证据边界。

## Migration Plan

1. 收敛 Engine canonical target 配置和测试。
2. 删除 FFmpeg、平台打包和 native loader 中的非目标成功分支。
3. 同步 CI/Release matrix，并将 macOS runner 更新为当前 Apple Silicon runner。
4. 更新支持矩阵文档和编排防回流测试。
5. 在 macOS ARM64 本地执行聚焦测试与 package smoke，由远端运行 Linux x64 packaging；Windows 不进入当前发布矩阵。

回滚只允许恢复本变更代码，不保留双矩阵或 compatibility artifact。由于项目尚未发布且不修改用户数据，不需要数据迁移。

## Open Questions

无。新增任何平台必须通过后续独立 OpenSpec 和真实平台验证。
