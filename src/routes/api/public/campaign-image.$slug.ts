import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/public/campaign-image/$slug")({
  server: { handlers: { GET: async ({ params }) => {
    const client = createClient<Database>(import.meta.env['VITE_SUPABASE_URL'], import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'], { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: c } = await client.from("campaigns").select("id, share_image_path").eq("slug", params.slug).maybeSingle();
    const path = c?.share_image_path;
    if (!c || !path || !path.startsWith(`${c.id}/`) || path.includes("..")) return new Response("Not found", { status: 404 });
    // Expose only the public campaign's designated image, never arbitrary private files.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: blob, error } = await supabaseAdmin.storage.from("campaign-share").download(path);
    if (error || !blob) return new Response("Not found", { status: 404 });
    return new Response(blob, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } } },
});