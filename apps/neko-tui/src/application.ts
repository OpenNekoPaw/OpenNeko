import { runCliEntrypoint } from './tui/cli';

export const NEKO_TUI_APPLICATION_ID = 'neko-tui';

export function runNekoTuiApplication(argv: readonly string[] = process.argv): void {
  runCliEntrypoint(argv);
}
