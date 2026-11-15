# Architecture

## What it does, in one paragraph

The extension runs inside DIM's page. DIM constantly downloads the player's profile from Bungie; the extension reads a **copy** of each answer, checks the player's saved in-game loadouts for artifact perks that clash, and shows the result in a small panel in the corner of the page. It never changes what DIM sees, and it sends nothing anywhere except requests for Bungie's public name tables.

## The folders

```
src/
  inject.ts          Entry point. Wires everything together (41 lines).
  bungie-types.ts    The shape of the Bungie data we read (types only).
  analysis/          The brains. No page code, no network. Easy to test.
  app/               Listening to Bungie, shared state, names, the debug export.
  ui/                Everything drawn on the page.
test/                A test page with made-up data, and a command-line checker.
docs/                You are here.
```

The dependency direction is one-way, which keeps things easy to follow:

```
ui  ──►  app  ──►  analysis
```

`analysis` knows nothing about the others. `app` knows about `analysis`. `ui` knows about both. (`ui/panel-elements.ts` calls `app/debug-export.ts` for the export button; that is the one place the arrow could be argued either way.)

## How data flows

1. DIM asks Bungie for the player's profile (`fetch`).
2. `app/network-listener.ts` has wrapped `fetch`. DIM gets its answer untouched; a **copy** goes to `handleBungieResponse`.
3. `app/data-handler.ts` runs `analyze()` on the profile and stores the result in `state.analysis`. It compares with the previous result to find *new* clashes.
4. It calls `context.redraw()`, which runs `ui/render-panel.ts`, which rebuilds the panel from the state.
5. If there are new clashes, it waits for the perk names to load, then shows the popup.

Names take a separate path: the first time the extension sees a perk hash it downloads Bungie's name table once, remembers the names in the browser's local storage, and redraws.

## Angular, translated

If you know Angular, most of this has a close cousin:

| Here | In Angular terms |
|---|---|
| `State` (`app/state.ts`) | A store, or a service holding a few `BehaviorSubject`s, but as one plain object |
| `AppContext` (`app/context.ts`) | The dependency-injection container: the bag of services every part receives |
| `NameDirectory` (`app/names.ts`) | An `@Injectable` service with a cache and an async loader |
| `listenToBungieResponses` | An `HttpInterceptor`: it sees every request and answer without changing them |
| `handleBungieResponse` | An effect or reducer: new data arrives, state changes, the view updates |
| `analysis/` | A plain TypeScript library of pure functions and pipes, with no framework |
| `render…` functions (`ui/`) | Components, but without templates: each builds and returns DOM elements |
| `context.redraw()` | Change detection that always redraws everything. There is no virtual DOM and no diffing |
| `foldable` + `foldedSections` | A stateful `<details>`; the player's choice is stored outside the DOM, because the DOM is rebuilt |
| Shadow DOM in `panel-elements.ts` | `ViewEncapsulation.ShadowDom`: our styles cannot leak into DIM, and DIM's cannot reach us |
| `mountPanel` | `bootstrapApplication`: puts the app on the page |
| `test/test.html` | A hand-made test harness; there is no Jasmine or Karma |

The big difference: there is no template language or framework, so every `render…` function builds elements with `document.createElement` through the small helper `el()`. Redrawing is cheap here because the panel is small.

## Why a shared `context` object instead of globals

Early versions kept everything inside one huge function. Splitting it needed some way for each file to reach the state and a few actions (redraw, open the panel, show the popup). `AppContext` is that: files receive it as a parameter, the way an Angular component receives an injected service. The panel fills in `redraw`, `setPanelOpen` and `showNewClashToast` once it exists (`ui/panel.ts`), so nothing is available before it should be.

## Design decisions worth knowing

- **Only clashes turn the pill red.** A clash comes from saved data and is certain. "Check artifact" depends on Bungie's report of the artifact, which can lag behind changes made in the game, so it is amber and softer.
- **The first check never raises an alert.** There is nothing to compare with yet.
- **Closing the panel counts as having seen an alert.** The red box at the top clears, but the clash is still shown on its slot and in the suggested fix.
- **Names are looked up lazily.** A perk shows as "Perk 12345" until its name arrives, then the panel redraws.
- **No `innerHTML`.** Everything is built with `createElement` and `textContent`, so text can never be run as code and the panel works under strict page security policies.
- **A page script, not a background script.** The manifest uses `"world": "MAIN"` so the script can wrap the page's own `fetch`. A normal content script lives in a separate world and could not see those requests.

## The suggested-fix search, briefly

`analysis/layout.ts` is the only part that is hard to read at a glance, so here is the idea:

1. Group slots that use the same set of perks into **builds**.
2. List the ways of leaving builds out of the plan, ordered by how many slots they lose (leaving nothing out comes first).
3. For each option, try every allowed position for each perk, one perk at a time, undoing a choice when it leads nowhere (this is called backtracking).
4. Score a layout by how many slots would have to be re-saved, and keep the cheapest.
5. A step budget stops the search from running for too long. If it runs out, the result says so (`exhaustive: false`).

Perks with the fewest allowed positions are tried first, which cuts dead ends off early.
