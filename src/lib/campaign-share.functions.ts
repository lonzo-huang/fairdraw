import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Narrow public metadata read; no session or privileged database reads. */
export const getCampaignShare = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => ({ slug: input.slug.slice(0, 100) }))
  .handler(async ({ data }) => {
    const client = createClient<Database>(import.meta.env['VITE_SUPABASE_URL'], import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'], { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: c, error } = await client.from("campaigns").select("id, slug, title, prize, prize_amount, currency, winners_count, conditions, requirement, share_language, share_duration, share_image_path").eq("slug", data.slug).maybeSingle();
    if (error) throw new Error(error.message);
    const req = getRequest();
    const url = new URL(req.url);
    const host = url.hostname === "localhost" ? req.headers.get("x-forwarded-host") : null;
    const origin = host ? `https://${host}` : url.origin;
    return { c, imageUrl: c?.share_image_path ? `${origin}/api/public/campaign-image/${encodeURIComponent(c.slug)}` : null };
  });