## Risk classification

L2: the change adds durable local integration state and gates launch/handoff behavior, but does not
install, delete or modify external applications.

## Review findings

No blocking scoped finding was identified. Supported profiles remain immutable product catalog
entries, while bindings and enablement are owned by the package repository. Desktop only validates
sender identity and performs native application selection. Disabled bindings are rejected by launch,
resource action projection and handoff consumers.

## Verification

- Contracts: 8 tests and typecheck passed.
- Node service/repository: 8 tests and typecheck passed, including SQLite reopen and exact removal.
- Webview: 5 tests and typecheck passed, including add/disable/confirmed remove.
- Desktop Professional Application Host tests passed; Desktop typecheck passed.
- `check:application-boundaries`, strict OpenSpec validation and scoped ESLint passed.

Repository-wide gate and visible Desktop blockers are the same as recorded in the DSH lifecycle
quality/UI reports; none originates in the scoped Professional Application files.
