import { isCutUserDiagnostic, type CutUserDiagnostic } from '@neko-cut/domain';

export type CutDiagnosticTranslator = (
  key: string,
  params?: Record<string, string | number>,
) => string;

export function translateCutDiagnostic(
  translate: CutDiagnosticTranslator,
  diagnostic: CutUserDiagnostic,
): string {
  if (!isCutUserDiagnostic(diagnostic)) {
    throw new Error('Unknown Cut user diagnostic code.');
  }
  return translate(`diagnostic.${diagnostic.code}`);
}
