## Evaluation Scope

- Change/feature: Cut 从 NKV/NKC 和宽专业能力收敛为 OTIO-only 轻量编辑，并通过宿主 adapter 在 VS Code 保留 Engine、在 Desktop 使用 WebCodecs/Host FFmpeg。
- Current artifact stage: 本次只更新架构和 OpenSpec，不改变 Agent prompt、Skill、capability routing 或真实运行时，因此不运行 Agent evaluation。
- Future implementation trigger: 如果删除/修改 Agent 暴露的 Cut operation、媒体工具 schema、目标 document/revision 或 host capability routing，必须按 `neko-agent-evaluation` Skill 更新 indexed suite 并运行聚焦真实 case。

## Required future cases

### `cut-otio-lightweight-edit`

- 创建一个 `.otio`；
- 导入符合 profile 的 MP4/WAV；
- 完成 split、trim、reorder、ripple、audio gain/fade；
- 保存并重开；
- 证明 OTIO 是唯一写入文件，旧 NKV/NKC handler 被 poison。

### `cut-unsupported-profile-fails-visible`

- 输入 nested stack、第二条视频轨、未知 effect、VFR/HDR/10-bit 或多声道素材；
- 证明系统返回 object/path 或 media-field diagnostic；
- 证明没有 silent flatten、legacy fallback、空成功或源文件 mutation。

### `cut-vscode-engine-adapter`

- 在真实 Extension Development Host 打开同一 OTIO fixture；
- 证明 VS Code 选择 Engine adapter，能够播放、seek、输出 PCM 和导出；
- 证明 Engine 不写项目、不开放 profile-external 能力，也没有 Node/Desktop fallback。

### `cut-desktop-native-adapter`

- 在打包 Electron runtime 打开同一 OTIO fixture；
- 证明 bounded Range、选定 demuxer、WebCodecs、Host FFmpeg PCM 和 FFmpeg export 路径被命中；
- 证明 Neko Engine 未加载，媒体字节未通过 IPC/postMessage。

### `cut-cross-host-semantic-parity`

- 两个宿主执行相同编辑序列；
- 比较 OTIO 语义、duration、seek target、PCM timeline 和输出 profile；
- 记录允许的像素/音频容差以及任何宿主特有限制。

## Evidence requirements

- 每个真实 case 记录 scenario id、宿主与版本、fixture hash、目标 document/session/job identity、命中的 adapter/handler、输出 artifact 和 diagnostic。
- VS Code 视觉/交互证据必须来自 Extension Development Host；Desktop 证据必须来自打包 Electron，不以普通浏览器替代。
- Agent case 必须记录真实 provider/model/run/report identity；key-free harness 只能证明 runner/schema，不能证明行为。
- 所有报告使用隔离合成 workspace，不采集真实用户项目、凭据或私有媒体。

## Residual risks

- Remote/SSH/WSL/Codespaces 的 localhost locality 未验证；不能从本地 Extension Host 结果推断支持。
- WebCodecs codec、FFmpeg build、GPU driver 和 AudioContext 行为具有平台差异，需要发布矩阵。
- OTIO application metadata 的音频参数可能被第三方保留但忽略，交换 adapter 必须报告语义损失。
- FFmpeg 转换/导出质量和许可不由 Agent evaluation 覆盖，必须由媒体、分发和法律审计分别验收。
