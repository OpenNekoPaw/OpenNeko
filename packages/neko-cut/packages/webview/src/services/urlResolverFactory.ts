/**
 * URL Resolver Factory
 *
 * URL resolver type for use with various media services.
 */

/**
 * URL resolver function type (matches media-engine UrlResolver)
 */
export type UrlResolver = (url: string) => Promise<string>;
