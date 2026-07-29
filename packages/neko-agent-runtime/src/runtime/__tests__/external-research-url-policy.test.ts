import { describe, expect, it } from 'vitest';
import { validateExternalResearchUrl } from '../capability/external-research-url-policy';

describe('validateExternalResearchUrl', () => {
  it.each([
    'notaurl',
    'file:///tmp/a.txt',
    'data:text/plain,hello',
    'blob:https://example.com/id',
    'vscode-webview://panel/id',
    'javascript:alert(1)',
  ])('rejects unsupported or non-public URL %s', (url) => {
    expect(validateExternalResearchUrl({ url }).ok).toBe(false);
  });

  it.each([
    'http://localhost:3000',
    'http://app.localhost',
    'http://127.0.0.1',
    'http://10.0.0.2',
    'http://172.16.0.1',
    'http://192.168.1.4',
    'http://169.254.1.1',
    'http://100.64.0.1',
    'http://[::1]/',
  ])('rejects local, private, or link-local URL %s', (url) => {
    expect(validateExternalResearchUrl({ url }).ok).toBe(false);
  });

  it('enforces blocked domain policy', () => {
    expect(
      validateExternalResearchUrl({
        url: 'https://docs.example.com/page',
        blockedDomains: ['*.example.com'],
      }),
    ).toEqual({
      ok: false,
      domain: 'docs.example.com',
      reason: 'URL domain is blocked: docs.example.com',
    });
  });

  it('enforces allowed domain policy', () => {
    expect(
      validateExternalResearchUrl({
        url: 'https://docs.example.com/page',
        allowedDomains: ['docs.example.com'],
      }),
    ).toEqual(
      expect.objectContaining({
        ok: true,
        domain: 'docs.example.com',
      }),
    );
    expect(
      validateExternalResearchUrl({
        url: 'https://other.example.com/page',
        allowedDomains: ['docs.example.com'],
      }),
    ).toEqual({
      ok: false,
      domain: 'other.example.com',
      reason: 'URL domain is not allowed: other.example.com',
    });
  });
});
