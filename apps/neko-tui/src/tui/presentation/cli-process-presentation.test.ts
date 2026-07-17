import { describe, expect, it } from 'vitest';
import { createTestAgentTerminalPresentation } from './testing';
import {
  presentCliWorkDirDiagnostic,
  presentConfigLoadDiagnostic,
  presentConfigValidation,
} from './cli-process-presentation';

describe('CLI process presentation', () => {
  it('projects config-load codes without injecting the platform English message', () => {
    const presentation = createTestAgentTerminalPresentation('zh-cn');

    expect(
      presentConfigLoadDiagnostic(
        {
          code: 'platform-config-unavailable',
          configCode: 'invalidToml',
          filePath: '/external/项目/config.toml',
        },
        presentation,
      ),
    ).toBe('配置文件包含无效 TOML：/external/项目/config.toml。请修复后重启 Neko Agent。');
    expect(
      presentConfigLoadDiagnostic(
        { code: 'missing-provider-model', providerId: 'provider-原文' },
        presentation,
      ),
    ).toBe('未为提供方“provider-原文”配置模型。');
  });

  it('localizes typed working-directory diagnostics without changing paths or option names', () => {
    const diagnostic = {
      code: 'conflicting-options' as const,
      firstOption: '--cwd',
      firstPath: '/external/工作区-a',
      secondOption: '--work-dir',
      secondPath: '/external/工作区-b',
    };

    expect(presentCliWorkDirDiagnostic(diagnostic, createTestAgentTerminalPresentation('en'))).toBe(
      'Conflicting working directories: --cwd /external/工作区-a differs from --work-dir /external/工作区-b',
    );
    expect(
      presentCliWorkDirDiagnostic(diagnostic, createTestAgentTerminalPresentation('zh-cn')),
    ).toBe('工作目录冲突：--cwd /external/工作区-a 与 --work-dir /external/工作区-b 不一致');
  });

  it('projects typed config diagnostics in Chinese while preserving provider IDs and values', () => {
    expect(
      presentConfigValidation(
        [
          { code: 'missing-api-key', providerId: 'provider-原文' },
          { code: 'missing-model' },
          { code: 'invalid-temperature', value: 3 },
          { code: 'invalid-max-tokens', value: -1 },
          { code: 'invalid-output-format', value: 'xml-原文' },
        ],
        createTestAgentTerminalPresentation('zh-cn'),
        { includeApiKeyHint: false },
      ),
    ).toEqual([
      '配置错误：',
      '  • 未找到提供方“provider-原文”的 API 密钥。请使用 --api-key、对应提供方的环境变量或 ~/.neko/config.toml 进行配置。',
      '  • 必须指定模型。请使用 --model 或在 ~/.neko/config.toml 中配置。',
      '  • Temperature 必须在 0 到 2 之间；收到 3。',
      '  • maxTokens 必须是正整数；收到 -1。',
      '  • outputFormat 必须是 text、json 或 markdown；收到“xml-原文”。',
    ]);
  });
});
