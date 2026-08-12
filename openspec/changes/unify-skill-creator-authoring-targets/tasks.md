## 1. Remove the special Skill path

- [x] 1.1 Remove `skill-package`, `skill-authoring` binding/receipt parsing and Skill-specific mutation metadata from Agent contracts and runtime.
- [x] 1.2 Remove Skill Creator target metadata, target-required catalog projection and the Webview destination selector/chip while preserving ordinary Skill invocation.
- [x] 1.3 Delete tests and Evaluation cases that require the removed pre-turn destination path; add poison coverage proving it cannot return.

## 2. Keep one generic creation capability

- [x] 2.1 Refactor the capability provider to generic `CreateSkill`, remove destination arguments and bind its immutable source/root at runtime composition.
- [x] 2.2 Reuse canonical portable Skill contracts, SkillHost validation and path layout while retaining staging, containment, duplicate and atomic-publish tests.
- [x] 2.3 Bind Assistant to personal Skills and each Workspace runtime to its own Workspace Skills without active/recent/argument fallback.

## 3. Evaluation and quality

- [x] 3.1 Update focused Agent Evaluation evidence for ordinary Skill invocation, generic Tool availability and the removed target-required path.
- [x] 3.2 Run contract, runtime, Webview, Desktop typecheck/build, key-free Agent Evaluation, OpenSpec, architecture and diff gates.
- [x] 3.3 Execute focused Desktop UI validation proving `$skill-creator <prompt>` follows the ordinary Skill path with no destination selector or navigation change; record any authoritative runtime blocker.
