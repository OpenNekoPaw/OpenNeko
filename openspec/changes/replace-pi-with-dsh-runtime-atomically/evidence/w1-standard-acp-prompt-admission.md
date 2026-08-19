# W1 Standard ACP Prompt Admission

## Boundary And Limits

The official DSH bridge owns only admission at its standard ACP Prompt request boundary; DSH continues to
own Agent/provider scheduling after an admitted request calls the exact Agent. Admission uses fixed limits:

- at most two active Prompts across Sessions;
- at most thirty-two queued Prompts across the connection;
- exactly one active or queued Prompt per Session;
- strict FIFO admission between queued Sessions.

`prompt`, `cancel`, `closeSession` and connection quiescence share the same admission owner. A queued cancel
or close rejects only that Session's Promise without invoking `Agent.followup`. Disconnect rejects all
queued Prompts and prevents later admission; active Prompts continue through the existing exact DSH Agent
cancel/drain path during quiescence.

## Deterministic Evidence

- Two Sessions start, later Sessions queue, and completions admit queued Sessions in FIFO order.
- Duplicate active/queued Session Prompt and the thirty-third queued request fail visibly.
- A queued cancel never invokes the queued operation and does not affect active siblings.
- Disconnect rejects every queued Prompt and no queued operation starts after active work settles.
- A bridge source-wiring poison asserts the single admission owner is used by prompt/cancel/close/quiesce.
- A standalone Q0 profile drives four standard ACP Prompts through stdio and the real DSH Agent loop using
  a Q0-only public `LlmAdapter`. External release observations prove exactly two active requests, FIFO queued
  admission, and that an exact queued cancellation never enters the adapter.

```text
pnpm --dir packages/dsh-bridge typecheck
PASS

pnpm --dir packages/dsh-bridge test
PASS: 2 files / 14 tests

pnpm --dir scripts/dsh-q0 qualify
PASS: standardPromptConcurrentAdmission=true, standardPromptFifoAdmission=true,
standardPromptQueuedCancellation=true, providerContacted=false
```

This closes task 1.8's provider-free standard Prompt wire qualification. The deterministic Q0 adapter is not
real provider behavior evidence. Real provider/API and visible UI validation remain unexecuted and
release-blocking.
