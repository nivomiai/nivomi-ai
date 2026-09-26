---
title: 'Nivomi public website: MVP voice automation + Coming Soon product pages'
type: 'feature'
created: '2026-09-26'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f3e977d2b633c83e79e4042230d85a6b9fcc148c'
context:
  - '{project-root}/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `apps/web` serves a placeholder. The existing brand site (`Downloads/nivomi-ai-website (4).html`) advertises non-MVP capabilities (WhatsApp, Operations and Analytics managers, a 7-day trial, hotel and logistics) as available. It also has dead Privacy and Terms links.

**Approach:** Build the public website in `apps/web` (Next.js App Router, Tailwind 4), keeping the existing brand: mulberry and plum palette, Inter and Poppins, the logo mark and wordmark, the icon set, and the dark/light theme. The homepage sells the MVP, which is AI voice automation for sales teams. Future products appear as clearly badged COMING SOON items, each with its own page built from one shared data-driven template. Placeholder `/privacy` and `/terms` pages carry a visible legal-review warning.

Decisions from the owner's brief (2026-09-26):

- The previous Open Questions are resolved: the MVP is distinguished from Coming Soon, and the placeholder legal pages are added.
- The full scope stays in this one spec.
- The brief is the approval to implement.

## Boundaries & Constraints

**Always:**

- **Routes:**
  - `/` with the 18 sections of the brief;
  - `/privacy` and `/terms`;
  - `/coming-soon/{whatsapp-ai,sms-automation,operations-ai,analytics-ai,hotel-automation,logistics-automation}`, all rendered by one `ComingSoonPage` from a typed `comingSoonProducts` array.
- **Status badges:** MVP items carry a status badge whose label is one config value. Future items say "COMING SOON". Example data carries a "Preview", "Example" or "Illustration" label.
- **Six languages:** shown with a note that "availability and voice quality depend on provider support and validation".
- **Pricing:** Starter, Growth and Enterprise, structured as subscription + included usage + metered overage. Prices read "Coming soon" or "Talk to us".
- **Lead form:** fields Name, Work email, Company, Phone, Monthly lead volume (optional) and Message. It has idle, submitting, success, validation-error and server-error states. It submits through a `LeadCaptureClient` interface. The only implementation hands off to Nivomi's existing WhatsApp and email contact channels; there is no new API endpoint.
- **Analytics:** a `track(event)` abstraction for the brief's seven event names. It is a no-op until a provider is chosen, and sends no personal data.
- **SEO:** metadata per route (unique Coming Soon titles), canonical URLs, Open Graph, `robots.ts`, `sitemap.ts`, favicon from the logo mark.
- **Quality:** responsive at 375–1440+ with no horizontal scroll. Accessibility: semantic landmarks, one h1 per page, visible focus, labelled form controls with messages, reduced-motion support, a keyboard-operable mobile menu.
- **Performance:** fonts through `next/font`. Images are local and sized. No new runtime dependencies.

**Never:**

- No invented prices, discounts, trials, customers, testimonials, logos, metrics, certifications, uptime figures, accuracy figures or compliance guarantees.
- No fake calls or integrations, and no dashboard or app screens. Login is a truthful "pilot access" page.
- HubSpot is never shown as required. Providers appear as plain text, never as vendor logos. The LLM is described as configurable.

## I/O & Edge-Case Matrix

| Scenario                 | Input / State                           | Expected Output / Behavior                                                   | Error Handling         |
| ------------------------ | --------------------------------------- | ---------------------------------------------------------------------------- | ---------------------- |
| Lead form valid          | Required fields valid                   | Submitting, then success; handoff channel opened with the details prefilled  | N/A                    |
| Lead form invalid        | Missing name, invalid email or phone    | Stays idle; inline messages; first invalid field focused with `aria-invalid` | Cleared on edit        |
| Handoff fails            | Client throws or the popup is blocked   | Server-error state with the email fallback link; no stack trace              | Retry allowed          |
| Theme                    | First visit / stored value / junk value | dark / stored / dark; toggle persists                                        | Storage errors ignored |
| Unknown Coming Soon slug | `/coming-soon/foo`                      | 404 page                                                                     | N/A                    |

</frozen-after-approval>

## Code Map

- `apps/web/app/layout.tsx`, `page.tsx`, `globals.css` -- current root layout, placeholder page and Tailwind tokens. Replace the placeholder tokens with the brand tokens (they become the app's design-system seed).
- `apps/web/next.config.ts` -- security headers stay; no CSP yet (TECH_DEBT).
- `tests/e2e/smoke.spec.ts`, `playwright.config.ts` -- e2e runs against production builds; the smoke test's h1 assertion changes.
- Brand source: the Downloads HTML. It holds the `:root` tokens, the dark theme under `[data-theme="dark"]`, 45 `<symbol>` icons including `nv-mark` (viewBox `150 40 1660 1262`), the footer wordmark SVG and one webp avatar. Reuse the copy only where it fits the MVP.

## Tasks & Acceptance

**Execution:**

- [x] `apps/web/app/globals.css` -- brand tokens (light and dark semantic variables mapped into Tailwind `@theme`), base styles, reduced motion.
- [x] `apps/web/public/brand/*` -- the icon sprite and avatar extracted from the source.
- [x] `apps/web/lib/site/*.ts` -- site config (contact channels, status label), content data (sections, `comingSoonProducts`, pricing), `analytics.ts`, `lead-capture.ts` with a pure validation and message builder, plus unit tests.
- [x] `apps/web/components/marketing/**` -- navbar, sections, shared primitives (Badge, Section, WorkflowDiagram, Icon), the `coming-soon/*` template, the lead form, and the theme toggle.
- [x] `apps/web/app/**` -- `/`, `/privacy`, `/terms`, `/login`, `/coming-soon/[slug]` (with `generateStaticParams` and `dynamicParams=false`), `not-found`, `robots.ts`, `sitemap.ts`, and metadata.
- [x] `tests/e2e/*.spec.ts` -- routes return 200, the Coming Soon links resolve, the legal warning is present, form validation and success work, the mobile menu works, the theme persists, there is no horizontal overflow at 375 px, and the security headers are set.
- [x] Vitest config for `apps/web` if it is missing, so the pure `lib/` logic can be tested.

**Acceptance Criteria:**

- Given any page, when a future capability is mentioned, then it carries a COMING SOON badge, or example data carries a Preview or Example label.
- Given the content audit terms (WhatsApp, SMS, Operations, Analytics, Hotel, Logistics, trial, accuracy, customers, ROI, certification, compliance), when the source is searched, then every hit is either Coming Soon, the company contact channel, or supported wording.
- Given `npm run verify`, then every stage passes.

## Implementation Notes

- Implemented directly in the main session: no sub-agent was requested by the owner, and the
  workflow allows direct implementation.
- `/` is served by the `app/(site)` route group, which carries the shared `SiteShell`: skip link,
  `Navbar`, `main`, `Footer`. `app/not-found.tsx` renders the same shell, because the root 404
  sits outside the group. The placeholder `app/page.tsx` was removed.
- The brand tokens live in `globals.css` as semantic variables (light, plus
  `[data-theme='dark']`) mapped into Tailwind through `@theme inline`. The dark variant is
  `@custom-variant dark`. Theme bootstrap is the only inline script (`lib/site/theme.ts`).
- The MVP badge text is `siteConfig.mvpStatusLabel` = "Early access", because the platform is not
  live yet. Change it to "Available now" at general availability.
- Brand assets were extracted from the source HTML into `public/brand/`: `icons.svg` (45-symbol
  sprite) and `ai-agent.webp` (820×820 mascot). The favicon is `app/icon.svg`, from the logo
  mark.
- Lead capture: `LeadCaptureClient` in `lib/site/lead-capture.ts`. The only implementation opens
  WhatsApp through `window.open(url, '_blank')` and nulls `opener`. A `noopener` feature string is
  not used, because it makes `window.open` return `null` and would hide a blocked popup. There is
  an email fallback. No API endpoint was added.
- Analytics: `track()` is a no-op until `setAnalyticsSink` registers a provider. Its events carry
  placement and slug only.
- Configuration changes:
  - Root `tsconfig.json` gained the `DOM` lib, for Playwright `page.evaluate` bodies.
  - `apps/web/tsconfig.json` gained the `@/*` path alias.
  - `apps/web` gained a `test:unit` script (Vitest 5.0.1, already in the workspace), so no new
    dependency was added.
- Verified with `npm run verify`:
  - Format, lint and typecheck: clean.
  - Unit tests: 43 (17 of them web). Integration tests: 11.
  - Build: succeeded. Audit: 0 vulnerabilities. End-to-end: 26.
  - Playwright screenshots at 1440 and 390 px in both themes: no overflow, no console errors.

- Owner follow-up (2026-09-26): "design the Coming Soon pages". The shared template was
  redesigned, still data-driven, with:
  - a per-product accent (`cs-accent-*` in `globals.css`: green, sky, amber, indigo, teal,
    orange) for both themes;
  - a bespoke hero mockup per product: WhatsApp phone chat, SMS thread plus trigger, Operations
    board with approval, Analytics dashboard with example KPIs, chart and sparkline, Hotel
    front-desk console, Logistics shipment tracker. Every mockup is labelled
    "Preview · Illustration" and "Coming soon";
  - a Today vs. With-product comparison, an icon workflow stepper, capabilities and benefits;
  - "Built on the Nivomi platform", with the platform badged early access and the product's
    connections badged Coming Soon;
  - a three-question honest FAQ, the notify form, and other products.

  E2e now asserts that the only MVP badge on a Coming Soon page is the platform card, plus the
  FAQ count.

## Review Triage Log

Review run inline by the implementing session (edge-case and verification-gap methods), not by
independent sub-agents; the owner did not request sub-agents. Diff: `f3e977d..HEAD`, excluding
the lockfile and binary assets.

| #   | Finding                                                                                                                                | Verdict | Evidence / route                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | CTA clicks did not update the form's preselected intent: Next `Link` changes the hash through `pushState`, which fires no `hashchange` | medium  | `LeadForm` subscribes only to `hashchange`, and the e2e test loaded `/#get-started` directly. Patched: `SectionLink` renders a native anchor for same-page sections; e2e "clicking the CTAs preselects the matching intent". |
| 2   | Double-click could hand the enquiry off twice: the `status` state guard is stale within one tick                                       | low     | Patched: a ref-based `submitting` guard; e2e "a double-click hands the enquiry off only once".                                                                                                                               |
| 3   | Coming Soon notify form (fixed intent + product) had no test                                                                           | low     | Verification gap. Patched with e2e "the Coming Soon notify form names the product".                                                                                                                                          |
| 4   | Next logs `NoFallbackError` for the unknown-slug 404                                                                                   | false   | Expected log for `dynamicParams = false`; the route returns 404 and the e2e test asserts it.                                                                                                                                 |
| 5   | Spec claims: no invented prices, seven analytics events, one shared template, legal warning, six languages note                        | false   | Each verified in code and by e2e; none falsified.                                                                                                                                                                            |

## Verification

**Commands:**

- `npm run verify` -- expected: all stages green.

**Manual checks:**

- Playwright screenshots of `/`, one Coming Soon page and `/privacy` at 375, 768 and 1440 px in both themes: no overflow, no console errors.
