import { createFileRoute } from "@tanstack/react-router";

/**
 * Temporary diagnostics endpoint: reports which env keys are visible to
 * process.env inside the Worker (names only, never values).
 * Guard: Authorization: Bearer ${CRON_SECRET}. Remove after debugging.
 */
export const Route = createFileRoute("/api/xdebug")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env["CRON_SECRET"];
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
          return new Response("Unauthorized", { status: 401 });
        const xKeys = Object.keys(process.env).filter((k) => k.startsWith("X_"));
        const token = process.env["X_ACCESS_TOKEN"];
        return Response.json({
          xKeys,
          hasAccessToken: Boolean(token),
          tokenLength: token?.length ?? 0,
          envKeyCount: Object.keys(process.env).length,
          hasNodeProcess: typeof process !== "undefined" && typeof process.env === "object",
        });
      },
    },
  },
});
