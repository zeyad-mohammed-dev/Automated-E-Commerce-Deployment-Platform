export const slugify = (text) => {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export const escapeRegex = (text) => {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
