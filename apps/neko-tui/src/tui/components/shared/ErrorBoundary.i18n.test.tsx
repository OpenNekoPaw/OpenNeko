import React from 'react';
import { render as renderInk } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import { AgentTerminalPresentationProvider } from '../../presentation/react-context';
import { createTestAgentTerminalPresentation } from '../../presentation/testing';
import { ErrorBoundary } from './ErrorBoundary';

function BrokenRegion(): React.JSX.Element {
  throw new Error('Renderer detail 原文');
}

describe('ErrorBoundary localization', () => {
  it('localizes owned recovery chrome while preserving the component label and error detail', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const view = renderInk(
        <AgentTerminalPresentationProvider value={createTestAgentTerminalPresentation('zh-cn')}>
          <ErrorBoundary label="VendorPanel">
            <BrokenRegion />
          </ErrorBoundary>
        </AgentTerminalPresentationProvider>,
      );

      expect(view.lastFrame()).toContain('VendorPanel 已崩溃');
      expect(view.lastFrame()).toContain('Renderer detail 原文');
      expect(view.lastFrame()).toContain('按 Ctrl+L 重置，或按 Ctrl+C 退出。');
      view.unmount();
    } finally {
      consoleError.mockRestore();
    }
  });
});
