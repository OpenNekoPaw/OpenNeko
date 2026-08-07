# Agent Evaluation: Workspace Board delivery

The current Agent behavior case starts in Electron Desktop, completes a creator-visible typed artifact
batch, persists one stable delivery identity, projects it through the Desktop-owned Canvas writer and
reaches terminal idle. Required facts include workspace/target identity, exact writer claim, source
content fingerprint, resulting node/connection identities, terminal state and zero retired-path counters.

The Evaluation must not use TUI, VS Code, direct `.nkc` mutation, active-editor target inference, mock
delivery or browser-only rendering. If a real provider is not required to reproduce the delivery
lifecycle, deterministic synthetic artifacts may drive the owning Desktop fixture; that evidence proves
delivery behavior, not provider quality.
