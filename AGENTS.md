<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Draw algorithm lives in `src/lib/draw.ts` and must stay runnable in both browser and server so result pages can re-compute draws.
- Draws/payout creation are written only by the `drawCampaign` server function with admin rights, so organisers cannot forge results.
- Campaign fees are tiered by prize pool from `public.fee_tiers` (admin-editable via `has_role`); `src/lib/fees.ts` computes them. No weekly campaign limit.
- Post checks use public oEmbed (X, YouTube); unreadable posts stay "unverified" for manual review.
- UI strings go through `src/lib/i18n.tsx` (zh/en dictionary).
- Shared visual roles are defined in `src/styles.css`; route layouts use semantic tokens so all campaign screens inherit theme updates consistently.
- Homepage 3D is dynamically imported and disposed by the browser-only scene effect; campaign hub reads only publicly permitted rows and never fabricates activity or payment statistics.
- Homepage sections share the public campaign query; sponsor boards aggregate declared drawn pools by drawn_at in UTC calendar periods and one selected currency, never treating prize declarations as paid totals. Unavailable total X participation stays unknown rather than using platform registrations as all participants.
- Sponsor ranking previews use an explicitly labelled, separate browser-safe fixture and never enter campaign storage; homepage boards and the Top 50 page share ranking formatters so preview data cannot masquerade as live activity.
- The vault avatar is mapped onto both faces of a rotating physical gold coin; its accessible profile link tracks the projected center with a stable hit area, and all textures are disposed with the scene.
- Vault tokens use shared instanced geometry and deterministic stratified positions; internal dust and floor pulses share the scene loop, with a first-frame ready signal for visual verification, to keep richer visuals bounded and reproducible.
- Homepage animation uses Framer Motion for viewport reveals, stagger, count-ups and tab/layout presence; a nested CSS surface owns pointer tilt to avoid competing transforms, with reduced motion disabling animation and touch disabling tilt. Visual art never substitutes for campaign facts.
- Pre-optimize homepage slider and lazy 3D dependencies in Vite so open previews do not mix React module generations after late dependency discovery; preserve the template's React dedupe.
- Campaign sharing uses a pure shared formatter and persists publishing locale and duration; money amounts remain total pools split across winners to avoid conflicting prize claims.
- Share bitmaps are generated at 1200x630 from campaign data and stored privately; the public image endpoint serves only the designated image of a publicly readable campaign, never arbitrary storage paths.
