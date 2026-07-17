export interface IBlobUrlRegistry {
  createObjectUrl(buffer: ArrayBuffer, mimeType: string): string;
  revokeObjectUrl(url: string | null | undefined): void;
  revokeAll(): void;
}

class BlobUrlRegistry implements IBlobUrlRegistry {
  private readonly activeUrls = new Set<string>();

  createObjectUrl(buffer: ArrayBuffer, mimeType: string): string {
    const blob = new Blob([buffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    this.activeUrls.add(url);
    return url;
  }

  revokeObjectUrl(url: string | null | undefined): void {
    if (!url || !this.activeUrls.has(url)) {
      return;
    }

    URL.revokeObjectURL(url);
    this.activeUrls.delete(url);
  }

  revokeAll(): void {
    for (const url of this.activeUrls) {
      URL.revokeObjectURL(url);
    }
    this.activeUrls.clear();
  }
}

export function createBlobUrlRegistry(): IBlobUrlRegistry {
  return new BlobUrlRegistry();
}
