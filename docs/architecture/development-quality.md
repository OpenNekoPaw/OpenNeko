# 开发与质量规范

本文只记录稳定的开发和质量原则。仓库硬约束以 [`AGENTS.md`](../../AGENTS.md) 为准，贡献流程和
常用命令见 [`CONTRIBUTING_CN.md`](../../CONTRIBUTING_CN.md)，机器可读门禁输入位于
[`quality/`](../../quality/)，代码审查执行方法由 `neko-quality-review` Skill 负责。

## 变更分类

OpenSpec 只用于能够独立命名，并改变系统能力边界、核心产品工作流、持久用户事实或安全/信任边界的
系统级或产品级功能变更。局部 UI、缺陷、性能、行为等价重构、目录整理、内部 contract、测试、构建、
依赖、文档治理和质量工具直接修改代码、测试或规范，不创建提案。

提案只保存稳定产品意图、边界和产品级验收。实现步骤、文件清单、命令结果、阶段记录和完成后的局部
修补不进入提案；代码形成 canonical path 后删除已经完成且不再承担产品设计职责的提案。

## 审查原则

非平凡变更必须回答：

1. 是否符合现有架构？
2. 如何降低耦合？
3. 是否易于扩展与测试？

跨模块或公共边界变更还必须明确：

| 维度 | 必须说明                                              |
| ---- | ----------------------------------------------------- |
| 职责 | 数据、规则、生命周期、错误和清理的 owner              |
| 依赖 | L0/L1/L2 与 Main/preload/renderer 的依赖方向          |
| 接口 | 唯一 public entry、contract、port、handler 和 adapter |
| 扩展 | 真实变化点与保持简单的理由                            |
| 测试 | producer、consumer、失败隔离和真实运行边界的证据      |

架构文档描述稳定系统约束和核心产品设计；代码与测试描述实际业务逻辑、接口和实现状态；注释只解释
代码无法直接表达的局部不变量。不得用文档复制代码结构、阶段进度或测试输出。

## 风险与验证

| 等级 | 典型范围                                            | 最低验证                                                 |
| ---- | --------------------------------------------------- | -------------------------------------------------------- |
| L0   | 文档、文案、低风险配置                              | 聚焦检查、链接或格式验证                                 |
| L1   | 局部组件、hook、service、state                      | 相关单元测试与 package build/typecheck                   |
| L2   | IPC、共享包、公共类型、跨包 contract                | producer/consumer contract、边界检查与相关 build         |
| L3   | Node/FFmpeg、媒体流、项目格式、Agent workflow、打包 | 架构审查、集成或 Desktop fixture、失败与资源生命周期验证 |
| L4   | 发布、安装、重大 UX、核心创作工作流                 | 完整适用门禁、真实产品路径和明确剩余风险                 |

按影响范围选择最小可靠验证：

| 范围                  | 入口                                                  |
| --------------------- | ----------------------------------------------------- |
| 提交前仓库门禁        | `pnpm gate:local`                                     |
| 架构与应用边界        | `pnpm check`、`pnpm check:application-boundaries`     |
| 未使用代码与残留      | `pnpm check:unused`、`pnpm check:legacy-debt`         |
| Agent 边界与评测平台  | `pnpm check:agent-boundaries`、`pnpm test:agent:eval` |
| Desktop headless 路径 | `pnpm test:functional:headless`                       |
| Desktop 图形化 UI     | `pnpm test:local:ui`                                  |
| Desktop 发布包        | `pnpm package:desktop`                                |

真实 API、hidden/visible Desktop、重复 matrix、消融和图形化验收只通过开发者显式本地入口运行，不加入
GitHub Actions 或通用 CI/gate。UI 视觉结果是参考证据，不替代 contract、安全、功能或代码门禁。

## 交付

交付或 Pull Request 记录变更摘要、关键设计、验证命令与结果、未执行项和剩余风险。仅当系统架构、
开发规范或核心产品设计改变时更新长期文档；普通实现变化以代码、测试和提交记录为准。
