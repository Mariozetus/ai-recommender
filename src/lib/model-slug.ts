/** Replace / with ~ to make a model ID URL-safe */
export const modelSlug = (id: string) => id.replace(/\//g, '~');
/** Reverse a URL-safe slug back to the original model ID */
export const modelIdFromSlug = (slug: string) => slug.replace(/~/g, '/');
