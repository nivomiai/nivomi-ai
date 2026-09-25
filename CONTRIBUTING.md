# Contributing

How code moves from a branch to production. Engineering rules (tenancy, auth, providers, quality
gate) live in [CLAUDE.md](CLAUDE.md); this document covers Git, pull requests and releases.

## Branching model

| Branch      | Created from | Merges into            | Purpose                                                  |
| ----------- | ------------ | ---------------------- | -------------------------------------------------------- |
| `main`      | —            | —                      | Production. Every commit is releasable and tagged.       |
| `develop`   | `main`       | `main` (release PR)    | Integration. Default branch; all normal work targets it. |
| `feature/*` | `develop`    | `develop`              | New functionality, usually one BMAD story.               |
| `bugfix/*`  | `develop`    | `develop`              | Non-urgent defect found before release.                  |
| `hotfix/*`  | `main`       | `main`, then `develop` | Urgent production fix that cannot wait for a release.    |
| `chore/*`   | `develop`    | `develop`              | Tooling, dependencies, CI; no behavior change.           |
| `docs/*`    | `develop`    | `develop`              | Documentation and planning artifacts only.               |

Nobody commits directly to `main` or `develop`; every change lands through a pull request.

Branch names are lowercase kebab-case and, when a story exists, start with its key:
`feature/1-3-organization-invites`, `bugfix/health-check-timeout`, `hotfix/0.2.1-cors-origin`.

## Day-to-day workflow

```bash
git switch develop && git pull --ff-only
git switch -c feature/1-3-organization-invites
# ...commit in small, logical steps...
npm run verify                          # the same gate CI runs
git push -u origin feature/1-3-organization-invites
gh pr create --base develop --fill      # or open the PR in the GitHub UI
```

Keep branches short-lived. Rebase onto `develop` (`git pull --rebase origin develop`) while the
branch is yours alone; once someone else has pulled it, merge instead of rebasing.

## Releases

1. Open a PR from `develop` to `main` titled `release: vX.Y.Z` summarizing the included changes.
2. Merge it with a **merge commit** — never squash. Squashing would give `main` commits that
   `develop` does not have, and the two branches would diverge.
3. Tag the merge commit on `main` and push the tag:

   ```bash
   git switch main && git pull --ff-only
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

Versions follow [Semantic Versioning](https://semver.org/). Deploys to production happen only from
`main` after CI passes ([docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).

## Hotfixes

1. Branch `hotfix/<version>-<summary>` from `main`.
2. PR into `main`, merge, and tag the patch version.
3. Immediately merge `main` back into `develop` (PR `main` → `develop`) so the fix is not lost
   in the next release.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/):
`<type>(<scope>): <imperative summary>`, subject at most 72 characters, body explaining _why_.

- **Types:** `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`.
- **Scope:** the workspace or domain touched, e.g. `api`, `web`, `config`, `billing`, `voice`.
- One logical change per commit; never mix formatting churn with behavior changes.
- Breaking changes: `feat(api)!: …` plus a `BREAKING CHANGE:` footer.

## Pull requests

- Target `develop` (or `main` for release and hotfix PRs only).
- Fill in the PR template: link the story, tick the checklist honestly.
- The `Verify` CI check must pass. It mirrors `npm run verify`.
- Feature and bugfix PRs are **squash-merged**, so each PR becomes one conventional commit on
  `develop`. The PR title becomes that commit message, so write it in commit format.
- Head branches are deleted automatically after merge.

## Never commit

- `.env` / `.env.*` files (only `.env.example` with placeholder values), keys, certificates,
  tokens, provider credentials.
- Customer data, call recordings, transcripts, database dumps, exports or imports.
- Build output (`dist/`, `.next/`), dependencies (`node_modules/`), test reports, logs, local
  editor or Claude Code state.

`.gitignore` blocks these, but it is the last line of defence, not the first. Check
`git status` and `git diff --staged` before every commit, and stage paths explicitly rather than
with `git add -A`.

**If a secret is pushed:** rotate it at the provider first, since removing the commit does not
un-leak it. Then tell the maintainers so the history can be cleaned deliberately.

## Branch protection

Recommended repository settings for `nivomiai/nivomi-ai`. On GitHub Free, branch protection
rules and rulesets are **not enforced on private repositories**; enforcement requires GitHub Pro
(personal account) or Team (organization). Until then, treat the rules below as mandatory
conventions.

### `main` (production)

| Setting                                   | Value                                               |
| ----------------------------------------- | --------------------------------------------------- |
| Require a pull request before merging     | On                                                  |
| Required approvals                        | 1 (0 while there is a single maintainer; see below) |
| Dismiss stale approvals on new commits    | On                                                  |
| Require status checks to pass             | `Verify`, with "require branch to be up to date"    |
| Require conversation resolution           | On                                                  |
| Require linear history                    | Off. Release PRs use merge commits.                 |
| Allow force pushes                        | Off                                                 |
| Allow deletions                           | Off                                                 |
| Do not allow bypassing the above settings | On (applies to admins too)                          |

### `develop` (integration)

Same as `main`, except **Require linear history: On**. Only squash merges land here.

### Repository-wide

- **Default branch:** `develop`, so new PRs target integration, not production.
- **Merge buttons:** allow squash merging and merge commits; disable rebase merging.
- **Automatically delete head branches:** on.
- **Dependabot alerts and security updates:** on. Version updates are configured in
  [.github/dependabot.yml](.github/dependabot.yml) and target `develop`.
- **Secret scanning and push protection:** on where the plan allows it.

**Approvals with a single maintainer:** GitHub does not let authors approve their own PRs, so a
required approval would block all merges. Keep required approvals at 0 but still require the PR
and the `Verify` check. Raise it to 1 as soon as a second engineer joins, and add a
`.github/CODEOWNERS` file at that point.
