# Documentation index

Docs describe what is **actually built**, plus clearly labelled target designs. A document marked
_pending_ does not exist yet on purpose: it is written by the story that introduces the subsystem.

| Document                                               | Status  | Notes                                               |
| ------------------------------------------------------ | ------- | --------------------------------------------------- |
| [planning/product-brief.md](planning/product-brief.md) | Draft   | Input to `bmad-prd`                                 |
| PRD (`planning/prd.md`)                                | Pending | Output of `bmad-prd`                                |
| UX spec (`planning/`)                                  | Pending | Output of `bmad-ux`                                 |
| [ARCHITECTURE.md](ARCHITECTURE.md)                     | Current | Implemented foundation + target architecture        |
| [DECISIONS.md](DECISIONS.md)                           | Current | ADR index ([decisions/](decisions/))                |
| [API.md](API.md)                                       | Current | Conventions, error envelope, endpoints              |
| [SECURITY.md](SECURITY.md)                             | Current | Implemented and planned controls                    |
| [OBSERVABILITY.md](OBSERVABILITY.md)                   | Current | Logging, correlation, redaction                     |
| [DEPLOYMENT.md](DEPLOYMENT.md)                         | Partial | Local dev + CI; AWS decided, not built              |
| [ROADMAP.md](ROADMAP.md)                               | Current | BMAD phase plan                                     |
| [TECH_DEBT.md](TECH_DEBT.md)                           | Current | Known gaps and constraints                          |
| [../CONTRIBUTING.md](../CONTRIBUTING.md)               | Current | Branching, commits, PRs, releases, protection       |
| DATABASE.md                                            | Pending | With the data-access ADR-008 and first schema story |
| AI_AGENTS.md                                           | Pending | With the AI runtime / tool registry epic            |
| VOICE.md                                               | Pending | With the voice provider epic                        |
| CRM.md                                                 | Pending | With the first CRM integration                      |
| BILLING.md, COST_MODEL.md                              | Pending | With the usage-metering epic                        |
| Stories / sprints (`stories/`)                         | Pending | Output of `bmad-create-epics-and-stories`           |
