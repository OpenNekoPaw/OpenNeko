## Context

DSH filesystem provider 公开发现/加载能力，但 rc.8 不导出独立的 `parseSkillFile` API。直接在 OpenNeko 重写 YAML/frontmatter parser 会产生第二个格式 authority。设计采用隔离 provider scope：Host 先把候选包写入受控 staging root，bridge 在不可被 Agent catalog 观察的短生命周期 scope 中挂载锁定的 DSH filesystem provider并执行 snapshot/get，只有原生定义成功加载后才允许 Host 发布。

## Decisions

### 1. Skill Creator 与 CreateSkill Tool 解耦

`skill-creator` 与其他 Skills 一样通过 DSH 发现和加载。任何 eligible Agent turn 都可在 Tool catalog 可见且获得审批时调用 `CreateSkill`。runtime 不按 Skill 名称、source 或正文决定 Tool 可见性。

### 2. Conversation authority 固定目标

- Assistant → configured DSH personal root。
- Workspace Conversation → exact Workspace `.agents/skills` root；现有 `.dsh/skills` 仍由 DSH 原生发现，产品默认写入不构成对另一 layout 的禁用。
- Tool 参数不包含 root、Workspace id、绝对路径或 destination kind。

目标在 Desktop Main 从 exact sender-bound Conversation binding 解析。没有绑定、失效绑定或不可写 root 返回明确 diagnostic，不回退 active/recent Workspace 或 personal root。

### 3. Authoring contract 表达 DSH 文件，而非 OpenNeko schema

请求包含选定 DSH layout、主 Markdown 内容和零个或多个 UTF-8 相对资源。主内容必须包含 DSH frontmatter；Host 不发明 `allowedTools`、artifact profile 或 OpenNeko invocation overlay。

两种上游 layout 均可表达：

- directory bundle：`<name>/SKILL.md` 加相对资源；
- flat file：`<name>.md`；相对资源以其 Skill root 为基准并与其他 flat entries 共享目录，发布时逐项执行 collision-safe no-replace。

前端默认 directory bundle 只是 authoring UX，不改变 filesystem provider 对 flat Skills 的支持。

### 4. DSH provider 在隔离 scope 中验证 staged bytes

```text
CreateSkill Tool call
  -> exact Conversation target + approval
  -> Desktop stages bytes in a hidden sibling on the same authorized filesystem
  -> private bridge validation request
  -> short-lived isolated Cordis scope
  -> locked dsh-skill-filesystem snapshot/get
  -> Host verifies requested package identity
  -> atomic no-replace publish
  -> provider invalidation/watch
  -> exact DSH catalog observation
```

Staging provider 使用唯一 provider identity，`includeDefaultRoots: false`，只观察本次 staging root；scope 对普通 Agent 和管理 UI 不可见。解析失败、definition name 不匹配、目录不完整或 provider exception 都禁止发布。bridge 只返回规范化结果/诊断，不返回 staged path。

### 5. 非破坏性和 fail-local

所有资源路径必须为安全相对路径，不得绝对、父级穿越、重复、覆盖主文件或包含 symlink。目标存在时 no-replace 失败；不合并、不覆盖、不自动重命名。directory bundle 作为一个目录发布；flat Skill 的主文件和共享-root资源必须先证明所有目标均不存在，再以可恢复提交保护部分失败。失败后 staging 可安全清理，目标和 sibling Skills 不变。这是写入原子性的实现差异，不改变 DSH 对 flat resource base 的读取能力。

成功的定义只有在 DSH scoped catalog 重新观察到正确 source/provider 后才报告 ready；catalog 暂时不完整则返回 `created-pending-discovery`，不能伪造 injected/ready。该状态是本次操作结果，不是第二 catalog。

## Five-layer analysis

- 职责：Agent application service 编排创建；DSH provider验证格式；Desktop Host授权并写文件；DSH registry发现。
- 依赖：DSH provider只进入 bridge，DSH Tool API只进入独立 contribution；contracts保持 L0；Desktop writer不解析 Skill语义。
- 接口：一个 version-free Tool contract、一个私有 staged-validation bridge operation、一个 Host filesystem port。
- 扩展：新增 DSH frontmatter字段由上游 parser自然接受；产品无需同步 schema。
- 测试：staging/atomicity确定性测试、DSH discovery路径测试和真实 provider Skill Creator Evaluation。

## Ownership evidence

| Boundary                          | Owner                    | Producer                       | Consumer                           | Runtime                      | User-data rule                                 |
| --------------------------------- | ------------------------ | ------------------------------ | ---------------------------------- | ---------------------------- | ---------------------------------------------- |
| CreateSkill contract              | `@neko/agent-contracts`  | DSH contribution               | Agent Host adapter                 | L0                           | 不包含路径、Workspace 或目标参数               |
| Authoring transaction             | `@neko/agent-runtime`    | Host Tool adapter              | Desktop trust adapter              | host-neutral L1              | 失败与 cleanup failure 均可见                  |
| Tool registration and approval    | `@neko/agent-dsh-plugin` | DSH Tool catalog               | 普通 DSH turn                      | DSH child process            | mutation 必须进入 DSH 原生审批                 |
| Format validation and observation | `@neko/dsh-bridge`       | locked DSH filesystem provider | authoring application service      | DSH child process            | 不写 Workspace，不建立第二 registry            |
| Filesystem authority              | `apps/neko-desktop`      | exact Conversation grant       | authorized personal/Workspace root | Electron Main trust boundary | no-replace；失败不修改已有目标或 sibling Skill |

Desktop 模块只实现 sender/Conversation/path 授权和 concrete filesystem transaction；Skill 格式、创建编排与 Tool lifecycle 分别由 DSH provider、Agent runtime 与 DSH contribution 拥有，因此没有可进一步下沉到应用根的领域策略。

## Risks / Trade-offs

- 隔离 provider validation 增加一次 bridge 往返。它只发生在用户批准的创建操作中，不进入普通 turn。
- 上游 provider 若缺少可安全隔离的公开挂载接口，实施必须标记为 upstream-blocked并推动公开 parser/validator；不得临时复制 parser。
- `~/.agents` 与 product DSH personal root 可能都存在同名 Skill。胜出项完全按 DSH rank/source决定，创建结果必须报告实际 winner，不能保证新项胜出。

## Migration Plan

1. 删除/更新所有依赖已不存在 Pi `CreateSkill` 的文档、fixture 和 Evaluation 假设。
2. 冻结 Tool contract 与 Conversation target resolver。
3. 实现 staging writer 和隔离 DSH provider validator。
4. 通过独立 `@neko/agent-dsh-plugin` 注册唯一 first-party CreateSkill Tool contribution，并接通 approval、publish 与 scoped observation。
5. 更新 builtin `skill-creator` 方法和真实 Evaluation。

不恢复 Pi SkillHost，不保留旧 `PortableSkillDefinition` 兼容 adapter。发布前可整体撤销；发布后失败只修复 DSH-native path。
