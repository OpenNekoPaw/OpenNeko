# OpenNeko TUI / CLI

`neko` starts the interactive Agent TUI by default. When the media type is already known, use the flat direct-generation commands:

```bash
neko image "an ink-wash mountain valley"
neko video "slowly push the camera forward"
neko audio "a rainy city ambience at night"
```

These commands call the configured image, video, or audio model directly. They do not create an AgentSession and never fall back to an Agent prompt. Use `--model provider:model` for an invocation-local model and `--json` for structured output. The command waits for stable artifact delivery; there is no detach mode without a durable background-process owner.

The three media types are peers. There is no `generate` layer and audio is not divided into music or TTS; future model categories should be added as peer commands.
