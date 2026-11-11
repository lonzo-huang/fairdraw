import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { trackRefClick, bindReferral } from "@/lib/affiliate.functions";

const KEY = "fd-ref";
type Pending = { code: string; clickedAt: number };

const read = (): Pending | null => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return typeof v?.code === "string" && Number.isFinite(v?.clickedAt) ? v : null;
  } catch {
    return null;
  }
};

/**
 * Captures ?ref= links (30-day last-click attribution): stores the code +
 * timestamp, records the click once per session, then binds the account to
 * the referrer on sign-in. Clears the pending code on a successful bind.
 */
export function RefCapture() {
  const { user } = useAuth();

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("ref")?.toLowerCase();
    if (!code || !/^[a-z0-9_-]{2,32}$/.test(code)) return;
    const prev = read();
    localStorage.setItem(KEY, JSON.stringify({ code, clickedAt: Date.now() }));
    if (prev?.code !== code && !sessionStorage.getItem(`fd-clicked-${code}`)) {
      sessionStorage.setItem(`fd-clicked-${code}`, "1");
      void trackRefClick({ data: { code, ua: navigator.userAgent } });
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const pending = read();
    if (!pending) return;
    void bindReferral({ data: pending }).then((r) => {
      if (r?.bound) localStorage.removeItem(KEY);
    }).catch(() => {});
  }, [user]);

  return null;
}
