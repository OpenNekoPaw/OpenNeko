# OpenNeko TUI / CLI

`neko` 默认启动交互式 Agent TUI。已经明确媒体类型时，可以使用平级的直接生成命令：

```bash
neko image "水墨风格山谷"
neko video "镜头缓慢推进"
neko audio "雨夜城市环境声"
```

这些命令直接调用配置的 image、video 或 audio 模型，不创建 AgentSession，也不会失败后回退为 Agent prompt。它们从 `[default_models.image/video/audio]` 对应媒体配置选择模型；`--model provider:model` 可覆盖本次调用。

命令等待任务完成，并输出保存到统一 generated-output 生命周期的稳定素材引用；`--json` 输出适合脚本消费的结构化结果。当前没有常驻后台进程，因此不提供可能在 CLI 退出后失去执行 owner 的 detach 模式。

```bash
neko image "产品概念图" --model openai:gpt-image-1 --json
neko video "云层延时摄影" --json
```

`image`、`video`、`audio` 是同级媒体类型。当前没有 `generate` 中间层，也不把 audio 细分为 music/TTS；未来出现独立模型类别时以新的平级命令扩展。
