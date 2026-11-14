import { createFileRoute } from "@tanstack/react-router";

/**
 * Internal batch probe: given reply URLs, returns the subset that is
 * definitively deleted/protected. Called by the draw pipeline — each
 * Worker invocation has its own subrequest budget, so large draws fan the
 * probe out here instead of exhausting the caller's 50-subrequest cap.
 * Auth: Authorization: Bearer ${CRON_SECRET}.
 */
const MAX_URLS = 40;

export const Route = createFileRoute("/api/internal/deleted-probe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["CRON_SECRET"];
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
          return new Response("Unauthorized", { status: 401 });
        const body = (await request.json().catch(() => null)) as { urls?: unknown } | null;
        const urls = Array.isArray(body?.urls)
          ? body.urls.filter((u): u is string => typeof u === "string").slice(0, MAX_URLS)
          : [];
        const { postsDeleted } = await import("@/lib/x-stats.server");
        const gone = await postsDeleted(urls);
        return Response.json({ gone: [...gone.keys()] });
      },
    },
  },
});
