import type { DocumentPreviewRegistration } from './NodeDocumentPreviewServer';

/** Owns exactly one document token for one Webview panel. */
export class DocumentPanelRegistration {
  private registrationPromise: Promise<DocumentPreviewRegistration> | null = null;
  private disposed = false;

  constructor(
    private readonly register: () => Promise<DocumentPreviewRegistration>,
    private readonly unregister: (token: string) => Promise<void>,
  ) {}

  async getOrCreate(): Promise<DocumentPreviewRegistration> {
    if (this.disposed) {
      throw new Error('Document panel registration is already disposed.');
    }
    if (!this.registrationPromise) {
      this.registrationPromise = this.register();
    }
    const registration = await this.registrationPromise;
    if (this.disposed) {
      throw new Error('Document panel was disposed while its registration was being created.');
    }
    return registration;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const registrationPromise = this.registrationPromise;
    if (!registrationPromise) return;
    void registrationPromise.then(
      (registration) => this.unregister(registration.token),
      () => undefined,
    );
  }
}
