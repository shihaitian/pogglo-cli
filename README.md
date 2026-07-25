# pogglo

Publish AI-made browser games from your terminal — or let your AI agent do it for you.

## The fast path: pairing code

Grab a pairing code from the pogglo website (Publish page), then — no sign-in needed:

```bash
npx pogglo publish --code POG-XXXX
```

`publish` finds your built game automatically (`./dist`, `./build`, `./out`, `./public` or the
current folder — whichever contains `index.html`), zips it, uploads it, and prints your game
page URL. If the upload is rejected, the error message tells you (or your AI agent) exactly
what to fix and what to run next — fix and re-publish with the same code.

## Sign in instead (email, no password)

```bash
npx pogglo login --email you@example.com            # step 1: emails you a 6-digit code
npx pogglo login --email you@example.com --code 123456   # step 2: done
npx pogglo publish                                  # from your game directory
npx pogglo whoami
```

## Updating your game

Just publish again from the same folder. After the first successful publish the CLI
writes your game's `slug` into `pogglo.json` in the project root — every later publish
updates the **same** game (same URL, stats kept), even if you renamed it. Commit
`pogglo.json` so clones keep the link. On a machine without it, restore the link:

```bash
npx pogglo link shihaitian/cow-puzzle        # or the full game page URL
```

## Options

```bash
npx pogglo publish [dir] [--title "My Game"] [--slug my-game]
```

Title falls back to `pogglo.json` (`{ "title": "..." }`), then to the page's
`<title>`. Run `npx pogglo help` for everything.

---

**Full command reference:** [docs/COMMANDS.md](docs/COMMANDS.md).

**Contributing / AI sessions:** read [CLAUDE.md](CLAUDE.md) first. Architecture in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), dev rules in [docs/SPEC.md](docs/SPEC.md),
progress board in [docs/PROGRESS.md](docs/PROGRESS.md).
