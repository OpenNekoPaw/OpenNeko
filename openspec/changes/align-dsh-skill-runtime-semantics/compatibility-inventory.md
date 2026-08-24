# DSH Skill rc.8 compatibility inventory

## Pinned authority

- Package: `@deepseek-ai/dsh-skill@0.1.0-rc.8`
- Filesystem provider: `@deepseek-ai/dsh-skill-filesystem@0.1.0-rc.8`
- Model consumer: `@deepseek-ai/dsh-tool-skill@0.1.0-rc.8`
- Dependency evidence: `packages/dsh-bridge/package.json`, `pnpm-lock.yaml`, `scripts/dsh-development-runtime/pnpm-lock.yaml`
- Runtime composition evidence: the locked DSH standard preset mounts `skill-filesystem` and `tool-skill`; OpenNeko supplies `DSH_BUNDLED_SKILL_DIR` without implementing another registry.

## Canonical contract

| Surface                  | Locked DSH behavior                                                                                      | OpenNeko requirement                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Registry                 | `ctx.skills` merges host and scoped provider layers; nearest scope wins                                  | Every session consumer passes the exact Agent scope                                |
| Layout                   | `<root>/<name>/SKILL.md` and `<root>/<name>.md`; one discovery level                                     | Both layouts remain valid; nested discovery is not claimed                         |
| Required frontmatter     | `name`, `description`                                                                                    | Preserve DSH parsing and kebab-case name validation                                |
| Optional frontmatter     | `whenToUse`, `metadata`, `disable-model-invocation`, `user-invocable`                                    | Preserve fields without inventing OpenNeko invocation metadata                     |
| Project sources          | rank 100 `project-dsh`, rank 200 `project-agents`                                                        | Lookup cwd must resolve the exact authorized project root                          |
| Other filesystem sources | rank 300 `custom`, 400 `user-dsh`, 500 `user-agents`                                                     | Do not mirror them into bundled or choose a source locally                         |
| Bundled source           | DSH bundled rank 600                                                                                     | Product supplies the audited read-only root only                                   |
| Invocation policy        | model/user booleans are independent; all four combinations are valid                                     | Each consumer filters only for its own interface                                   |
| Model catalog            | only name and capped description are rendered                                                            | Routing claims live in description; `whenToUse` is not advertised as model routing |
| Model loading            | model can call the `skill` tool repeatedly and is told to load all applicable Skills                     | No single-primary or Skill-count restriction                                       |
| Explicit loading         | whitespace-bounded `/name` tokens can inject multiple user-invocable Skills; duplicate name injects once | `$` presentation may map multiple validated selections to the one DSH-native input |
| Resources                | loaded body includes `resourceBase` guidance; resources are not enumerated, fetched or attached          | Read only referenced resources through currently authorized Tools                  |
| Body size                | no upstream body cap                                                                                     | Measure context cost; do not turn it into a format rejection                       |
| Authority                | Skill body is trusted instruction text but does not grant Tool visibility or permission                  | Tool schema, sandbox, approval and Host authorization remain authoritative         |

## Baseline gaps and disposition

| Baseline gap                             | Disposition                                                                                                                                | Current evidence                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Global virtual cwd for every DSH Session | Resolved: create/load/resume use exact Conversation-authorized cwd; the virtual cwd remains only for the explicitly global management view | Desktop/runtime producer-consumer tests and `readSkillCatalog` session branch |
| Unscoped Session catalog reads           | Resolved: Session lookup uses exact Agent scope and its header cwd                                                                         | Bridge scoped lookup and client tests                                         |
| Single explicit Skill request            | Resolved with one ordered multi-invocation contract                                                                                        | Contracts/runtime/Desktop/Webview tests                                       |
| Incomplete invocation-policy projection  | Resolved; model/user flags remain independent                                                                                              | Provider and management projection tests                                      |
| No bundled resource fixture              | Resolved with actual builtin `content-authoring` resources plus directory/flat fixtures                                                    | DSH filesystem provider contract tests                                        |
| Blanket public Tool prose restriction    | Resolved by restricting authority bypass and private protocols, not public guidance                                                        | `AGENTS.md`, Accepted ADRs and extension-surface poison tests                 |

## Non-DSH product boundaries retained

- Renderer receives no Skill body, physical path or directory resource base.
- Workspace lookup is sender-bound and authorized by Desktop Main.
- Skill text cannot grant Tool visibility, sandbox elevation, approval, credentials or Host access.
- Third-party executable Plugin/Webview loading remains outside this change.
- General payload and context budgets remain valid resource protections; they cannot become Skill-count rules.
