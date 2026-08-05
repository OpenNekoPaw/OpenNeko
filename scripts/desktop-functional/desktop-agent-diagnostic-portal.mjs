import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openFixtureWorkspace } from './desktop-operations.mjs';

export const desktopAgentDiagnosticPortalScenario = Object.freeze({
  id: 'desktop-agent-diagnostic-portal',
  owner: '@neko/agent-webview',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    const configRoot = join(fixtureHome, '.neko');
    await Promise.all([
      mkdir(workspacePath, { recursive: true }),
      mkdir(configRoot, { recursive: true }),
    ]);
    await writeFile(
      join(configRoot, 'config.toml'),
      [
        'default_provider = "functional-unreachable"',
        'default_model = "functional-unreachable:functional-chat"',
        '',
        '[[providers]]',
        'id = "functional-unreachable"',
        'name = "Functional Unreachable"',
        'type = "ollama"',
        'base_url = "http://127.0.0.1:1"',
        'enabled = true',
        'connection_kind = "local"',
        'protocol_profile = "ollama"',
        'requires_api_key = false',
        '',
        '[[models]]',
        'id = "functional-chat"',
        'name = "Functional Chat"',
        'provider_id = "functional-unreachable"',
        'type = "llm"',
        'capabilities = ["chat"]',
        'enabled = true',
        '',
      ].join('\n'),
      { encoding: 'utf8', mode: 0o600 },
    );
    return { workspacePath };
  },
  async run({ checkpoint, click, evaluate, screenshot, type, waitForSelector }) {
    await evaluate(`(() => {
      window.resizeTo(1200, 800);
      return { width: window.innerWidth, height: window.innerHeight };
    })()`);
    await waitForSelector('.desktop-scene-workbench--agent-only .agent-composer-textarea');
    await openFixtureWorkspace(evaluate);
    await waitForSelector('.desktop-scene-workbench--workspace');
    await waitForSelector('[data-dock-owner="agent"] .agent-composer-textarea');
    await waitForSelector('[data-dock-owner="resources"]');

    await type('.agent-composer-textarea', 'Trigger the deterministic fixture provider failure.');
    await waitForEnabledSend(evaluate);
    await click('.agent-composer-send');
    await waitForSelector('[data-agent-diagnostic-toast="true"]');
    await waitForDiagnosticAnimation(evaluate);

    const diagnostic = await evaluate(`(() => {
      const alert = document.querySelector('[data-agent-diagnostic-toast="true"]');
      const agentDock = document.querySelector('[data-dock-owner="agent"]');
      const resources = document.querySelector('[data-dock-owner="resources"]');
      if (!(alert instanceof HTMLElement)) throw new Error('Agent diagnostic alert is missing.');
      if (!(agentDock instanceof HTMLElement) || !(resources instanceof HTMLElement)) {
        throw new Error('Diagnostic fixture Workbench panes are missing.');
      }
      const alertRect = alert.getBoundingClientRect();
      const agentDockRect = agentDock.getBoundingClientRect();
      const style = getComputedStyle(alert);
      const hit = document.elementFromPoint(
        alertRect.left + alertRect.width / 2,
        alertRect.top + alertRect.height / 2,
      );
      return {
        parentIsBody: alert.parentElement === document.body,
        insideAgentRoot: Boolean(alert.closest('[data-owner-root="agent"]')),
        viewportWidth: window.innerWidth,
        alertRect: {
          left: alertRect.left,
          right: alertRect.right,
          top: alertRect.top,
          bottom: alertRect.bottom,
          width: alertRect.width,
        },
        agentDockRight: agentDockRect.right,
        extendsPastAgentDock: alertRect.right > agentDockRect.right,
        hitIsAlert: hit === alert || alert.contains(hit),
        position: style.position,
        zIndex: style.zIndex,
        text: alert.textContent?.trim() ?? '',
        resourceDockVisible: resources.getBoundingClientRect().width > 0,
      };
    })()`);
    checkpoint('agent-diagnostic-portal-visible', diagnostic);
    const screenshotArtifact = await screenshot('agent-diagnostic-portal-visible');
    return { diagnostic, screenshots: [screenshotArtifact] };
  },
  assertObservation(_observation, evidence) {
    const diagnostic = evidence.diagnostic;
    if (
      !diagnostic.parentIsBody ||
      diagnostic.insideAgentRoot ||
      diagnostic.alertRect.left < 0 ||
      diagnostic.alertRect.right > diagnostic.viewportWidth ||
      diagnostic.alertRect.width > 360 ||
      !diagnostic.extendsPastAgentDock ||
      !diagnostic.hitIsAlert ||
      diagnostic.position !== 'fixed' ||
      Number(diagnostic.zIndex) < 50 ||
      !diagnostic.text ||
      !diagnostic.resourceDockVisible
    ) {
      throw new Error(
        `Agent diagnostic did not escape Workbench clipping: ${JSON.stringify(diagnostic)}`,
      );
    }
  },
});

async function waitForEnabledSend(evaluate) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const enabled = await evaluate(`(() => {
      const send = document.querySelector('.agent-composer-send');
      return send instanceof HTMLButtonElement && !send.disabled;
    })()`);
    if (enabled) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Diagnostic fixture did not enable the Agent send control.');
}

async function waitForDiagnosticAnimation(evaluate) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const settled = await evaluate(`(() => {
      const alert = document.querySelector('[data-agent-diagnostic-toast="true"]');
      if (!(alert instanceof HTMLElement)) return false;
      const rect = alert.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= window.innerWidth;
    })()`);
    if (settled) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Agent diagnostic did not settle inside the viewport after its entry animation.');
}
