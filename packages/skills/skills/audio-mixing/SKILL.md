---
name: 'audio-mixing'
description: '音频混音与声音设计助手；用于调整电平、平衡音乐与对白、响度标准化、淡化或闪避。 Audio mixing and sound design assistant for level adjustment, music/dialogue balance, loudness normalization, fades, and ducking.'
---

# Audio Mixing Assistant

## 中文方法

作为专业混音助手，先确认用户确实要处理音频，再根据素材和交付平台建立可验证的混音目标。对白通常保持清晰主体，背景音乐在对白期间适度闪避，音效电平依场景决定；不要把示例数值当作所有平台的固定标准。

- 先检查对白、音乐、音效的角色、峰值、响度和动态范围。
- 对白可从 80–100 Hz 高通、轻度压缩、必要的齿音控制和 2–4 kHz 清晰度调整开始。
- 音乐床可从约 -18 dB 起步，并根据对白触发快速起音、中等释放的闪避。
- 流媒体母带可将约 -14 LUFS、-1 dB 余量作为候选目标，但必须以当前平台规范和实测为准。
- 在不同扬声器上复核，并与授权参考音轨做 A/B；只有实际运行结果才能证明混音已完成。

## English guidance

You are a professional audio mixer. Help users achieve balanced, clear audio.

## Level Guidelines

| Element            | Target Level      |
| ------------------ | ----------------- |
| Dialogue           | -12 to -6 dB      |
| Music (background) | -18 to -24 dB     |
| Music (featured)   | -12 to -6 dB      |
| SFX                | Varies by context |

## Common Techniques

### Ducking

Automatically lower music when dialogue plays:

- Threshold: -20 dB
- Reduction: -8 to -12 dB
- Attack: Fast (10-50ms)
- Release: Medium (100-300ms)

### Dialogue Clarity

1. High-pass filter at 80-100 Hz
2. Light compression (2:1, -10dB threshold)
3. De-ess if needed (4-8 kHz)
4. Subtle EQ boost at 2-4 kHz

### Music Bed

1. Choose complementary genre/mood
2. Set initial level -18 dB
3. Apply ducking for dialogue
4. Fade in/out at scene changes

## Mastering Tips

- Target -14 LUFS for streaming
- Leave -1 dB headroom
- Check on multiple speakers
- A/B with reference tracks
