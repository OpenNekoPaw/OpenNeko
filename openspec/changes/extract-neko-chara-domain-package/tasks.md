## 1. Contracts and package skeleton

- [x] 1.1 Add `@neko/chara` package manifest with explicit public entries, strict TypeScript config and Vitest config
- [x] 1.2 Add package architecture tests for core/application/host-vscode dependency direction
- [x] 1.3 Add workspace, dependency-cruiser, Knip and strict package-check integration

## 2. Move host-neutral Character ownership

- [x] 2.1 Move Character policy, prompt, session, evidence and Embody session from Entity to Chara core
- [x] 2.2 Move Character Dialogue runtime and purpose-model operations to Chara application
- [x] 2.3 Move NPC profile assembly to Chara and update Entity exports
- [x] 2.4 Move focused Entity Character tests to Chara and prove old Entity files/exports are absent

## 3. Move VS Code Character ownership

- [x] 3.1 Move Character Dialogue and Embody controllers into Chara host-vscode
- [x] 3.2 Move VS Code Character evidence loader and roleplay candidate selection into Chara host-vscode
- [x] 3.3 Move controller/evidence tests and provide package-owned VS Code test doubles
- [x] 3.4 Update Agent ChatProvider/router/slash/search composition to import only Chara public entries
- [x] 3.5 Delete old Agent controller/evidence files without compatibility exports

## 4. Architecture and documentation

- [x] 4.1 Update Agent architecture guards to require Character implementation under `packages/neko-chara`
- [x] 4.2 Update package boundaries and Character/World docs from proposed package to first-stage implemented owner
- [x] 4.3 Document deferred shared DTO and Webview package migration without adding parallel paths

## 5. Evaluation and verification

- [x] 5.1 Record the `create` Evaluation disposition, canonical path, forbidden fallback and missing TUI CharacterRun input/observability
- [x] 5.2 Run Chara, Entity and Agent Extension focused tests plus affected typechecks/builds
- [x] 5.3 Run Agent boundary, dependency, unused, strict OpenSpec, link and diff checks
- [x] 5.4 Run `pnpm test:agent:eval` as key-free harness evidence and record real Character case as blocked unless a canonical TUI path exists
