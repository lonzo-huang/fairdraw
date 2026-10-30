import { createFileRoute } from "@tanstack/react-router";

/**
 * Stripe webhook. Confirms pool funding when Checkout completes.
 * Configure endpoint: https://<domain>/api/stripe/webhook
 * Events: checkout.session.completed (plus async failure events).
 */
export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { stripe } = await import("@/lib/stripe.server");
        const secret = process.env["STRIPE_WEBHOOK_SECRET"];
        const sig = request.headers.get("stripe-signature");
        if (!secret || !sig) return new Response("Webhook not configured", { status: 500 });

        let event;
        try {
          event = stripe().webhooks.constructEvent(await request.text(), sig, secret);
        } catch (e) {
          return new Response(`Invalid signature: ${(e as Error).message}`, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (event.type === "checkout.session.completed") {
          const session = event.data.object;
          const campaignId = session.metadata?.["campaign_id"];
          if (!campaignId) return new Response("Missing campaign metadata", { status: 400 });

          await supabaseAdmin
            .from("payments")
            .update({ status: "confirmed", updated_at: new Date().toISOString() })
            .eq("provider", "stripe")
            .eq("external_ref", session.id);
          // Funding confirmed: lock the pool until draw (charged) or refund.
          await supabaseAdmin
            .from("campaigns")
            .update({ escrow_status: "funded" })
            .eq("id", campaignId)
            .eq("escrow_status", "awaiting");
        }

        if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
          const session = event.data.object;
          await supabaseAdmin
            .from("payments")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("provider", "stripe")
            .eq("external_ref", session.id);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
