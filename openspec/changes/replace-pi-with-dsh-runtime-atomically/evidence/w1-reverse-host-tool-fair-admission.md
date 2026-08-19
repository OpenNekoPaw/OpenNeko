# W1 Reverse Host Tool Fair Admission

## Owning Boundary

DSH remains authoritative for Agent turns, Tool selection and provider scheduling. OpenNeko owns only the
reverse Host Tool handler admission after an exact DSH Session/turn/call request crosses ACP. The
package-owned ACP application client now applies fixed, non-configurable admission limits at that boundary:

- at most two active reverse Host Tool calls across the connection;
- at most one active call per DSH Session;
- at most eight queued calls per Session;
- at most thirty-two Sessions with queued calls.

Ready Sessions are admitted round-robin. FIFO order is preserved inside each Session, so a single Session
cannot occupy both active slots or overtake a ready sibling. This is not another Agent or Tool scheduler: it
does not choose tools, reorder DSH calls inside a Session, infer provider priority or own durable Jobs.

## Fail-Local Semantics

- Duplicate complete Session/turn/call identity is rejected before a second handler invocation.
- A full per-Session queue rejects only the new exact call; another Session may still queue and later run.
- Cancelling a queued call removes only that identity and never invokes its domain handler.
- Cancelling an active call aborts its exact signal and immediately rejects its ACP completion; a late
  handler result cannot become success.
- Disconnect immediately makes every active/queued identity stale, rejects queued/active completions,
  aborts active handlers and prevents queued handlers from starting.

## Verification

```text
pnpm --dir packages/agent/runtime typecheck
PASS

pnpm --dir packages/agent/runtime exec vitest run \
  src/acp/dsh-acp-application-client.test.ts
PASS: 1 file / 12 tests

pnpm --dir packages/agent/runtime test
PASS: 47 files / 387 tests
```

This closes the reverse Host Tool fair-admission portion of tasks 1.8 and 4.13. Standard ACP prompt
cross-Session concurrency/backpressure still needs deterministic bridge/subprocess evidence; real provider
and visible UI validation remain unexecuted and release-blocking.
