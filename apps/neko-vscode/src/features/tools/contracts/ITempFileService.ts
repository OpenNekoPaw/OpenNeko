export interface ITempFileService {
  createTempPath(prefix: string, extension?: string): string;
  writeTempFile(prefix: string, extension: string, content: Uint8Array): Promise<string>;
  deleteTempFile(filePath: string): Promise<void>;
}
