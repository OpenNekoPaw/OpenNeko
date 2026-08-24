# Agent Contracts post-DSH deletion inventory

## Retained canonical boundaries

| Responsibility                   | Contract files / public subpaths                                                        | Current production consumers                                  |
| -------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| DSH ACP and domain Tool envelope | `dsh-acp`, canonical image limits                                                       | DSH bridge, Agent runtime ACP, first-party domain DSH plugins |
| Main/preload/renderer Host IPC   | `dsh-session-host`, `dsh-runtime-host`, `dsh-permission-host`                           | Desktop Main/preload/renderer, Agent Webview                  |
| Conversation and Entry authority | `agent-entry-intent`, interaction/conversation binding/context, `agent-home`            | Host, Desktop, Agent runtime/Webview                          |
| Composer and configuration       | input intent/catalog/trigger, model catalog, effective configuration, LLM configuration | Host settings, Agent runtime/Webview                          |
| Current input attachments        | `message-attachment`, `agent-file-reference`, `agent-context`                           | Agent runtime input and Agent Webview composer                |
| Skill/MCP management             | `extension-management`, `extension-management-host`                                     | Desktop scene/IPC and Agent Webview management Root           |

`extension-management` is retained because the Skill/MCP scene is live. Its product name denotes the
user-facing container, not an OpenNeko Plugin runtime or a third user-visible extension kind.

## Deleted closed graphs

| Deleted graph                                                                      | Production reachability result                                                            | Replacement                                                                        |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `tool`, `tool-planning`, `tool-names`, `tool-summary`, `platform`                  | Test/barrel/retired graph only                                                            | DSH Tool lifecycle plus package-owned domain operations                            |
| `provider-card`, `provider`, `agent-profile`                                       | No production consumer after provider/profile runtime removal                             | DSH provider/session authority and `@neko/ai-contracts`                            |
| `agent-observation`, `perception-card`, `multimodal-context`, `multimodal-tooling` | Only retired provider projection and tests                                                | DSH ACP content blocks and current attachment admission                            |
| `message`, `artifact-transfer`, composite/storyboard/shot/comic contracts          | Only retired presentation/artifact graph and tests                                        | DSH session event projection plus Canvas/Generation-owned facts                    |
| PluginTransfer contract and presenter                                              | Menu/target functions had no rendered caller; only Ambient Canvas type was still imported | Ambient Canvas type stays with the live input presenter; domain Tools remain exact |
| token budget, trace, phase, provider/default settings, recovery helpers            | No production import                                                                      | No replacement; current DSH/session/config contracts remain                        |
| retired conversation unavailable                                                   | Test-only                                                                                 | Current DSH catalog diagnostics                                                    |

## Deleted runtime/Webview consumers

- legacy provider multimodal message projection;
- legacy multimodal context packet builder;
- legacy Message resource projector and conversation Host message builder;
- dead PluginTransfer menu/target presenter.

The live `image-batch-transport` remains because Agent prompt image admission consumes it.

## Dependency result

`@neko/agent-contracts` direct production dependencies changed from seven domain packages to three:

- retained: `@neko/ai-contracts`, `@neko/canvas-domain`, `@neko/content`;
- removed: `@neko/chara`, `@neko/entity-domain`, `@neko/media`, `@neko/search-domain`.

Top-level TypeScript in `packages/agent/contracts/src` decreased from 18,943 to 7,883 lines. The
remaining size is dominated by live DSH/Conversation/Entry contracts and will be audited separately;
this cleanup does not infer that every retained export is permanently canonical.
