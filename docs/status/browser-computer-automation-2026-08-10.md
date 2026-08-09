# Browser Use / Computer Use 闭环状态

日期：2026-08-10
事实来源：当前代码、`integrate-open-source-browser-and-computer-use` OpenSpec、固定 upstream release 与本地 deterministic tests。

## 结论

仓库内的安全与能力边界已经形成一条 canonical path，但发布级产品闭环尚未完成，因此 Extensions 只展示 Browser Use / Computer Use 为 `unsupported`、`artifact-unavailable`，不允许安装或启用。当前状态不能表述为“Browser Use 或 Computer Use 已可用”。

```text
已完成：contracts -> policy service -> reviewed MCP provider -> Agent Capability adapter
       -> contained Browser/Cua launch factory -> transient receipt -> honest catalog state

仍阻塞：first-party reproducible artifact -> signed packaged install/update
       -> production Host authorization/target UI -> real process composition
       -> visible/hidden Desktop evaluation -> capability ready
```

## 已完成的仓库内闭环

| 层         | 当前事实                                                                                                                                                                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP        | official SDK 是唯一 protocol adapter；保留 annotations、structured content、ordered mixed text/image、`isError` 与 cancellation                                                                                                                                       |
| Policy     | exact provider/release/profile/target/mode/budget/session owner；每次 action 重查 OS permission 与 target；single-action approval 不可重放                                                                                                                            |
| Provider   | provider session 冻结 exact target/mode；Cua `verify_state` 的 pid/window/session 由 Host-owned projector 注入，模型不能覆盖                                                                                                                                          |
| Browser    | `0.13.7` observe 五 Tool reviewed allowlist；每 session 独立 HOME/TMP/config/cache/browser data；只启动 `browser-use --mcp`，无模型凭据和 host secret。direct MCP 尚未把授权 exact origin/tab 绑定到新建空白 session，因此这里只是受控启动骨架，不是可用 observe 证明 |
| Computer   | `0.19.2` macOS observe profile 仅 `verify_state`；只启动 `cua-driver mcp --direct`，`bounded` policy 只允许 exact app window observation；disconnect 删除 session HOME/TMP/policy；其他 mode/OS fail-visible                                                          |
| Agent      | Capability adapter 使用 opaque targetKey，Host 返回 exact target/grant；绑定 conversation/run/toolCall，执行后关闭 owned session，无 provider fallback；结果不投影 pid/window/tab                                                                                     |
| Privacy    | screenshot bytes 复制进有 TTL、byte limit、exact session/action owner、single-consume 的 transient store；receipt 不含像素和 Host path                                                                                                                                |
| Extensions | bundled catalog source 列出两项，但 artifact 未满足时 `canInstall=false`、`artifact-unavailable`，刷新不会下载                                                                                                                                                        |

## Extensions 展示决策

- Browser Use 与 Computer Use 应展示：两者已有固定 upstream release、审核 profile、扩展包 identity 和明确的发布门禁。当前只能显示为不可安装的 `unsupported` / `artifact-unavailable`，不得出现安装、启用或“已支持”入口。
- 剪映/CapCut、Photoshop、ComfyUI、Blender、Unity 等目前不应作为支持项进入 Extensions：仓库只有 integration 架构方向，尚无对应扩展包、精确 operation contract、平台/应用 release qualification 和 round-trip 证据。
- 通用 Computer Use 是一种显式 transport，不等于对任意桌面应用的扩展支持。某个专业工具只有在贡献了具体 handoff、API/MCP 或逐应用资格化的 Computer Use operation 后，才能以自己的扩展 identity 展示。
- 如果未来要展示 roadmap，应使用与“可安装扩展”分离的产品面，不得复用 `unavailable` 伪造一个尚不存在的包。专业工具的长期边界见 [`../architecture/adr-neko-desktop-professional-tool-handoff-and-mcp-boundary.md`](../architecture/adr-neko-desktop-professional-tool-handoff-and-mcp-boundary.md)。

## 仍未完成的发布门禁

1. Browser Use 缺少从固定 source/dependency/Chromium 构建并发布的 OpenNeko first-party 自包含 artifact、完整
   SBOM/license inventory 和发布签名；Host 侧签名/完整性/安全展开与 poison tests 已实现，但不能替代真实发布输入。
2. Browser Use direct MCP 首次调用创建空白 session，当前没有不借助隐藏 navigation Tool 的 exact origin/tab
   binding；上游 redirect/new-tab 又在加载完成/创建后才处置，`observe` 真实页面与 `browse-read` / `interact`
   domain gate 均未资格化。
3. Cua Driver 虽有固定上游 macOS artifact，但尚未完成 OpenNeko packaged signing/notarization、TCC responsibility chain、target-only capture 与真实 fixture qualification。
4. Extension remote artifact 的 streaming download、disk/archive limits、atomic update、Main-owned progress、exact
   cancel 与 restart staging cleanup 已实现并通过 deterministic tests；同 artifact bounded resume、candidate process
   qualification、runtime/profile/download/data 分离删除仍未完成，且缺少 signed release 输入时 production 保持
   `artifact-unavailable`。
5. Desktop 尚未组合真实 target selection/session authorization、OS permission action、Agent Tool registration 和 Timeline Pause/Stop/Take over UI。
6. `agent-runtime.external-automation` 的 visible Desktop 与 hidden complete-session real-provider evaluation 尚未执行；Windows/Linux 保持 unavailable。

本次仅完成了开发态真实 Electron Extensions 页面验收：Browser Use `0.13.7` 与 Computer Use `0.19.2` 均可见，展示审核范围、权限和“此构建尚未发布已审核的运行时制品”，且没有安装按钮。该证据只验证 fail-visible catalog/UI，不替代 packaged artifact、真实 provider、OS permission 或 Agent Evaluation。

上述门禁由 [`../../openspec/changes/integrate-open-source-browser-and-computer-use/tasks.md`](../../openspec/changes/integrate-open-source-browser-and-computer-use/tasks.md) 跟踪。缺少外部 artifact、签名/notarization 身份、真实 OS grant 或 runner 时必须报告 `infrastructure-blocked`，不得用 mock、raw MCP 或开发机临时安装替代发布证据。
