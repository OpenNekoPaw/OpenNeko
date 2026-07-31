## Evaluation Scope

- Change/feature: Agent Tool result/attachment 的稳定资源身份到 Desktop Webview 临时 HTTP
  `renderUri` 投影，以及该投影不得回流 Pi、provider 或后续 Tool 文件参数。
- Decision and owning suite: `update` `agent-runtime.stream-delivery`。该 suite 已拥有 Pi Tool
  result、shared Timeline projection、conversation projection store 与终态 Webview delivery；
  不新增第二个 Agent/resource suite。
- Why real Evaluation is required: 生产变更会触及 Desktop Agent event/display projection。最终
  DOM 播放只能由真实 Electron 功能场景验收，但 provider-backed case 仍需证明真实 Tool result
  的稳定 identity 未被临时 URL 替换，并且 legacy event projector 未参与。
- Canonical path: Desktop Agent input queue → Pi Tool result → shared Timeline/conversation
  projection → message resource display projector → Desktop HTTP resource gateway → package-owned
  Agent audio/video card。
- Forbidden fallback: `file:`、`neko-media:`、absolute-path-only attachment、recent resource
  fallback、provider fetching loopback URL、direct Pi conversation mutation 和 legacy Agent event
  projector。

## Cases

- Update/create one focused regression case inside `agent-runtime.stream-delivery` using an isolated
  synthetic workspace media attachment. The positive case SHALL observe the stable Tool result
  resource, completed Timeline projection, redacted `http-loopback` display projection fact and
  terminal idle state.
- Add one boundary/failure case only if the existing scenario contract can express a denied display
  projection without weakening strict schemas. It SHALL preserve the stable Tool diagnostic while
  proving that no `file:`, `neko-media:` or unrelated fallback URL is emitted.
- Deterministic producer/consumer tests remain authoritative for URL/token non-persistence,
  PathAccessPolicy, provider materialization, native media-card `src`, CORS and DOM/network details.
  A model final answer cannot prove those transport invariants.
- Minimal missing observability: the current runtime facts do not expose a redacted distinction
  between stable resource identity and ephemeral Desktop display transport. Implementation MAY add
  one neutral bounded fact containing projection kind/status and stable resource kind, but MUST NOT
  expose the URL, port, token, suite/case or pass/fail state.

## Verification

- Key-free validation: run `pnpm test:agent:eval` and the focused indexed case dry-run after updating
  the suite/coverage index.
- Real case: run the same focused case through the Desktop-owned complete-session driver when it
  exists, with report under gitignored `reports/agent-eval/`.
- Current infrastructure blocker: repository documentation states that Desktop does not yet expose
  a complete-session Evaluation driver. Until that exists, the provider-backed case MUST be recorded
  as `infrastructure-blocked`; key-free validation, direct turn injection or mock output is not
  acceptance.
- Real Electron media-card rendering, Range request and legacy-path poison evidence belongs to the
  isolated Desktop functional scenario, not to a Judge.

## Interpretation

- Passing deterministic and Electron tests proves transport correctness; passing the real Agent case
  proves the stable Tool/Timeline projection path survived the display change.
- No Judge, baseline or output-quality score applies. This is a deterministic identity, routing and
  no-fallback behavior.

## Residual Risk

- Until a Desktop complete-session driver is available, real provider-backed Agent projection
  evidence remains blocked even if all deterministic and Electron media scenarios pass.
- Agent Bash remains outside ordinary product capability. Any future change that grants or reroutes
  shell execution requires its own Tool/permission Evaluation decision rather than reusing this
  display case.
