# ADR: 代码债务与冗余治理

状态：Accepted

更新日期：2026-08-01

范围：全仓库 TypeScript、React、Electron、Node/FFmpeg、共享契约和质量门禁。

## 决策

代码清理以职责和执行路径为单位，不以关键词数量或文件大小为目标。每类行为必须收敛到一个
canonical owner 和一条生产路径；无调用方 scaffold、重复 DTO、平行 adapter、成功 no-op、
静默默认值和自动 fallback 应删除或改为明确诊断。

## 分类

| 类型 | 处理 |
| --- | --- |
| 完全不可达、无 owner、无生产 consumer | 删除代码、export、fixture、文档和依赖 |
| 与 canonical path 重复 | 迁移调用方后删除平行实现，并用路径断言证明未命中旧分支 |
| 跨包语义和生命周期一致 | 评估提取到中立 contract/service/UI primitive |
| 仅结构相似但 owner 或运行环境不同 | 保留局部实现，记录不共享原因 |
| 外部 provider、用户数据、安全边界的恢复逻辑 | 保留显式错误来源、恢复语义、诊断和测试 |
| 开发错误、未知 schema、缺失 handler | fail-visible，不返回空值或成功状态 |

## 清理顺序

1. 定义目标 owner、contract、调用方、生命周期和错误语义；
2. 限定替换边界并补充能证明当前缺陷的路径测试；
3. 迁移本次边界内的生产调用方；
4. 删除被替代实现、export、配置、测试 fixture 和文档；
5. 运行残留搜索、依赖检查、unused/debt 门禁和受影响运行态验收。

不得通过第二套 interface、adapter 套 adapter、版本分支或双写长期维持错误设计。确需保护
有价值本地数据或外部契约时，迁移逻辑必须有 owner、移除条件、到期任务和 fail-closed 测试。

## 复用审计

新增 provider、registry、bridge、router、store slice、UI panel、hook 或 DTO 前，先搜索一级
package 公共入口、相邻领域和测试。只有职责、生命周期、错误模型与变化方向一致时才共享；
不得让一个领域 package 导入另一个领域的内部实现。

## 验证

- 文档/元数据：`git diff --check` 与链接、路径、schema 一致性；
- 残留清理：`pnpm check:legacy-debt`、`pnpm check:unused`；
- 跨包契约：生产者/消费者测试、`pnpm build`、`pnpm test`、`pnpm check`；
- Renderer、IPC、媒体和生命周期：真实 Electron Desktop 聚焦场景。

相关规则见 [`adr-code-review-quality-gates.md`](adr-code-review-quality-gates.md) 与
[`package-boundaries.md`](package-boundaries.md)。
