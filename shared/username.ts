/** Usernames: trimmed, lowercase, spaces become underscores. Any language's letters, numbers, _ . - */
export const normalizeUsername = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase().replace(/\s+/g, "_") : v);
export const USERNAME_RE = new RegExp("^[\\p{L}\\p{M}\\p{N}_.-]+$", "u");
