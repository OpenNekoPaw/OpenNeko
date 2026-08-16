## 1. Prompt 与评测协议收敛

- [x] 1.1 将 production system Prompt 和 Webview help/i18n 收敛到 Pi catalog、`read_skill`、`$skill` 与自然语言选择，并增加旧 meta-tool/slot poison absence 测试。
- [x] 1.2 将 Agent Evaluation case 与 hard gate 从 `GetContext` 迁移到当前真实只读 Tool，同步 suite fixture/index/hash，并验证全部 key-free suite。

## 2. Contract 与 Tool owner 收敛

- [x] 2.1 删除 Skill activation DTO、progress Host message/builder/union、Desktop allowlist 与公共导出，并证明真实 Agent capability lifecycle contract 仍有唯一 producer-consumer。
- [x] 2.2 删除 ToolSet/injection/loading-tier/category registry contracts、runtime registry/resolver/perception group、optional capability category bridge 与公共导出，保留 `ToolRegistry`、`CapabilityRegistryRuntime` 和描述性/presentation 类型。

## 3. Webview 与领域 consumer 清理

- [x] 3.1 删除 Webview activation progress handler/presenter/state/props/styles/tests，并以 focused presenter/controller/protocol 测试证明无隐藏 consumer 或 ignored compatibility path。
- [x] 3.2 删除 Chara 对不存在 Skill activation Tool 的 policy 项并更新 producer/consumer tests，保持真实角色 Tool policy fail-visible。

## 4. 验证与证据

- [x] 4.1 运行 OpenSpec strict validation、contracts/runtime/webview/chara focused tests 与 typecheck、public-surface/legacy/unused/diff gates，记录实际命令和失败分类。
- [x] 4.2 尝试 owning suite 的真实 Desktop provider-backed Agent Evaluation；若缺少明确配置或成本授权，记录准确 `infrastructure-blocked`，不得用 key-free 结果代替。
- [x] 4.3 写入 `implementation-evidence.md`，逐项记录 delete/preserve/rename-collapse/deferred-overlap 的 producer、consumer、替代路径、absence/poison 证据与剩余风险。
