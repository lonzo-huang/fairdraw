import { useI18n } from "@/lib/i18n";

export function StatusBadge({ status, endsAt }: { status: string; endsAt: string }) {
  const { t } = useI18n();
  const ended = new Date(endsAt).getTime() < Date.now();
  const label = status === "drawn" ? t("status.drawn") : status === "cancelled" ? t("status.cancelled") : ended ? t("status.ended") : t("status.open");
  const cls =
    status === "drawn"
      ? "bg-primary text-primary-foreground"
      : status === "cancelled" || ended
        ? "bg-muted text-muted-foreground"
        : "bg-success/20 text-success";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

export function EntryBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const cls =
    status === "eligible"
      ? "bg-success/20 text-success"
      : status === "verified"
        ? "bg-primary/20 text-primary"
        : status === "ineligible"
          ? "bg-destructive/20 text-destructive"
          : "bg-muted text-muted-foreground";
  const key = `st.${status}` as "st.unverified";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{t(key)}</span>;
}
