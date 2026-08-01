import { canvasOpenNekoConsumerScenario } from '../../packages/neko-canvas-webview/functional/desktop-openneko-consumer.mjs';
import { cutOpenNekoConsumerScenario } from '../../packages/neko-cut-webview/functional/desktop-openneko-consumer.mjs';
import { previewOpenNekoConsumerScenario } from '../../packages/neko-preview-webview/functional/desktop-openneko-consumer.mjs';

const scenarios = new Map(
  [
    cutOpenNekoConsumerScenario,
    canvasOpenNekoConsumerScenario,
    previewOpenNekoConsumerScenario,
  ].map((scenario) => [scenario.id, scenario]),
);

export function resolveDesktopFunctionalScenarios(value) {
  if (value === 'all-openneko-consumers') return [...scenarios.values()];
  const scenario = scenarios.get(value);
  if (!scenario) {
    throw new Error(
      `Unknown Desktop functional scenario '${value}'. Expected ${[
        ...scenarios.keys(),
        'all-openneko-consumers',
      ].join(', ')}.`,
    );
  }
  return [scenario];
}
