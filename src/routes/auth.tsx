import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/site-header";

const googleIcon = <svg viewBox="0 0 18 18" className="size-4" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.96 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.95l3 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>;

function safePath(p: unknown): string {
  if (typeof p !== "string") return "/dashboard";
  try {
    const u = new URL(p, "http://x");
    return u.pathname.startsWith("/") && !u.pathname.startsWith("//") ? u.pathname + u.search : "/dashboard";
  } catch {
    return "/dashboard";
  }
}

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({ redirect: typeof s["redirect"] === "string" ? s["redirect"] : undefined }),
  head: () => ({
    meta: [
      { title: "Sign in — FairDraw" },
      { name: "description", content: "Sign in to FairDraw to run or enter verifiable giveaways." },
      { property: "og:title", content: "Sign in — FairDraw" },
      { property: "og:description", content: "Sign in to FairDraw to run or enter verifiable giveaways." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const target = safePath(search.redirect);

  useEffect(() => {
    if (user) {
      const stored = sessionStorage.getItem("fd-after-auth");
      sessionStorage.removeItem("fd-after-auth");
      navigate({ to: safePath(stored ?? target), replace: true });
    }
  }, [user, navigate, target]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "up") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + target },
        });
        if (error) throw error;
        toast.success(t("auth.check"));
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function oauth(provider: "google" | "x") {
    sessionStorage.setItem("fd-after-auth", target);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + "/auth" },
    });
    if (error) toast.error(error.message);
  }

  const google = () => oauth("google");
  const twitter = () => oauth("x");

  // Email sign-in hidden for now — OAuth-only launch. See SUPABASE_SETUP.md
  // "Re-enable email sign-in" to turn it back on.
  const EMAIL_AUTH_ENABLED = false;

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="flex flex-col items-center text-center">
        <Logo />
        <h1 className="mt-5 text-3xl font-semibold">{t("auth.title")}</h1>
        <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{t("auth.sub")}</p>
      </div>
      <div className="mt-8 rounded-xl border border-border bg-card p-6">
        <Button variant="neon" className="w-full" onClick={twitter}>
          <span className="font-black">𝕏</span>{t("auth.x")}
        </Button>
        <Button variant="outline" className="mt-2 w-full" onClick={google}>
          {googleIcon}{t("auth.google")}
        </Button>
        <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">{t("auth.trust")}</p>
        {EMAIL_AUTH_ENABLED && (
          <>
        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          {t("auth.or")}
          <div className="h-px flex-1 bg-border" />
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw">{t("auth.password")}</Label>
            <Input id="pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "in" ? t("auth.signin") : t("auth.signup")}
          </Button>
        </form>
        <button className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? t("auth.toSignup") : t("auth.toSignin")}
        </button>
          </>
        )}
      </div>
    </div>
  );
}
