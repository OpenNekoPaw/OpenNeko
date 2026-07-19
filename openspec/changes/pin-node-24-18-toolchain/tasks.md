## 1. Repository Toolchain Pin

- [x] 1.1 Add the root `.node-version` pin for Node 24.18.0
- [x] 1.2 Update every CI and Release setup-node step to consume the root pin
- [x] 1.3 Update Chinese and English source setup documentation

## 2. Local Runtime Switch

- [x] 2.1 Verify the Homebrew node@24 formula resolves to 24.18.0
- [x] 2.2 Install and link node@24 as the local default
- [x] 2.3 Verify Node, Corepack, and pnpm versions

## 3. Validation

- [x] 3.1 Validate OpenSpec and workflow version consistency
- [x] 3.2 Run the local metadata runtime and SQLite contract checks
- [x] 3.3 Run build, test, check, and diff quality gates
- [x] 3.4 Record verification results and remaining risks
