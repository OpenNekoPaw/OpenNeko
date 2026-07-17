# Marketplace 与 Registry

更新日期：2026-06-15

Marketplace 是 OpenNeko 的横切分发、安装和信任边界。它服务 Skill、preset、shader、素材包、模型包、插件等能力，但不属于任何单一创作领域。

## 设计目标

- 将客户端安装/管理与服务端发布/审核/签名/结算分离。
- 让创作领域通过 install target 和 manifest 消费市场资源，而不是直接耦合 marketplace UI。
- 对 native plugin、shader、sideload 和第三方来源建立明确 trust 边界。

## 客户端与服务端边界

```text
neko-market client
  install
  describe
  manage
  verify downloaded manifest/signature
  broadcast installed capability/assets
        |
        v
registry server
  publish
  review
  sign
  billing / entitlement
  upstream proxy
  search / recommendation
  ontology and trust metadata
```

客户端不做发布、签名生成、评级写回、上传、结算、用户注册或服务端搜索索引维护。

## 包边界

| 包                               | 职责                                                                   |
| -------------------------------- | ---------------------------------------------------------------------- |
| `neko-market/packages/core`      | registry DTO、manifest、install target、纯协议逻辑                     |
| `neko-market/packages/extension` | VS Code commands、下载、校验、安装、卸载、workspace trust、auth bridge |
| `neko-market/packages/webview`   | 浏览、展示、安装意图、管理 UI                                          |
| `neko-auth`                      | token/session/credential provider                                      |
| `neko-assets`                    | 本地素材库消费安装结果                                                 |
| `neko-agent`                     | Skill、tool、provider capability 的市场来源                            |
| `neko-engine`                    | shader/native plugin 等 engine artifact 的加载边界                     |

## Manifest 与 Install Target

Market manifest 描述“这是什么、来自哪里、如何验证、安装到哪里、需要什么权限”。Install target 描述“安装后由哪个子系统消费”。

| Asset/Capability               | 典型消费方                        |
| ------------------------------ | --------------------------------- |
| media / reference pack         | Assets、Video、2D、Model          |
| skill / prompt / provider card | Agent                             |
| shader / effect / LUT          | Engine、Video、Model              |
| model / material / HDR         | Model、Assets                     |
| puppet / Live2D pack           | 2D、Interactive                   |
| preset / template              | 对应创作领域                      |
| native plugin                  | Engine runtime，受更高 trust 约束 |

## Trust 与治理

- Registry manifest 由服务端生成和签名，客户端只验证和消费。
- Native plugin 是 engine native cdylib，具备进程级风险，必须走更高 trust tier、publisher 身份和 workspace trust。
- Shader 属于 engine artifact，需声明目标 runtime、权限、兼容性和来源。
- Sideload 允许本地安装，但必须标记来源、trust、权限和可撤销记录。
- Market 安装结果不自动成为项目事实；创作领域应通过 asset/entity/resource binding 显式引用。

## 与 Auth 的关系

Market 需要 Auth 提供 registry token、entitlement 和用户身份状态。Auth 只提供认证能力，不参与 market manifest 语义、安装目标或 trust 判断。

## 与创作领域的关系

领域文档可以描述“视频创作如何安装 LUT 包”“场景创作如何安装材质包”“角色创作如何安装 Puppet 包”，但 Marketplace 的协议、trust 和客户端/服务端边界由本文定义。

## 吸收的稳定主题

本设计吸收以下历史主题的稳定部分：

- neko-market client design
- registry server contract
- marketplace plugin governance
- install target contributions
- asset federation 中的 market source 语义
- capability protocol 中的 market capability source
