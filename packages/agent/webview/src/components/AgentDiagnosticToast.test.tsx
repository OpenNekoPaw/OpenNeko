import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AgentDiagnosticToast } from './AgentDiagnosticToast';

describe('AgentDiagnosticToast', () => {
  it('portals the complete viewport-bounded alert outside a clipped package surface', () => {
    const clippedSurface = document.createElement('div');
    clippedSurface.style.overflow = 'hidden';
    document.body.append(clippedSurface);

    const result = render(
      <AgentDiagnosticToast title="Global error">
        Desktop Agent diagnostic content that must remain visible.
      </AgentDiagnosticToast>,
      { container: clippedSurface },
    );

    const alert = screen.getByRole('alert');
    expect(alert.parentElement).toBe(document.body);
    expect(alert.className).toContain('w-[360px]');
    expect(alert.className).toContain('max-w-[calc(100vw-2rem)]');
    expect(alert.className).toContain('break-words');

    result.unmount();
    clippedSurface.remove();
  });
});
