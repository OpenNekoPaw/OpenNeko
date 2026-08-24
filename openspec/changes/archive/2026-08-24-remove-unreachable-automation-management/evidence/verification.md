## Verification

- `pnpm exec openspec validate remove-unreachable-automation-management --strict`: passed.
- Automation contracts: typecheck passed; 3 files / 13 tests passed.
- Automation Node kernel: typecheck passed; 6 files / 36 tests passed.
- Removed three unused artifact-preparation CLI wrappers and their root scripts; retained release-input
  qualification remains explicit and passed with 4 files / 21 tests plus
  `pnpm check:automation-runtime-inputs`.
- Package role, product status, package-boundary, application-boundary and test-ownership gates passed,
  proving `@neko/automation-contracts` and `@neko/automation-node` are retained kernels and are not
  reachable from Desktop production entries.
- The shared retired-surface gate rejects restoration of Automation Webview, management contracts,
  Node management services and Desktop adapters.
- Key-free Agent Evaluation dry-run passed for 26 suites / 69 cases. Real provider evaluation is
  excluded because no product Automation path is added or changed; the change only deletes unreachable
  presentation/management code.

## Blocked aggregate checks

- `pnpm check:unused` no longer reports the removed Automation Webview, management services or artifact
  preparation wrappers. It remains red on unrelated existing files, dependencies and exports.
- The legacy and internal-versioning aggregate gates remain red on unrelated concurrent DSH image and
  broader dirty-worktree findings; the focused retired-surface and package gates are green.

## Residual risk

Browser/Computer Automation has no Desktop product entry after this cleanup. Reintroduction requires a
new OpenSpec defining the reachable workflow, exact sender-bound trust adapter and real provider/UI
evaluation. The retained kernel still uses provider `extensionId` identities; renaming that exact
authorization identity is intentionally outside this deletion change.
