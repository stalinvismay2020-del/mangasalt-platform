import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** decodeURIComponent that never throws on malformed links like "%%" */
export function safeDecode(v: string) { try { return decodeURIComponent(v); } catch { return v; } }
/** Query string inside the hash, e.g. #/search?q=solo -> URLSearchParams */
export function hashQuery() { const h = window.location.hash; const i = h.indexOf("?"); return new URLSearchParams(i >= 0 ? h.slice(i + 1) : ""); }
