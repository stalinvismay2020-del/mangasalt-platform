import { useEffect, useState } from "react";

/** Query string inside the hash route, e.g. #/search?q=solo → { q: "solo" } */
export function readHashQuery(): URLSearchParams {
  const h = window.location.hash;
  const i = h.indexOf("?");
  return new URLSearchParams(i >= 0 ? h.slice(i + 1) : "");
}

export function useHashQuery(): URLSearchParams {
  const [q, setQ] = useState(readHashQuery);
  useEffect(() => {
    const on = () => setQ(readHashQuery());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return q;
}

/** Replace the hash query without adding a history entry. */
export function setHashQuery(params: Record<string, string | null | undefined>) {
  const h = window.location.hash || "#/";
  const path = h.split("?")[0];
  const sp = readHashQuery();
  for (const [k, v] of Object.entries(params)) { if (v) sp.set(k, v); else sp.delete(k); }
  const s = sp.toString();
  history.replaceState(null, "", `${window.location.pathname}${window.location.search}${path}${s ? `?${s}` : ""}`);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
