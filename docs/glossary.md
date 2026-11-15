# Glossary

## The Destiny words

**Artifact.** A seasonal item every character carries. It has seven perk positions. Each player may own several artifacts (one per season or class, depending on the season); the panel treats each one separately.

**Perk.** One of the choices you can slot into an artifact position. In the code a perk is identified by its hash.

**Position.** Where a perk sits on the artifact, counted from 1 to 7 as the player sees it. Inside the code the same thing is a *socket index*, counted from 0. The panel adds 1 before showing it (`toPosition` in `analysis/clash.ts`).

**Socket / plug.** Bungie's words for a position and for what is in it. A *socket* is a slot on an item; a *plug* is the thing plugged into it. "Plug hash" and "perk hash" mean the same here.

**Empty Artifact Mod.** What a position holds when no perk is chosen. It has its own hash (`EMPTY_ARTIFACT_PLUG_HASH`) and is skipped when reading a layout.

**Hash.** Bungie identifies almost everything with a number: perks, items, loadout names. A hash only becomes a readable name by looking it up in Bungie's tables (done in `app/names.ts`).

**Instance id.** Unlike a hash (which names a kind of thing, like "Tablet of Ruin"), an instance id names one specific copy in a player's inventory. Each character has its own copy of each artifact. Instance ids are private, so they never appear in the debug export.

**Manifest.** Bungie's set of public tables that turn hashes into names and descriptions.

**Profile.** Bungie's description of one player: characters, items, equipped gear, and saved loadouts. DIM downloads it often; this extension reads a copy of each answer.

## The extension's words

**In-game loadout / slot.** The game lets each character save up to 20 loadouts. The extension calls each one a *slot* and numbers it from 1 (it is 0-based in the code, so `slot.index + 1` is what the player sees).

**Layout.** For one slot, which perk sits in which position. In the code it is a `Map` from perk hash to socket index.

**Build.** Slots that use exactly the same set of perks, whatever order they are saved in. Used by the suggested-fix search (`analysis/layout.ts`).

**Clash.** Two slots on the same artifact that keep a shared perk in different positions.

**Check artifact** (code name: `broken`). A slot whose saved positions differ from how Bungie reports the artifact right now. Bungie's report can be out of date, so this is softer than a clash.

**Suggested fix.** The smallest set of perk moves that makes every shared perk sit in the same position in every slot.

## The rule being checked

A saved in-game loadout remembers the position of each artifact perk. If a perk sits in a different position on the artifact when you equip the loadout, the game cannot place it and shows "Contains items with invalid mods".

This was confirmed by hand in the game (November 2026): swapping two perks on the artifact and saving a second slot broke the first.

Two slots that disagree about a perk's position can never both be satisfied by the same artifact, so the extension warns about the *pair*, before either is equipped.

## What is inferred, not documented

- **Perk tiers.** Bungie's data does not list which positions a perk may take. The extension assumes perks with hashes in the same block of eight are one tier, and that a perk may go wherever a perk of its tier has been seen on the player's account (`makeTierKey` in `analysis/clash.ts`). This held for all seven artifacts in November 2026 but is not guaranteed.
- **Position order.** The seven perk positions are assumed to be the artifact's first seven sockets. DIM's own export agrees.
