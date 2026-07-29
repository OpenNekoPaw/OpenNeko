export interface IExtensionI18n {
  t(key: string, ...args: Array<string | number | boolean>): string;
}
