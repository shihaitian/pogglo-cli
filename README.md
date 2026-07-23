# pogglo

Publish AI-made browser games from your terminal — or let your AI agent do it for you.

```bash
npx pogglo publish
```

`publish` finds your built game automatically (`./dist`, `./build`, `./out`, `./public` or the
current folder — whichever contains `index.html`), zips it, uploads it, and prints a playable URL.
First run logs you in automatically; after that it's zero-interaction.

```bash
npx pogglo login --author yourhandle   # optional: pick your handle
npx pogglo whoami
```

Optional `pogglo.json` next to your `index.html` controls the game page copy
(`title`, `tagline`, `description`, `howToPlay`, `controls`, `faq`, `tags`, `emoji`, …).
Run `npx pogglo help` for details.

If publishing is rejected, the error message tells you (or your AI agent) exactly
what to fix and what to run next — fix and re-publish.

---

**Contributing / AI sessions:** read [CLAUDE.md](CLAUDE.md) first. Architecture in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), dev rules in [docs/SPEC.md](docs/SPEC.md),
progress board in [docs/PROGRESS.md](docs/PROGRESS.md).
