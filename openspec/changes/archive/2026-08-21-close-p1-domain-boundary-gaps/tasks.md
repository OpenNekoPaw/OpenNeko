## 1. Project Search fail-visible coordination

- [x] 1.1 Require complete Search runtime ports and remove production/test construction through silent defaults.
- [x] 1.2 Reject duplicate partition and semantic-provider identities without replacing or disposing the canonical registration.
- [x] 1.3 Make initialization, refresh and query partition failures produce exact diagnostics and prevent false initialized/fresh state.
- [x] 1.4 Add Search producer/consumer tests proving missing ports, duplicate registrations and failed partitions cannot return success.

## 2. Canvas-owned media contract

- [x] 2.1 Add the Canvas media request/response contract, supported-kind catalog and strict codecs to `@neko/canvas-domain` with contract tests.
- [x] 2.2 Migrate Canvas Webview and every Desktop producer/consumer to the Canvas public contract in one atomic boundary.
- [x] 2.3 Replace arbitrary Canvas Webview message delegation with explicit media cases and fail-closed unknown-message tests.
- [x] 2.4 Delete the Desktop-owned media declarations/codecs and add path-level proof that no production import or successful old path remains.

## 3. Cut application ownership

- [x] 3.1 Add a host-neutral Cut draft application service covering label/identity planning, session-to-presentation transaction ordering and rollback.
- [x] 3.2 Move Canvas handoff target types, codec, equality and exact target policy into the Cut application owner with unit tests.
- [x] 3.3 Rewire `DesktopCutRuntime` as authorization, absolute-path/session and shell-presentation adapters to the Cut application service.
- [x] 3.4 Delete app-owned draft/handoff policy helpers and add Desktop delegation tests proving the Cut owner is the only successful path.

## 4. Verification and completion

- [x] 4.1 Run focused Search, Canvas domain/Webview, Cut domain/Node and Desktop tests plus affected package typechecks.
- [x] 4.2 Run `pnpm check:package-roles`, `pnpm check:application-boundaries`, `pnpm check:package-boundaries`, `pnpm check:webview-boundaries`, `pnpm check:deps`, `pnpm check:legacy-debt` and `git diff --check`.
- [x] 4.3 Record canonical owner/producer/consumer/replaced-path evidence, actual commands, failures and residual risks in this change.
