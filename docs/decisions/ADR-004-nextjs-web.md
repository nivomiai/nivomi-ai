# ADR-004: Next.js App Router + Tailwind for the web app

- **Status:** Accepted
- **Date:** 2026-09-23

## Context

The product needs an organization app and a Super Admin console with authenticated, data-heavy
views, plus public pages later.

## Decision

Next.js 16 (App Router, Turbopack builds), React 19, Tailwind CSS 4 with design tokens defined in
`app/globals.css`. The web app talks to the API only through a typed API client (UI → hooks →
API client); business rules stay in the API.

## Consequences

- Security headers are set in `next.config.ts`. A strict nonce-based CSP needs a proxy/middleware
  and is tracked in TECH_DEBT.
- The design system is not defined yet; tokens are placeholders until the BMAD UX phase.
