# Technical debt and known constraints

| Item                                      | Impact                                                                                                     | Resolution                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Local Node is 22.12                       | ESLint pinned to 9 (end of life upstream); some dev tools warn on engine; Nest CLI unusable                | Upgrade to Node 24 LTS, update `.nvmrc`, then move to ESLint 10 |
| TypeScript held at 6.0                    | Cannot adopt TypeScript 7 (native compiler)                                                                | Upgrade when typescript-eslint supports it                      |
| No CSP on the web app                     | Weaker XSS defense in depth                                                                                | Nonce-based CSP via Next.js proxy when the app gains real pages |
| No rate limiting                          | API is open to request floods (low risk: only a health endpoint)                                           | Redis-backed throttling with the auth epic                      |
| No readiness check                        | Orchestrators cannot tell whether dependencies are up                                                      | Add with PostgreSQL/Redis                                       |
| No deploy stage in CI                     | Nothing is deployed                                                                                        | After the hosting decision                                      |
| `uv` not installed                        | BMAD skills that shell out via `uv run` need the `python` fallback; `bmad-build(-auto)` halt on activation | Install uv (`winget install astral-sh.uv` or `pip install uv`)  |
| Placeholder git author on initial commits | Bootstrap commits are authored `Your Name <you@example.com>`                                               | Set a real identity; optionally rewrite before the first push   |
| Web design tokens are placeholders        | UI work would diverge without a design system                                                              | BMAD UX phase                                                   |
