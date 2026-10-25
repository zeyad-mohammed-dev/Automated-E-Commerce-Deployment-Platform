// A small purple placeholder, used when a product or category has no picture
const placeholder =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#efe9ff"/><stop offset="1" stop-color="#ffe9d6"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><g fill="none" stroke="#6C3AFF" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" opacity=".55"><path d="M130 170h140l14 130H116z"/><path d="M165 170v-20a35 35 0 0 1 70 0v20"/></g></svg>`,
  );

export const imageOf = (url?: string | null): string => url || placeholder;
export const PLACEHOLDER_IMAGE = placeholder;
