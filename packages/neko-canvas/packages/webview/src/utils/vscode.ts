import { getVSCodeAPI } from '@neko/shared/vscode';
import type { VSCodeAPI } from '../hooks/useVSCodeMessages';

export function getGlobalVSCodeApi(): VSCodeAPI {
  return getVSCodeAPI();
}
