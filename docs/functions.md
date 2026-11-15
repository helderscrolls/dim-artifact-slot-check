# Function reference

Every file and function, in plain words. Files are listed in the order data flows through them: entry point, `analysis/`, `app/`, then `ui/`.

Conventions: "slot" means an in-game loadout slot; "position" is 1–7 as the player sees it; "socket index" is the same thing counted from 0. See the [glossary](glossary.md).

---

## `src/inject.ts` (entry point)

### `start()`
Runs once when the script loads. Does nothing if it already ran, or if the page has no `fetch`. Otherwise:
1. takes DIM's own `fetch` (so our requests don't trigger our own listener),
2. creates the shared context,
3. starts listening to Bungie's answers,
4. puts the panel on the page (immediately, or when the page finishes loading),
5. sets `window.__dimArtifactSlotCheck`, which is also how the test page reaches the analysis code.

---

## `src/bungie-types.ts`

Types only, no functions. They describe the parts of Bungie's profile and manifest answers that the extension reads. Everything is optional, because what Bungie sends depends on which parts were requested and on privacy settings.

---

## `src/analysis/` — the brains (no page code, no network)

### `analysis/constants.ts`
Three numbers: `UNSET_PLUG_HASH` (marks "nothing saved here" in a loadout), `EMPTY_ARTIFACT_PLUG_HASH` (what an empty artifact position holds), and `ARTIFACT_BUCKET_HASH` (the inventory bucket artifacts live in).

### `analysis/index.ts`
Re-exports everything from this folder, so other code writes `from '../analysis'`. Think of it as the folder's public API.

### `analysis/profile-items.ts`

#### `indexItemsByInstanceId(profile)`
Bungie lists items in several places: the vault, and each character's inventory and equipment. This gathers them into one lookup table, keyed by item instance id. Used by `analyze` and `debugSnapshot`.

### `analysis/clash.ts` — reading the profile and finding clashes

#### `layoutFrom(plugHashes)`
Turns a list of plug hashes (one per socket) into a map from perk hash to socket index. Skips empty positions: the "unset" and "empty artifact mod" hashes, zero, and any hash that appears in more than one socket (the game never allows the same perk twice, so a repeat must be a placeholder).

#### `readCurrentLayout(profile, artifactInstanceId)`
What one artifact holds **right now**, as Bungie reports it. Returns null when Bungie sent no socket data for it.

#### `toPosition(socketIndex)`
Socket index + 1, the number the player sees.

#### `makeTierKey(artifactHash, perkHash)`
Builds a key like `"3821685388:324580787"` (artifact hash, then the perk hash divided by eight and rounded down) that groups perks of the same tier on the same artifact. Perks of one tier have consecutive hashes in a block of eight, so dividing by eight groups them. This is an inference, not documented by Bungie.

#### `collectPositionsSeenPerTier(profile, itemsByInstanceId)`
Learns which positions each tier of perk has been seen in: from every artifact's current arrangement, and from every saved loadout. The suggested fix only moves perks to positions listed here, because Bungie does not publish the real rules.

#### `analyze(profile)` — the main function
Checks every character's saved loadouts and returns an `Analysis`: per character, a result for each slot that holds an artifact, plus suggested fixes. Steps per character: `findSavedArtifactSlots`, then `checkSlot` for each, then `makeFixPlans`.

#### `findSavedArtifactSlots(loadouts, itemsByInstanceId)`
Picks out the loadout slots that contain an artifact with perks, and counts the filled slots that don't (`savedWithoutArtifact`). Empty slots are ignored.

#### `checkSlot(slot, allSlots, profile)`
Gives one slot its status:
- **`brokenNow`**: perks whose saved position differs from where Bungie reports them now.
- **Clashes**: for every other slot on the same artifact, the perks the two slots keep in different positions.
- **Status**: `clash` if it has any clash, else `broken` if any perk is out of place now, else `ok`. Clash wins because it comes from saved data; the "now" part depends on Bungie's report, which can lag.

#### `makeFixPlans(savedSlots, slotResults, positionsSeenPerTier)`
For every artifact whose slots clash, asks `planLayout` for a fix, then converts its socket indexes to 1-based positions for display.

#### `summarize(analysis)`
Counts slots, clashing slots and "check artifact" slots across all characters. Feeds the pill's text.

#### `neededHashes(analysis)`
Lists every item hash and loadout-name hash the panel will need to display, so `names.ts` knows what to download.

### `analysis/layout.ts` — the suggested-fix search

See "The suggested-fix search, briefly" in [architecture.md](architecture.md) for the idea.

#### `planLayout(slots, getAllowedPositions)`
The entry point. Groups slots into builds, tries leaving out as few slots as possible, finds the cheapest layout for each option, and returns which slots to **change** (with the perk moves), which are **unchanged**, and which are **excluded** because they cannot fit. `exhaustive` is false if the step budget ran out.

#### `toSlotRef(slot)`
Copies just the slot's index and name hash.

#### `groupSlotsIntoBuilds(slots)`
Slots that use exactly the same set of perks, in any order, become one build.

#### `listLeaveOutOptions(builds)`
Every way of leaving builds out, best first: fewest slots lost, then fewest builds left out. It counts from 0 up and reads each number as a row of on/off switches, one per build, which visits every subset once. With more than 12 builds it only tries leaving out one or two.

#### `findHomePositions(builds, getAllowedPositions, searchBudget, costToBeat)`
The backtracking search. Gives each perk a home position so that perks of one build never share a position, counting how many slots would need re-saving. Keeps the cheapest layout found, and stops early when a branch can't beat it. Returns null if nothing fits.

#### `describePerks(builds, getAllowedPositions)`
Prepares what the search needs for each perk: which builds use it, where each slot has it saved, and its candidate positions (the most-used first). Perks with the fewest choices go first, which cuts dead ends early.

### `analysis/new-clashes.ts` — the "you just broke something" alert

#### `makeSlotPairKey(characterId, slotIndexA, slotIndexB)`
A key that is the same whichever of the two slots is named first.

#### `findNewClashes(previousAnalysis, currentAnalysis)`
Returns the slot pairs that clash now but did not at the previous check. A pair that stopped clashing is not reported. Each pair is reported once, with the lower slot first.

### `analysis/debug-snapshot.ts` — the debug export's data

#### `debugSnapshot(profile)`
The raw artifact facts behind an analysis: each artifact's current plugs and allowed plugs, and each saved slot's plugs. Real instance ids are replaced with labels like `A1`, so nothing identifies the account, a character or an item.

#### `debugItemHashes(snapshot)`
Every item hash in a snapshot, so the export can include names for them.

---

## `src/app/` — listening, state, names

### `app/constants.ts`
`LOG_TAG`, the address patterns for the two Bungie requests we care about, the local-storage key for names, the popup's timing and size limits, and the debug file name.

#### `classNameOf(classType)`
0 → "Titan", 1 → "Hunter", 2 → "Warlock", anything else → "Character".

### `app/state.ts`

#### `createState()`
The starting state: nothing loaded, panel closed, no tab chosen, filter "all", main view, no new clashes. The `State` type documents every field.

### `app/context.ts`

#### `createContext(originalFetch)`
Builds the shared bag every part receives: the state, the name directory, DIM's original `fetch`, the set of folded sections, and three actions (`redraw`, `setPanelOpen`, `showNewClashToast`) that start as do-nothing and are replaced when the panel mounts.

### `app/names.ts` — hashes to names

`NameDirectory` is a class, like an Angular service. Public methods:

- **`perkName(hash)`** — the perk's name, or "Perk 12345" until it has loaded.
- **`artifactName(hash)`** — the artifact's name, or "Artifact".
- **`itemNameOrUndefined(hash)`** — a name, or undefined if unknown (used by the debug export).
- **`slotLabel(slotIndex, nameHash)`** — "Slot 3 · Strand" (the name part is left off until known).
- **`slotNames(slotRefs)`** — several labels joined by commas.
- **`loadoutNames`** — all known loadout names.
- **`includeExtraItemHashes(hashes)`** — also name these items (the debug export needs more than the panel does).
- **`loadMissingNames()`** — downloads any names still missing. Calls queue up so two downloads never overlap; when done it saves to local storage and redraws.

Private: `findMissingHashes` (what is still unknown, skipping hashes Bungie has no name for), `downloadMissingNames` (the download itself), `downloadTable` (fetches one Bungie table using DIM's original `fetch`).

Module functions: `readCache()` loads remembered names from local storage (empty if missing or damaged); `writeCache(cache)` saves them (silently ignored if storage is full or blocked).

### `app/network-listener.ts` — the interceptor

#### `listenToBungieResponses(originalFetch, onResponse)`
Replaces the page's `fetch` with a wrapper. Every request goes to DIM exactly as before. For profile and manifest requests, a **clone** of the answer is read and handed to `onResponse`. Any error in there is swallowed, so DIM can never break because of this extension.

#### `identifyBungieRequest(requestInput)`
Says whether a request is the profile (`'profile'`), the manifest (`'manifest'`), or neither (null). Handles `fetch` being called with a string, a `URL` or a `Request`.

### `app/data-handler.ts` — what happens when an answer arrives

#### `handleBungieResponse(context, kind, json)`
Routes the answer to `handleProfile` or `handleManifest`, then starts loading any missing names. Wrapped in a try/catch that logs and moves on.

#### `handleProfile(context, profile)`
Runs `analyze`, stores the result and the debug snapshot, compares with the previous result to find new clashes (never on the first check), redraws, and — if there are new clashes — waits for names and shows the popup. Returns false if the profile has no loadouts.

#### `handleManifest(context, manifest)`
Remembers where Bungie's name tables are, picking the page's language, then the language without its region (`en-GB` → `en`), then English. Returns false if the answer has no table locations.

### `app/debug-export.ts` — the "Export debug file" button

#### `exportDebugFile(context)`
Builds a JSON report (the snapshot, the analysis without character ids, and names for everything in it) and downloads it.

#### `saveAsDownload(text, fileName)`
Makes the browser save text as a file, the way a download link would, then releases the temporary address after ten seconds.

---

## `src/ui/` — everything drawn on the page

Every `render…` function receives the `context` and returns DOM elements. Nothing is cached: the panel is rebuilt on each redraw.

### `ui/dom.ts` — small helpers

- **`el(tag, className?, text?)`** — creates an element. The workhorse of the whole UI.
- **`button(className, text, onClick)`** — a button that won't submit a form.
- **`ordinal(number)`** — 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd".
- **`pluralizeSlots(count)`** — "1 slot" or "3 slots".
- **`foldable(foldedSections, className, key, openByDefault)`** — a `<details>` box that remembers if the player opened or closed it. It stores only the boxes that differ from their default, under `key`.
- **`pairs(rows)`** — a two-column grid: bold name, then description.
- **`list(tag, lines)`** — a numbered or bulleted list.
- **`labelled(label, content)`** — a small heading plus its content.
- **`step(title, ...bodyElements)`** — a titled box, used for each moved slot and each new clash.

### `ui/styles.ts`
`PANEL_STYLES`: the panel's whole stylesheet as one string, in labelled sections. It is applied inside a shadow root, so it cannot affect DIM.

### `ui/panel.ts`

#### `mountPanel(context)`
Adds the panel to the page, once. Builds the elements and the popup, defines `setPanelOpen`, and plugs `redraw`, `setPanelOpen` and `showNewClashToast` into the context.

#### `setPanelOpen(open)` (inside `mountPanel`)
Opens or closes the panel. Opening hides the popup and jumps to the class with the new clash. Closing counts as having seen the alert, so it clears the list of new clashes. Then it redraws.

### `ui/panel-elements.ts`

#### `createPanelElements(context)`
Builds the empty frame: the pill, and a panel with header (title, "?" and "×"), tabs, filters, body and footer (status text and the export button). Wires the simple interactions: help toggle, export click, pill click, close, and Escape. Everything sits inside a shadow root. Returns a `PanelElements` object so other files can reach the pieces.

#### `addStyles(shadow)`
Attaches the stylesheet using a constructed stylesheet, falling back to a `<style>` element if the browser refuses.

### `ui/render-panel.ts`

#### `renderPanel(context, elements)`
The redraw. Keeps the panel on the page, updates the pill and footer, clears the body, then draws either the help page or the main view. It keeps the scroll position on a refresh, and resets it to the top when you switch view, tab or filter.

#### `renderHelpView`, `renderFooter`, `keepAttachedToPage`
Draw the help page into the body; set the footer's "Checked at …" text and enable the export button once there is data; and re-attach the panel if DIM replaced the contents of `<body>`.

### `ui/pill.ts`

#### `renderPill(context, elements)`
Sets the pill's colour and text. Priority: a new clash (until the panel opens), then clashes, then "Check artifact", then "OK", then "No artifact loadouts", then "waiting for DIM". Only clashes turn it red.

### `ui/main-view.ts`

#### `renderMainView(context, elements)`
Draws the tabs, the filter chips and the list for the selected class. Order in the list: new-clash banner, suggested fixes, "check artifact" cards, then the slots. Returns a key naming what is showing, or null if there is nothing yet.

#### `chooseCharacter(characters, pickedCharacterId)`
The class the player picked, else the first class with a problem, else the first class.

### `ui/tabs.ts`

#### `renderTab(context, tabsElement, character, isSelected)`
One tab button with a dot showing that class's worst status. Clicking selects it, redraws, and puts keyboard focus on the new selected tab.

#### `enableArrowKeysBetweenTabs(tabsElement)`
Left and right arrow keys move between tabs, wrapping around at both ends.

### `ui/filters.ts`

#### `renderFilters(context, character, filtersElement)`
Draws the chips ("All 17", "Clash 3", …) and returns the active filter. The chips are hidden when only one status exists, because they would just repeat "All". A filter with no slots falls back to "All".

### `ui/slot-row.ts`

#### `renderSlotRow(context, characterId, slot)`
One slot as a line: slot label, artifact name, status. Slots with a problem expand to show the details; "OK" slots are plain lines.

#### `describeClashesByPerk(names, slot)`
Turns a slot's clashes into one line per perk, such as "Horde Shuttle: 5th here · 4th in slot 15 · 3rd in slots 18, 20".

### `ui/suggested-fix.ts`

#### `renderSuggestedFix(context, characterId, plan)`
The "Suggested fix" card: which perks to move in which slots, how to apply it, which slots are already fine, and which can't fit.

### `ui/artifact-drift.ts`

#### `findArtifactDrifts(character)`
Finds artifacts whose saved slots agree with each other, but which Bungie reports arranged differently. Artifacts that already have a suggested fix are skipped.

#### `renderArtifactDrift(context, characterId, drift)`
The amber "Check artifact" card, with what to do (ignore it if the game looks right; otherwise move the perks on the artifact itself).

### `ui/new-clash-text.ts`

#### `describeNewClash(names, newClash)`
Two lines about one new clash: which slots, and over which perks. Shared by the popup and the banner so they read the same.

#### `describeNewClashesShort(newClashes)`
The pill's text: "New clash: slot 3 and slot 11", or "2 new clashes".

### `ui/new-clash-banner.ts`

#### `renderNewClashBanner(context)`
The red box at the top of the panel listing new clashes, with a Dismiss button.

### `ui/toast.ts`

#### `createToast(context)`
Builds the popup in the top right corner and returns `{ element, show, hide }`. `show` lists up to three clashes plus "and N more" and an **Open panel** button; it does nothing while the panel is open. The popup hides itself after ten seconds, but stays while the mouse or keyboard focus is on it. Escape and × close it.

Inside: `startHideTimer`, `cancelHideTimer`, `hide`, `show`, `buildHeader`, `buildClashLines`, `buildActions`.

### `ui/help.ts`

#### `renderHelp(context)`
The help page behind "?": what the panel checks, the colour legend, how to fix a clash, how to find your way around, good habits, and what happens to your data.

#### `section(title, ...content)`, `renderLegend()`
A heading followed by its content; and the three status dots with their meanings.
