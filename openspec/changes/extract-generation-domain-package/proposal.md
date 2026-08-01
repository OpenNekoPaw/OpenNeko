## Why

`@neko/generation` 已成为 Desktop generation request/result、provider capability 和 recoverable
GenerationJob 的 owner。剩余工作是用一个显式授权的真实 provider case 证明当前 package/port
被命中且旧 Platform Job path 未参与。

## What Changes

- 保持 `@neko/generation` 对 GenerationJob contract/coordinator/store/codec 的唯一所有权。
- Desktop/Agent/Canvas 等 callers 只依赖公开 Generation ports；领域包不读取配置文件或 secret。
- Provider/config/credential 由 Desktop Host 投影成 immutable binding，不产生兼容 facade。
- 完成一个有明确成本授权的真实 provider path 验收。

## Capabilities

### New Capabilities

- `generation-domain-package`: Generation package ownership、Job lifecycle、Host binding 与 no-fallback path。

### Modified Capabilities

- `domain-job-lifecycle-kernel`: Generation producer 使用 `@neko/generation` 的唯一 Job owner。

## Impact

- `packages/neko-generation`、Desktop Agent/Canvas consumers 和 provider runtime。
- 不保留 TUI/VS Code consumer、Platform Job re-export、双 store/coordinator 或 fallback。
