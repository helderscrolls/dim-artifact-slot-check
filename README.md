# DIM Artifact Slot Check

A small Chrome extension for [DIM](https://app.destinyitemmanager.com). It warns when saved in-game loadouts keep the same artifact perk in different positions.

## Why

A saved in-game loadout remembers the position of each artifact perk. If one of its perks currently sits in a different position on the artifact, the game cannot place it, and the loadout shows "Contains items with invalid mods".

## What it shows

A pill in the bottom-left corner of DIM. Click it for the saved slots that include an artifact, with one tab per class and filter chips for each status:

- **OK** (green): no problem found.
- **Clash** (red): this slot and another slot keep a shared perk in different positions. Equipping one will break the other. Only clashes turn the pill red, because they come from your saved data.
- **Check artifact** (amber): the slot is fine, but Bungie reports the artifact arranged differently. Bungie's report can lag behind in-game changes, so if the artifact looks right in game, ignore it.

When a refresh brings a clash that was not there before (for example after saving a build over a slot), a popup appears in the top right corner for about ten seconds, with an **Open panel** button. It stays while the mouse or keyboard focus is on it. The pill also turns red and says "New clash: slot 3 and slot 11" until you open the panel, which then opens on that class with the details at the top. Only clashes raise this alert, because "Check artifact" can be Bungie's report running behind.

Click a slot to see which perks are involved. The **?** button in the panel header explains all of this inside DIM.

When slots on the same artifact clash, a **Suggested fix** card lists which perks to move in which slots so every shared perk ends up in the same position everywhere. It keeps as many slots as it can, asks for as few re-saves as it can, and names any slot that cannot fit. It only suggests positions it has already seen that kind of perk in on your account.

To apply a fix: equip the slot in orbit, rearrange the perks on the artifact, then overwrite the slot.

## Troubleshooting

**Export debug file**, in the panel's footer, saves the artifact data behind the panel as JSON. It holds no account, character or item ids. To re-run the analysis on an export:

```
node test/check-export.mjs path/to/artifact-slot-check-debug.json
```

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the `dist` folder.
4. Reload DIM.

## Build

Needs Node.js. The source is TypeScript in `src/`; Chrome loads the compiled `dist/` folder.

```
npm install
npm run build
```

`npm run build` type-checks first and stops on any type error. After a rebuild, press the reload arrow on the extension's card in `chrome://extensions`, then reload DIM.

The compiled `dist/` folder is committed, so a fresh clone can be loaded in Chrome without building.

## How it works

- It listens to the Bungie API responses DIM already downloads. It needs no login and no API key.
- It downloads Bungie's public name tables once, to show perk and loadout names, and keeps the few names it needs in DIM's local storage.
- It sends nothing anywhere and requests no extension permissions beyond running on DIM's two addresses.

## Files

- `src/inject.ts`: the entry point, 41 lines. Start reading here.
- `src/analysis/`: the clash rules and the suggested fix. No page code, no network.
- `src/app/`: listening to Bungie's answers, the shared state, names, the debug export.
- `src/ui/`: everything drawn on the page.
- `src/bungie-types.ts`: the parts of Bungie's profile data the extension reads.
- `src/manifest.json`: the extension manifest, copied into `dist/` by the build.
- `test/`: a test page with made-up data. Build first, run `test/serve.ps1`, then open `http://localhost:8765/`.
- `docs/`: [developer documentation](docs/README.md), including what every function does.
