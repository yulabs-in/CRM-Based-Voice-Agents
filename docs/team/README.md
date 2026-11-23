# Team developer guides

One guide per team member, covering one-time setup, the branch model and **where to push**, the daily development loop, testing, opening a pull request into `dev`, review and merge, checking the dev preview, troubleshooting, a command cheat sheet, and the full context of that member's issues.

| Member | GitHub | Guide | PDF |
|---|---|---|---|
| Kammar Shashank | `KAMMAR-SHASHANK` | [kammar-shashank.md](kammar-shashank.md) | [Kammar-Shashank-Developer-Guide.pdf](pdf/Kammar-Shashank-Developer-Guide.pdf) |
| Tejaswini | `Tejaswini2706` | [tejaswini.md](tejaswini.md) | [Tejaswini-Developer-Guide.pdf](pdf/Tejaswini-Developer-Guide.pdf) |
| Charan Varigonda | `CHARANVARIGONDA` | [charan-varigonda.md](charan-varigonda.md) | [Charan-Varigonda-Developer-Guide.pdf](pdf/Charan-Varigonda-Developer-Guide.pdf) |

The context for **all** issues, including dependencies between members, shared files and migration numbering, is in [`docs/issues/README.md`](../issues/README.md). Each issue also has its own detailed README in `docs/issues/<nn>-<name>/README.md`.

## Updating the guides

The guide `.md` files and the PDFs are **generated**, so don't edit them by hand. Edit the sources instead:

- `docs/team/templates/guide.md`: the shared workflow (setup, Git, testing, PRs)
- `docs/team/templates/plan-<github-login>.md`: each member's order of work and collaborators
- `docs/issues/<nn>-<name>/README.md`: the detailed README for each issue, copied into the guide of the member it's assigned to (falls back to the short `## #N: Title` summary in `docs/issues/README.md`)

To change who has which issues, edit the `MEMBERS` list in `scripts/build-team-docs.mjs`. Then rebuild:

```bash
node scripts/build-team-docs.mjs            # markdown + PDFs (needs Chrome or Edge installed)
node scripts/build-team-docs.mjs --no-pdf   # markdown only
```
