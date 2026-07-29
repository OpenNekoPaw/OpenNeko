export function createEpubJsPatchPlugin(): {
  readonly name: string;
  readonly transform: (
    code: string,
    id: string,
  ) => null | { readonly code: string; readonly map: null };
} {
  return {
    name: 'epubjs-patch',
    transform(code: string, id: string) {
      if (!id.includes('epubjs')) return null;
      let patched = code;

      patched = patched.replace(
        /load\(json\)\s*\{\s*return json\.map\(/,
        'load(json) { return (Array.isArray(json) ? json : []).map(',
      );
      patched = patched.replace(
        /return el\.getElementsByTagName\(sel\);\s*\}/,
        'return typeof el.getElementsByTagName === "function" ? el.getElementsByTagName(sel) : []; }',
      );
      patched = patched.replace(
        /elements = el\.getElementsByTagName\(sel\);/,
        'if (typeof el.getElementsByTagName !== "function") return; elements = el.getElementsByTagName(sel);',
      );
      patched = patched.replace(
        /q = el\.getElementsByTagName\(sel\);/,
        'if (typeof el.getElementsByTagName !== "function") return; q = el.getElementsByTagName(sel);',
      );
      patched = patched.replace(
        /injectIdentifier\(doc,\s*section\)\s*\{/,
        'injectIdentifier(doc, section) { if (!this.book || !this.book.packaging) return;',
      );

      return patched === code ? null : { code: patched, map: null };
    },
  };
}
