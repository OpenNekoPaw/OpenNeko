## Why

Character Management detail 已是只读页面，但只显示摘要、版本数量和版本 selector。immutable
CharacterVersion 中已有背景、设定、canon、知识边界、行为/表达策略、representation/model references 与 voice/TTS
defaults；管理页没有投影这些事实，用户无法在启动对话前判断当前版本内容和表现能力。

## What Changes

- Character detail 按 exact selected CharacterVersion 展示身份与设定、canon/知识边界、行为/表达策略、
  representation/model references 与默认选择、voice/TTS defaults。
- 明确区分 Character-owned 表现模型/TTS 默认值与 Agent Conversation-owned LLM provider/model；管理页不提供编辑、
  不伪造未创建 Conversation 的 effective LLM model。
- 缺失可选字段显示稳定的“未配置”展示语义；非法 authoritative record 保持现有 fail-visible diagnostic。
- 增加版本切换、长内容、空值、representation/voice 与只读无编辑控件的组件测试和 UI 验证。

## Capabilities

### New Capabilities

- `character-management-preview`: 定义 Character Management 对 immutable version facts、representation/model 与
  TTS defaults 的只读预览语义。

## Impact

- `packages/chara-webview`: 拥有只读 detail projection/presentation；只消费现有 global Character snapshot。
- `packages/chara/contracts`: contract 不扩展，现有 immutable CharacterVersion 是唯一 authority。
- `apps/neko-desktop`: 继续只传现有 snapshot/callback，不增加业务事实或编辑 IPC。
- 需要 focused component tests、真实 Desktop UI visual validation 与 L3 quality review。
