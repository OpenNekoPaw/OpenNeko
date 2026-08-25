# 文档索引

仓库文档只承担三类长期职责：系统架构、开发规范和核心产品设计。实际业务逻辑、功能实现与实现进度以代码和测试为准。

## 入口

| 内容                   | 入口                                               |
| ---------------------- | -------------------------------------------------- |
| 产品定位与当前能力     | [`../README_CN.md`](../README_CN.md)               |
| 产品路线               | [`../ROADMAP_CN.md`](../ROADMAP_CN.md)             |
| 开发与验证             | [`../CONTRIBUTING_CN.md`](../CONTRIBUTING_CN.md)   |
| 系统架构与开发规范     | [`architecture/README.md`](architecture/README.md) |
| 核心领域设计           | [`domains/README.md`](domains/README.md)           |
| 系统级或产品级活跃提案 | [`../openspec/changes/`](../openspec/changes/)     |
| 机器可读质量规则       | [`../quality/README.md`](../quality/README.md)     |

## 写入规则

- `docs/architecture/` 只保存系统级架构、开发规范和跨领域长期不变量。
- `docs/domains/<domain>/` 只保存核心产品能力模型与稳定领域边界。
- 不提交调研归档、状态快照、Gap、审计、迁移日志、验证报告、命令输出或实现清单。
- 不用文档复制目录、文件、类、函数或控制流；内部实现直接阅读代码和测试。
- package README 只简要说明 public entry、运行边界和使用入口，不记录私有实现细节。
- 普通代码重构不要求同步文档；只有系统架构或核心产品设计发生变化时才更新对应文档。

OpenSpec 只承载尚未落地的系统级或产品级功能变更。局部 UI、缺陷、性能、重构、清理、测试和工具变更直接修改代码，不创建提案或配套文档。
