import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Ticket } from "lucide-react";

export function Logo() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2 text-xl font-semibold">
      <Ticket className="size-7 -rotate-12 text-success drop-shadow-sm" strokeWidth={2.3} />
      <span>FairDraw<span className="text-success">.</span></span>
    </Link>
  );
}

export function SiteHeader() {
  const { user } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const onHome = useRouterState({ select: (state) => state.location.pathname === "/" });

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
          {onHome ? <div className="hidden items-center gap-5 text-xs text-muted-foreground lg:flex"><a href="#campaigns" className="hover:text-success">{t("cy.live")}</a><a href="#calculator" className="hover:text-success">{t("cy.calc")}</a><a href="#security" className="hover:text-success">{t("cy.security")}</a></div> : <Link to="/" className="hidden px-2 font-medium sm:inline">{t("cy.live")}</Link>}
          <Link to="/pricing" className="hidden px-2 text-muted-foreground hover:text-foreground sm:inline">
            {t("nav.pricing")}
          </Link>
          {user && (
            <>
              <Link to="/dashboard" className="px-2 text-muted-foreground hover:text-foreground">
                {t("nav.dashboard")}
              </Link>
              <Link to="/admin" className="hidden px-2 text-muted-foreground hover:text-foreground sm:inline">
                {t("nav.admin")}
              </Link>
              <Link to="/my-entries" className="hidden px-2 text-muted-foreground hover:text-foreground sm:inline">
                {t("nav.myEntries")}
              </Link>
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
      <div className="mx-auto max-w-7xl px-5 py-9 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-6"><div><Logo /><p className="mt-3 text-xs text-muted-foreground">{t("cy.footer")}</p></div><div className="flex gap-6 text-xs text-muted-foreground"><Link to="/">{t("cy.live")}</Link><Link to="/pricing">{t("nav.pricing")}</Link><Link to="/new">{t("cy.start")}</Link></div></div>
        <div className="mt-7 flex flex-wrap justify-between gap-3 border-t border-border pt-5 text-[10px] text-muted-foreground"><span>© 2026 FairDraw.win · {t("cy.unaffiliated")}</span><span>{t("footer.note")}</span></div>
      </div>
    </footer>
  );
}
