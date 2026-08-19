- [x] 1. Remove the eight retired Pi document/image scenarios from active suite indexes and
      mark the now-empty media-library target as deterministically excluded.
- [x] 2. Add a deterministic scan test for retired document tool names in active suite JSON.
- [x] 3. Preserve the synthetic document fixture for the future DSH-native provider/UI slice.
- [x] 4. Run Agent Evaluation dry-run, focused catalog tests, strict OpenSpec validation, and
      repository diff checks. Evidence: `pnpm test:agent:eval` passed 45 files / 307 tests,
      26 suites / 72 cases; focused Content and Host tests passed; `pnpm check:agent-boundaries`,
      strict OpenSpec validation, and `git diff --check` passed.
