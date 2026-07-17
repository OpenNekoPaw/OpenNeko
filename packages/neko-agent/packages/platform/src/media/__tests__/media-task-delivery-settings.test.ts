import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MEDIA_TASK_CONFIGURED_OUTPUT_DIR,
  DEFAULT_MEDIA_TASK_SHOW_SAVE_NOTIFICATION,
  MEDIA_TASK_DELIVERY_CONFIG_SECTION,
  MEDIA_TASK_OUTPUT_DIR_SETTING_KEY,
  MEDIA_TASK_SHOW_SAVE_NOTIFICATION_SETTING_KEY,
  buildMediaTaskDeliverySettingsPlan,
} from '../media-task-delivery-settings';

describe('media-task-delivery-settings', () => {
  it('exposes host configuration schema constants', () => {
    expect(MEDIA_TASK_DELIVERY_CONFIG_SECTION).toBe('neko.agent.media');
    expect(MEDIA_TASK_OUTPUT_DIR_SETTING_KEY).toBe('outputDir');
    expect(MEDIA_TASK_SHOW_SAVE_NOTIFICATION_SETTING_KEY).toBe('showSaveNotification');
    expect(DEFAULT_MEDIA_TASK_CONFIGURED_OUTPUT_DIR).toBe('');
    expect(DEFAULT_MEDIA_TASK_SHOW_SAVE_NOTIFICATION).toBe(true);
  });

  it('uses host-provided default output dir and enables save notifications by default', () => {
    expect(
      buildMediaTaskDeliverySettingsPlan({
        workspaceRoot: '/repo',
        defaultOutputDir: '/repo/.neko/.cache/generated',
      }),
    ).toEqual({
      workspaceRoot: '/repo',
      outputDir: '/repo/.neko/.cache/generated',
      showSaveNotification: true,
    });
  });

  it('uses configured output dir and notification preference when provided', () => {
    expect(
      buildMediaTaskDeliverySettingsPlan({
        workspaceRoot: '/repo',
        configuredOutputDir: '/tmp/neko-output',
        configuredShowSaveNotification: false,
      }),
    ).toEqual({
      workspaceRoot: '/repo',
      outputDir: '/tmp/neko-output',
      showSaveNotification: false,
    });
  });

  it('omits file output settings without a workspace root', () => {
    expect(buildMediaTaskDeliverySettingsPlan({})).toEqual({
      showSaveNotification: true,
    });
  });
});
