# Merge Content Addressing Improvements

## Goal

移植 `feat-desktop` 中已验证的 canonical Content Locator、Canvas 和内容消费者改进，保持当前 DSH/ACP 为唯一 Agent 运行时 authority。

## Scope

- 统一 Content Locator 的文件 authority、selector、验证和序列化语义。
- 将 Canvas、资产、Generation、Preview、Project 和文本内容消费者迁移到同一 locator contract。
- 保留现有 `openneko.document`、DSH domain Tool、ACP bridge 和旧 Agent UI presentation。

## Explicitly excluded

- 不合并 Pi Agent、`pi-agent-core`、旧 Agent runtime、旧 Skill/MCP/Plugin runtime 或协议。
- 不用 feat-desktop 的旧 Agent contracts、controller、message runtime 或 renderer 替换 DSH 实现。

## Acceptance

Canonical locator 的生产者和消费者使用同一 shape；单项非法 locator fail-local；DSH Tool、Canvas 和内容读取路径继续通过当前 DSH/Host 边界工作。
