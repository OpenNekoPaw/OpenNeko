import { createStrictTranslator } from '@neko/shared/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { readUserConfigDocumentResult, readWorkspaceConfigDocumentResult } = vi.hoisted(() => ({
  readUserConfigDocumentResult: vi.fn(),
  readWorkspaceConfigDocumentResult: vi.fn(),
}));

vi.mock('@neko/shared/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@neko/shared/i18n')>();
  return {
    ...actual,
    createStrictTranslator: vi.fn(actual.createStrictTranslator),
  };
});

vi.mock('@neko/shared/config/config-reader', () => ({
  getUserConfigPath: () => '/home/test/.neko/config.toml',
  readUserConfigDocumentResult,
  readWorkspaceConfigDocumentResult,
}));

import {
  createNodeTerminalInvocationContext,
  createNodeTerminalInvocationContextFromArgv,
  parseMacOSPreferredLanguage,
} from '../node-locale-bootstrap';

describe('createNodeTerminalInvocationContext', () => {
  beforeEach(() => {
    vi.mocked(createStrictTranslator).mockClear();
    readUserConfigDocumentResult.mockReset();
    readWorkspaceConfigDocumentResult.mockReset();
    readUserConfigDocumentResult.mockReturnValue({
      status: 'ok',
      filePath: '/home/test/.neko/config.toml',
      document: { ui_locale: 'auto', prompt_locale: 'auto' },
    });
    readWorkspaceConfigDocumentResult.mockReturnValue({
      status: 'missing',
      filePath: '/work/.neko/config.toml',
    });
  });

  it('captures each config source once and creates one immutable resolved context', () => {
    const context = createNodeTerminalInvocationContext({
      workDir: '/work',
      cliUiLocale: 'zh-cn',
      environment: { NEKO_PROMPT_LOCALE: 'auto' },
      intlLocale: 'en-US',
      platform: 'linux',
      timeZone: 'UTC',
    });

    expect(context.uiLocale).toBe('zh-cn');
    expect(context.promptLocale).toBe('zh-cn');
    expect(context.presentation.uiLocale).toBe('zh-cn');
    expect(context.userConfigPath).toBe('/home/test/.neko/config.toml');
    expect(Object.isFrozen(context)).toBe(true);
    expect(readUserConfigDocumentResult).toHaveBeenCalledTimes(1);
    expect(readWorkspaceConfigDocumentResult).toHaveBeenCalledTimes(1);
    expect(createStrictTranslator).toHaveBeenCalledTimes(1);
  });

  it('follows the macOS preferred language once per invocation when Locale config is absent', () => {
    readUserConfigDocumentResult.mockReturnValue({
      status: 'ok',
      filePath: '/home/test/.neko/config.toml',
      document: {},
    });
    let systemLocaleReads = 0;
    const context = createNodeTerminalInvocationContext({
      workDir: '/work',
      environment: { LC_ALL: 'C.UTF-8', LANG: 'en_AU.UTF-8' },
      intlLocale: 'en-US',
      platform: 'darwin',
      systemLocaleReader: () => {
        systemLocaleReads += 1;
        return 'zh-Hans-CN';
      },
      timeZone: 'UTC',
    });

    expect(context.uiLocale).toBe('zh-cn');
    expect(context.promptLocale).toBe('zh-cn');
    expect(context.presentation.uiLocale).toBe('zh-cn');
    expect(systemLocaleReads).toBe(1);

    expect(
      context.presentation.t('agent.terminal.startup.model', { modelId: 'gpt-test' }),
    ).toContain('模型');
    expect(systemLocaleReads).toBe(1);
  });

  it('parses only the first macOS preferred language', () => {
    expect(parseMacOSPreferredLanguage('(\n    "zh-Hans-CN",\n    "en-CN"\n)')).toBe('zh-Hans-CN');
    expect(parseMacOSPreferredLanguage('en_US')).toBe('en_US');
    expect(parseMacOSPreferredLanguage('')).toBeUndefined();
  });

  it('uses English when the macOS system-language reader is unavailable', () => {
    let systemLocaleReads = 0;
    const context = createNodeTerminalInvocationContext({
      workDir: '/work',
      environment: { LC_ALL: 'zh_CN.UTF-8' },
      intlLocale: 'zh-CN',
      platform: 'darwin',
      systemLocaleReader: () => {
        systemLocaleReads += 1;
        throw new Error('defaults unavailable');
      },
      timeZone: 'UTC',
    });

    expect(context.uiLocale).toBe('en');
    expect(context.promptLocale).toBe('en');
    expect(systemLocaleReads).toBe(1);
  });

  it('uses English when the first macOS preferred language is unsupported', () => {
    const context = createNodeTerminalInvocationContext({
      workDir: '/work',
      environment: { LC_ALL: 'zh_CN.UTF-8' },
      intlLocale: 'zh-CN',
      platform: 'darwin',
      systemLocaleReader: () => 'ja-JP',
      timeZone: 'UTC',
    });

    expect(context.uiLocale).toBe('en');
    expect(context.promptLocale).toBe('en');
  });

  it('discards source readers after composition and keeps later rendering on the captured context', () => {
    let uiEnvironmentReads = 0;
    let promptEnvironmentReads = 0;
    let hostLocaleReads = 0;
    const environment = Object.defineProperties(
      {},
      {
        NEKO_UI_LOCALE: {
          enumerable: true,
          get: () => {
            uiEnvironmentReads += 1;
            return 'auto';
          },
        },
        NEKO_PROMPT_LOCALE: {
          enumerable: true,
          get: () => {
            promptEnvironmentReads += 1;
            return 'auto';
          },
        },
        LC_ALL: {
          enumerable: true,
          get: () => {
            hostLocaleReads += 1;
            return 'zh_CN.UTF-8';
          },
        },
      },
    ) as Readonly<Record<string, string | undefined>>;

    const context = createNodeTerminalInvocationContext({
      workDir: '/work',
      environment,
      intlLocale: 'en-US',
      platform: 'linux',
      timeZone: 'UTC',
    });

    expect(context.uiLocale).toBe('zh-cn');
    expect(context.promptLocale).toBe('zh-cn');
    expect(uiEnvironmentReads).toBe(1);
    expect(promptEnvironmentReads).toBe(1);
    expect(hostLocaleReads).toBe(1);

    readUserConfigDocumentResult.mockImplementation(() => {
      throw new Error('user config was re-read after terminal composition');
    });
    readWorkspaceConfigDocumentResult.mockImplementation(() => {
      throw new Error('workspace config was re-read after terminal composition');
    });

    expect(context.presentation.t('agent.terminal.startup.help')).toContain('/help');
    expect(context.presentation.t('agent.terminal.startup.help')).toContain('/help');
    expect(uiEnvironmentReads).toBe(1);
    expect(promptEnvironmentReads).toBe(1);
    expect(hostLocaleReads).toBe(1);
    expect(createStrictTranslator).toHaveBeenCalledTimes(1);
  });

  it('localizes bootstrap diagnostics with one failure-path presentation context', () => {
    expect(() =>
      createNodeTerminalInvocationContext({
        workDir: '/work',
        cliUiLocale: 'zh-cn',
        cliPromptLocale: 'invalid',
        environment: {},
        platform: 'linux',
        timeZone: 'UTC',
      }),
    ).toThrow('--prompt-locale 的 Locale 值无效');
    expect(createStrictTranslator).toHaveBeenCalledTimes(1);
  });

  it('localizes config document failures from the captured host Locale', () => {
    readUserConfigDocumentResult.mockReturnValue({
      status: 'invalidToml',
      filePath: '/home/test/.neko/config.toml',
      diagnostic: {
        code: 'invalidToml',
        filePath: '/home/test/.neko/config.toml',
        message: 'raw parser detail',
      },
    });

    expect(() =>
      createNodeTerminalInvocationContext({
        workDir: '/work',
        environment: { LANG: 'zh_CN.UTF-8' },
        platform: 'linux',
        timeZone: 'UTC',
      }),
    ).toThrow('配置文件包含无效 TOML：/home/test/.neko/config.toml');
    expect(createStrictTranslator).toHaveBeenCalledTimes(1);
  });

  it('rejects workspace-owned Locale keys before exposing the TUI', () => {
    readWorkspaceConfigDocumentResult.mockReturnValue({
      status: 'ok',
      filePath: '/work/.neko/config.toml',
      document: { ui_locale: 'en' },
    });

    expect(() =>
      createNodeTerminalInvocationContext({
        workDir: '/work',
        environment: { LANG: 'zh_CN.UTF-8' },
        platform: 'linux',
        timeZone: 'UTC',
      }),
    ).toThrow('工作区配置不得定义 ui_locale');
  });

  it('resolves Commander presentation from canonical raw argv before parsing', () => {
    const context = createNodeTerminalInvocationContextFromArgv(
      [
        'node',
        'neko',
        'config',
        'show',
        '--ui-locale=zh-cn',
        '--prompt-locale',
        'auto',
        '-C',
        '/argv-work',
      ],
      {
        environment: {},
        intlLocale: 'en-US',
        platform: 'linux',
        timeZone: 'UTC',
        defaultWorkDir: '/default',
      },
    );

    expect(context.uiLocale).toBe('zh-cn');
    expect(context.promptLocale).toBe('zh-cn');
    expect(context.presentation.uiLocale).toBe('zh-cn');
    expect(readWorkspaceConfigDocumentResult).toHaveBeenCalledWith('/argv-work');
  });
});
