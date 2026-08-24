import { describe, expect, it } from 'vitest';

import {
  createProfessionalApplicationHostRequest,
  parseProfessionalApplicationHostResult,
} from './host';

describe('professional application Host contract', () => {
  it('binds an update request and result to the exact Window', () => {
    const request = createProfessionalApplicationHostRequest({
      requestId: 'request-1',
      identity: { windowId: 'window-1' },
      route: 'binding.update',
      binding: {
        integrationId: 'comfyui',
        endpoint: 'http://127.0.0.1:8188',
        launchPreference: 'reuse-qualified',
      },
    });
    expect(
      parseProfessionalApplicationHostResult(
        {
          requestId: 'request-1',
          route: 'binding.update',
          projection: { identity: { windowId: 'window-1' }, items: [] },
        },
        request,
      ),
    ).toMatchObject({ route: 'binding.update' });
  });

  it('rejects a launch result without exact receipt evidence', () => {
    const request = createProfessionalApplicationHostRequest({
      requestId: 'request-1',
      identity: { windowId: 'window-1' },
      route: 'application.launch',
      integrationId: 'comfyui',
    });
    expect(() =>
      parseProfessionalApplicationHostResult(
        {
          requestId: 'request-1',
          route: 'application.launch',
          projection: { identity: { windowId: 'window-1' }, items: [] },
        },
        request,
      ),
    ).toThrow(/launch receipt/u);
  });

  it('requires selection evidence bound to the requested integration', () => {
    const request = createProfessionalApplicationHostRequest({
      requestId: 'request-2',
      identity: { windowId: 'window-1' },
      route: 'application.select',
      integrationId: 'comfyui',
    });
    expect(() =>
      parseProfessionalApplicationHostResult(
        {
          requestId: 'request-2',
          route: 'application.select',
          projection: { identity: { windowId: 'window-1' }, items: [] },
          selectionReceipt: { integrationId: 'another-app', status: 'selected' },
        },
        request,
      ),
    ).toThrow(/does not match/u);
  });
});
