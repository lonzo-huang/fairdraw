import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "lucide-react";
import logoImg from "@/assets/fairdraw-logo.png";

export function Logo() {
  return (
    <Link to="/" className="flex shrink-0 items-center" aria-label="FairDraw">
      <img src={logoImg} alt="FairDraw" className="h-9 w-auto object-contain" />
    </Link>
  );
}

export function SiteHeader() {
  const { user } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const onHome = useRouterState({ select: (state) => state.location.pathname === "/" });
  const { data: isAdmin } = useQuery({ queryKey: ["is-admin"], queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return false;
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    return !!data;
  }, enabled: !!user });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { redirect: undefined }, replace: true });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-primary/15 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-3 px-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-1 text-sm sm:gap-3">
          {onHome ? <a href="#campaigns" className="hidden px-2 text-muted-foreground hover:text-foreground sm:inline">{t("cy.live")}</a> : <Link to="/" className="hidden px-2 text-muted-foreground hover:text-foreground sm:inline">{t("cy.live")}</Link>}
          <Link to="/guide" className="hidden px-2 text-muted-foreground hover:text-foreground sm:inline">{t("nav.guide")}</Link>
          {user && (
            <>
              <Link to="/dashboard" className="px-2 text-muted-foreground hover:text-foreground">
                {t("nav.dashboard")}
              </Link>
              {isAdmin && (
                <Link to="/admin" className="hidden px-2 text-muted-foreground hover:text-foreground sm:inline">
                  {t("nav.admin")}
                </Link>
              )}
            </>
          )}
          <Button variant="ghost" size="sm"
            onClick={() => setLang(lang === "zh" ? "en" : "zh")}
            className="font-mono text-xs text-muted-foreground"
            aria-label={t("home.switchLang")}
          >
            {lang === "zh" ? "EN" : "中文"}
          </Button>
          {user ? (
            <Button variant="ghost" size="sm" onClick={signOut}>
              {t("nav.signout")}
            </Button>
          ) : (
            <Button asChild size="sm" variant="glass">
              <Link to="/auth" search={{ redirect: undefined }}>{t("nav.signin")}<ArrowUpRight /></Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-6"><div><Logo /><p className="mt-3 text-xs text-muted-foreground">{t("cy.footer")}</p></div><div className="flex gap-6 text-xs text-muted-foreground"><Link to="/">{t("cy.live")}</Link><Link to="/guide">{t("nav.guide")}</Link><Link to="/new">{t("cy.start")}</Link><Link to="/privacy">{t("footer.privacy")}</Link><Link to="/terms">{t("footer.terms")}</Link><Link to="/contact">{t("footer.contact")}</Link></div></div>
      </div>
    </footer>
  );
}
