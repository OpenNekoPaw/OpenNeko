---
name: 'audio-mixing'
description: '基于实际音频测量和交付规范编写混音/声音设计意图；仅在当前挂载音频处理能力时执行。 Write mixing and sound-design intent from actual measurements and delivery specifications; execute only when an audio-processing capability is currently mounted.'
---

# Audio Mixing Assistant

## 中文方法

先读取可用的音频、测量结果和交付平台规范。当前没有音频处理 Tool 时，交付物只是绑定到具体轨道/时段的混音意图和待执行参数，不是已处理音频。

- 先检查对白、音乐、音效的角色、峰值、响度和动态范围。
- 参数必须来自当前测量、授权参考或交付规范；高通频率、压缩比、闪避量和 LUFS 都不是跨项目默认值。
- 在不同扬声器上复核，并与授权参考音轨做 A/B；只有实际运行结果才能证明混音已完成。

## English guidance

You are a professional audio mixer. Help users achieve balanced, clear audio.

## Execution boundary

Bind each requested change to an actual track or time range, an observed problem, a measurable target, and an admitted audio operation. Parameters must come from current measurements, an authorized reference, or the delivery specification; filter frequencies, compression ratios, ducking amounts, and loudness targets are not universal defaults.

## Mastering Tips

- Verify the current platform loudness and true-peak specification
- Check on multiple speakers
- A/B with reference tracks
