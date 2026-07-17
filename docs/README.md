# 文档索引

本文是 `docs/` 的导航入口。根目录 `README_CN.md` / `README.md` 介绍项目，根目录 `ARCHITECTURE_CN.md` / `ARCHITECTURE.md` 是系统架构总览；`docs/` 承载更细的架构、领域、调研和状态资料。

## 发现路径

| 想了解                        | 先读                                                                       |
| ----------------------------- | -------------------------------------------------------------------------- |
| 项目定位和包分组              | [`../README_CN.md`](../README_CN.md)                                       |
| 系统分层和硬约束              | [`../ARCHITECTURE_CN.md`](../ARCHITECTURE_CN.md)                           |
| 当前任务队列                  | [`../TODO_CN.md`](../TODO_CN.md)                                           |
| 长期产品方向                  | [`../ROADMAP_CN.md`](../ROADMAP_CN.md)                                     |
| 仓库工作规则                  | [`../AGENTS.md`](../AGENTS.md)                                             |
| 子包边界、UI 层和公共代码规范 | [`architecture/package-boundaries.md`](architecture/package-boundaries.md) |
| 系统级架构决策                | [`architecture/README.md`](architecture/README.md)                         |
| 领域能力和领域架构            | [`domains/README.md`](domains/README.md)                                   |
| 调研、竞品和技术分析          | [`research/README.md`](research/README.md)                                 |
| Gap、迁移和健康度快照         | [`status/README.md`](status/README.md)                                     |
| 活跃设计变更                  | [`../openspec/`](../openspec/)                                             |
| 质量门禁机器输入              | [`../quality/README.md`](../quality/README.md)                             |

## 分类规则

| 文档类型   | 位置                           | 说明                                                 |
| ---------- | ------------------------------ | ---------------------------------------------------- |
| 系统架构   | `docs/architecture/`           | 跨领域、跨包、跨运行平面的约束和 ADR                 |
| 领域文档   | `docs/domains/<domain>/`       | 单个创作领域的能力模型、数据流和领域架构             |
| 调研分析   | `docs/research/`               | 市场、竞品、技术 spike、UX 观察和推理                |
| 状态快照   | `docs/status/`                 | 带日期的 gap、迁移、健康度和审计快照，不承载任务推进 |
| 开发中变更 | `openspec/changes/`            | 尚未固化的需求、设计、任务和规格变更                 |
| 任务队列   | `TODO_CN.md` / `TODO.md`       | 当前排队事项和轻量行动项，不承载设计正文             |
| 产品路线   | `ROADMAP_CN.md` / `ROADMAP.md` | 方向性目标和优先级，不承诺具体发布节奏               |
| 质量输入   | `quality/`                     | 供脚本和 CI 消费的 JSON 台账、规则数据和门禁输入     |
| 包私有实现 | `packages/<pkg>/docs/`         | 只服务某个包的配置、实现和维护说明                   |

## 写入原则

新增或移动文档前，先判断它是在描述稳定约束、领域模型、调研结论、当前状态、开发变更还是包私有实现。

- 会约束多个领域或多个运行平面：写入 `docs/architecture/`。
- 只解释一个领域内部能力：写入 `docs/domains/<domain>/`。
- 只是观察、对比或推理：写入 `docs/research/`，并标注日期和来源。
- 只是当前观察、进度或缺口：写入 `docs/status/`，并标注快照日期；需要推进的行动项转入 OpenSpec、TODO 或 Roadmap。
- 仍在设计或实施中：优先写入 `openspec/changes/`。
- 只是当前排队事项：写入根目录 `TODO_CN.md` / `TODO.md`。
- 只是方向性产品目标：写入根目录 `ROADMAP_CN.md` / `ROADMAP.md`。
- 供脚本或 CI 消费的机器可读质量数据：写入 `quality/`。
- 只影响一个包的维护者：写入 `packages/<pkg>/docs/`。

## 命名约定

领域目录内优先使用固定文件名，方便人和 Agent 发现：

| 文件                | 用途                                      |
| ------------------- | ----------------------------------------- |
| `README.md`         | 领域入口、范围、参与包/横切能力、阅读路径 |
| `architecture.md`   | 领域内部架构和边界                        |
| `capability-map.md` | 能力地图和扩展点                          |
| `data-flow.md`      | 核心数据流和状态流                        |
| `integration.md`    | 与 Engine、Proto、Agent、Assets 等边界    |

不要把实现日志、命令输出、阶段完成记录或临时状态写成架构事实。

状态文档只保存快照，不保存 `current` / `latest` / `todo` / `plan` 这类会伪装成当前事实的文件。
