# Developer documentation

Notes for whoever works on this extension next, written with an Angular developer in mind.

| Read this | When you want to know |
|---|---|
| [architecture.md](architecture.md) | How the pieces fit together, and how they map to Angular ideas |
| [functions.md](functions.md) | What every file and function does, in plain words |
| [glossary.md](glossary.md) | What "perk", "socket", "hash", "slot" and the other Destiny words mean, and the rule the extension checks |

If you only have five minutes: read the first two sections of `architecture.md`, then open `src/inject.ts` (41 lines) and follow the imports.

## Working on the code

```bash
npm install        # once
npm run build      # type-check, then write dist/
```

Chrome loads the `dist/` folder (`chrome://extensions` → Developer mode → Load unpacked). After a build, press the reload arrow on the extension's card, then reload DIM.

To try the panel without DIM, run `test/serve.ps1` and open `http://localhost:8765/`. That page uses made-up data, runs the automated checks at the top, and has a button that raises the "new clash" alert.

To re-run the analysis on a debug export from the panel, without DIM:

```bash
node test/check-export.mjs path/to/artifact-slot-check-debug.json
```

## Code style

- Descriptive names everywhere, including inside loops and callbacks. Prefer plain code over clever code.
- Files stay short (most are under 120 lines). When a file grows past a few hundred lines, split it.
- Anything that touches the page lives in `ui/`; anything that touches the network lives in `app/`. `analysis/` does neither, which is why it is easy to test.

## Making these docs a web page

GitHub can serve this folder as a site: in the repository's **Settings → Pages**, choose "Deploy from a branch", branch `main`, folder `/docs`. Nothing here needs a build step.
