import type {
  ApplyTextDocumentEditsCommand,
  TextDocumentProjection,
} from '@neko/text-editor-domain';

export interface TextEditorHostRuntime {
  project(): Promise<TextDocumentProjection>;
  applyEdits(command: ApplyTextDocumentEditsCommand): Promise<TextDocumentProjection>;
  formatJson(input: {
    readonly sessionId: string;
    readonly requestId: string;
    readonly expectedEditSequence: number;
  }): Promise<TextDocumentProjection>;
  save(input: {
    readonly sessionId: string;
    readonly expectedEditSequence: number;
  }): Promise<TextDocumentProjection>;
  reload(input: {
    readonly sessionId: string;
    readonly confirmDirty: boolean;
  }): Promise<TextDocumentProjection>;
  subscribe(listener: (projection: TextDocumentProjection) => void): () => void;
}
