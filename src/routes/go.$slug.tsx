import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/go/$slug")({
  ssr: false,
  head: () => ({ meta: [{ title: "Redirecting — FairDraw" }, { name: "description", content: "Opening a FairDraw campaign project link." }, { property: "og:title", content: "Redirecting — FairDraw" }, { property: "og:description", content: "Opening a FairDraw campaign project link." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: Go,
});

function Go() {
  const { slug } = Route.useParams();
  useEffect(() => {
    supabase.rpc("register_click", { _slug: slug }).then(({ data }) => {
      if (data && /^https?:\/\//.test(data)) window.location.replace(data);
      else window.location.replace(`/c/${slug}`);
    });
  }, [slug]);
  return <p className="p-10 text-center text-muted-foreground">…</p>;
}
