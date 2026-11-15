"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // src/clash.ts
  var clash_exports = {};
  __export(clash_exports, {
    ARTIFACT_BUCKET_HASH: () => ARTIFACT_BUCKET_HASH,
    EMPTY_ARTIFACT_PLUG_HASH: () => EMPTY_ARTIFACT_PLUG_HASH,
    UNSET_PLUG_HASH: () => UNSET_PLUG_HASH,
    analyze: () => analyze,
    debugItemHashes: () => debugItemHashes,
    debugSnapshot: () => debugSnapshot,
    findNewClashes: () => findNewClashes,
    layoutFrom: () => layoutFrom,
    neededHashes: () => neededHashes,
    summarize: () => summarize
  });

  // src/layout.ts
  var NODE_BUDGET = 4e5;
  var NODES_PER_ATTEMPT = 4e4;
  var MAX_BUILDS_FOR_FULL_SEARCH = 12;
  var popcount = (n) => {
    let count = 0;
    for (let v = n; v; v &= v - 1) count++;
    return count;
  };
  function planLayout(slots, allowed) {
    const byPerkSet = /* @__PURE__ */ new Map();
    for (const slot of slots) {
      const perks = [...slot.layout.keys()].sort((a, b) => a - b);
      const key = perks.join(",");
      const build = byPerkSet.get(key) ?? { perks, slots: [] };
      build.slots.push(slot);
      byPerkSet.set(key, build);
    }
    const builds = [...byPerkSet.values()];
    const budget = { nodes: NODE_BUDGET };
    const fullSearch = builds.length <= MAX_BUILDS_FOR_FULL_SEARCH;
    const candidates = [];
    for (let mask = 0; mask < 1 << builds.length; mask++) {
      if (!fullSearch && popcount(mask) > 2) continue;
      let lost = 0;
      builds.forEach((build, i) => {
        if (mask & 1 << i) lost += build.slots.length;
      });
      candidates.push({ mask, lost });
    }
    candidates.sort((a, b) => a.lost - b.lost || popcount(a.mask) - popcount(b.mask));
    let best = null;
    let exhaustive = true;
    for (const candidate of candidates) {
      if (best && candidate.lost > best.lost) break;
      const included = builds.filter((_, i) => !(candidate.mask & 1 << i));
      const attempt = { nodes: Math.min(NODES_PER_ATTEMPT, budget.nodes) };
      const granted = attempt.nodes;
      const solution = solve(included, allowed, attempt, best?.solution.cost ?? Infinity);
      budget.nodes -= granted - Math.max(attempt.nodes, 0);
      if (attempt.nodes <= 0) exhaustive = false;
      if (solution && (!best || solution.cost < best.solution.cost)) best = { ...candidate, solution };
      if (budget.nodes <= 0) break;
    }
    const ref = ({ index, nameHash }) => ({ index, nameHash });
    const result = { changes: [], unchanged: [], excluded: [], exhaustive };
    if (!best) {
      result.excluded = slots.map(ref);
      return result;
    }
    builds.forEach((build, i) => {
      for (const slot of build.slots) {
        if (best.mask & 1 << i) {
          result.excluded.push(ref(slot));
          continue;
        }
        const moves = [];
        for (const [perkHash, from] of slot.layout) {
          const to = best.solution.homes.get(perkHash);
          if (to !== from) moves.push({ perkHash, from, to });
        }
        moves.sort((a, b) => a.to - b.to);
        if (moves.length) result.changes.push({ ...ref(slot), moves });
        else result.unchanged.push(ref(slot));
      }
    });
    const bySlot = (a, b) => a.index - b.index;
    result.changes.sort(bySlot);
    result.unchanged.sort(bySlot);
    result.excluded.sort(bySlot);
    return result;
  }
  function solve(builds, allowed, budget, costLimit) {
    const slots = builds.flatMap((build) => build.slots);
    const slotNumber = new Map(slots.map((slot, i) => [slot, i]));
    const perkMap = /* @__PURE__ */ new Map();
    builds.forEach((build, buildIndex) => {
      for (const hash of build.perks) {
        const perk = perkMap.get(hash) ?? { hash, domain: [], builds: [], saved: [] };
        perk.builds.push(buildIndex);
        for (const slot of build.slots) {
          perk.saved.push({ slot: slotNumber.get(slot), position: slot.layout.get(hash) });
        }
        perkMap.set(hash, perk);
      }
    });
    for (const perk of perkMap.values()) {
      const positions = /* @__PURE__ */ new Set([...allowed(perk.hash), ...perk.saved.map((s) => s.position)]);
      const uses = (position) => perk.saved.filter((s) => s.position === position).length;
      perk.domain = [...positions].sort((a, b) => uses(b) - uses(a) || a - b);
    }
    const perks = [...perkMap.values()].sort(
      (a, b) => a.domain.length - b.domain.length || b.builds.length - a.builds.length
    );
    const occupied = new Array(builds.length).fill(0);
    const mismatches = new Array(slots.length).fill(0);
    const homes = /* @__PURE__ */ new Map();
    let cost = 0;
    let best = null;
    let limit = costLimit;
    const search = (depth) => {
      if (budget.nodes-- <= 0 || cost >= limit) return;
      const perk = perks[depth];
      if (!perk) {
        best = { homes: new Map(homes), cost };
        limit = cost;
        return;
      }
      for (const position of perk.domain) {
        const bit = 1 << position;
        if (perk.builds.some((b) => occupied[b] & bit)) continue;
        for (const b of perk.builds) occupied[b] |= bit;
        for (const s of perk.saved) {
          if (s.position !== position && mismatches[s.slot]++ === 0) cost++;
        }
        homes.set(perk.hash, position);
        search(depth + 1);
        for (const b of perk.builds) occupied[b] &= ~bit;
        for (const s of perk.saved) {
          if (s.position !== position && --mismatches[s.slot] === 0) cost--;
        }
        homes.delete(perk.hash);
      }
    };
    search(0);
    return best;
  }

  // src/clash.ts
  var UNSET_PLUG_HASH = 2166136261;
  var EMPTY_ARTIFACT_PLUG_HASH = 1235188590;
  var ARTIFACT_BUCKET_HASH = 1506418338;
  function indexItems(profile) {
    const map = /* @__PURE__ */ new Map();
    const add = (items) => {
      for (const item of items ?? []) {
        if (item.itemInstanceId) map.set(item.itemInstanceId, item);
      }
    };
    add(profile.profileInventory?.data?.items);
    for (const component of [profile.characterInventories, profile.characterEquipment]) {
      for (const inventory of Object.values(component?.data ?? {})) add(inventory.items);
    }
    return map;
  }
  function layoutFrom(hashes) {
    const isPerk = (h) => Boolean(h) && h !== UNSET_PLUG_HASH && h !== EMPTY_ARTIFACT_PLUG_HASH;
    const counts = /* @__PURE__ */ new Map();
    for (const h of hashes) {
      if (isPerk(h)) counts.set(h, (counts.get(h) ?? 0) + 1);
    }
    const layout = /* @__PURE__ */ new Map();
    hashes.forEach((h, i) => {
      if (isPerk(h) && counts.get(h) === 1) layout.set(h, i);
    });
    return layout;
  }
  function currentLayout(profile, instanceId) {
    const sockets = profile.itemComponents?.sockets?.data?.[instanceId]?.sockets;
    return sockets ? layoutFrom(sockets.map((s) => s.plugHash ?? 0)) : null;
  }
  var positionOf = (socketIndex) => socketIndex + 1;
  var tierKey = (artifactHash, perkHash) => `${artifactHash}:${Math.floor(perkHash / 8)}`;
  function observedPositions(profile, items) {
    const seen = /* @__PURE__ */ new Map();
    const note = (artifactHash, layout) => {
      for (const [perkHash, socketIndex] of layout) {
        const key = tierKey(artifactHash, perkHash);
        seen.set(key, (seen.get(key) ?? /* @__PURE__ */ new Set()).add(socketIndex));
      }
    };
    for (const [instanceId, item] of items) {
      if (item.bucketHash !== ARTIFACT_BUCKET_HASH) continue;
      const current = currentLayout(profile, instanceId);
      if (current) note(item.itemHash, current);
    }
    for (const { loadouts = [] } of Object.values(profile.characterLoadouts?.data ?? {})) {
      for (const loadout of loadouts) {
        for (const saved of loadout.items ?? []) {
          const item = items.get(saved.itemInstanceId);
          if (item?.bucketHash === ARTIFACT_BUCKET_HASH) note(item.itemHash, layoutFrom(saved.plugItemHashes ?? []));
        }
      }
    }
    return seen;
  }
  function analyze(profile) {
    const items = indexItems(profile);
    const seen = observedPositions(profile, items);
    const characters = [];
    for (const [characterId, { loadouts = [] }] of Object.entries(profile.characterLoadouts?.data ?? {})) {
      const slots = [];
      let savedWithoutArtifact = 0;
      loadouts.forEach((loadout, index) => {
        const saved = (loadout.items ?? []).filter((it) => it.itemInstanceId && it.itemInstanceId !== "0");
        if (!saved.length) return;
        const artifact = saved.find((it) => items.get(it.itemInstanceId)?.bucketHash === ARTIFACT_BUCKET_HASH);
        const layout = artifact ? layoutFrom(artifact.plugItemHashes ?? []) : null;
        if (!artifact || !layout?.size) {
          savedWithoutArtifact++;
          return;
        }
        slots.push({
          index,
          nameHash: loadout.nameHash,
          instanceId: artifact.itemInstanceId,
          artifactHash: items.get(artifact.itemInstanceId).itemHash,
          layout
        });
      });
      const results = slots.map((slot) => {
        const current = currentLayout(profile, slot.instanceId);
        const brokenNow = [];
        for (const [perkHash, socketIndex] of slot.layout) {
          const currentIndex = current?.get(perkHash);
          if (currentIndex !== void 0 && currentIndex !== socketIndex) {
            brokenNow.push({ perkHash, saved: positionOf(socketIndex), current: positionOf(currentIndex) });
          }
        }
        const clashes = [];
        for (const other of slots) {
          if (other === slot || other.instanceId !== slot.instanceId) continue;
          const perks = [];
          for (const [perkHash, socketIndex] of slot.layout) {
            const otherIndex = other.layout.get(perkHash);
            if (otherIndex !== void 0 && otherIndex !== socketIndex) {
              perks.push({ perkHash, here: positionOf(socketIndex), there: positionOf(otherIndex) });
            }
          }
          if (perks.length) clashes.push({ otherIndex: other.index, otherNameHash: other.nameHash, perks });
        }
        return {
          index: slot.index,
          nameHash: slot.nameHash,
          artifactHash: slot.artifactHash,
          currentKnown: current !== null,
          // A clash comes from saved data and is certain. "Broken now" depends on
          // Bungie's report of the artifact, which can lag behind in-game edits.
          status: clashes.length ? "clash" : brokenNow.length ? "broken" : "ok",
          brokenNow,
          clashes
        };
      });
      const plans = [];
      const clashing = new Set(results.filter((r) => r.clashes.length).map((r) => r.index));
      const byArtifact = /* @__PURE__ */ new Map();
      for (const slot of slots) byArtifact.set(slot.instanceId, [...byArtifact.get(slot.instanceId) ?? [], slot]);
      for (const group of byArtifact.values()) {
        if (!group.some((slot) => clashing.has(slot.index))) continue;
        const artifactHash = group[0].artifactHash;
        const plan = planLayout(group, (perkHash) => [...seen.get(tierKey(artifactHash, perkHash)) ?? []]);
        plans.push({
          ...plan,
          artifactHash,
          changes: plan.changes.map((change) => ({
            ...change,
            moves: change.moves.map((m) => ({ ...m, from: positionOf(m.from), to: positionOf(m.to) }))
          }))
        });
      }
      characters.push({
        characterId,
        classType: profile.characters?.data?.[characterId]?.classType ?? -1,
        slots: results,
        plans,
        savedWithoutArtifact
      });
    }
    return { characters };
  }
  function summarize(analysis) {
    const summary = { slots: 0, broken: 0, clashing: 0 };
    for (const character of analysis?.characters ?? []) {
      for (const slot of character.slots) {
        summary.slots++;
        if (slot.status === "clash") summary.clashing++;
        else if (slot.status === "broken") summary.broken++;
      }
    }
    return summary;
  }
  function debugSnapshot(profile) {
    const items = indexItems(profile);
    const labels = /* @__PURE__ */ new Map();
    const artifacts = [];
    for (const [instanceId, item] of items) {
      if (item.bucketHash !== ARTIFACT_BUCKET_HASH) continue;
      const id = `A${artifacts.length + 1}`;
      labels.set(instanceId, id);
      const sockets = profile.itemComponents?.sockets?.data?.[instanceId]?.sockets;
      const plugs = profile.itemComponents?.reusablePlugs?.data?.[instanceId]?.plugs;
      artifacts.push({
        id,
        itemHash: item.itemHash,
        current: sockets ? sockets.map((s) => s.plugHash ?? 0) : null,
        allowed: plugs ? Object.fromEntries(
          Object.entries(plugs).map(([socketIndex, list]) => [
            socketIndex,
            list.map((p) => ({ hash: p.plugItemHash, canInsert: p.canInsert, enabled: p.enabled }))
          ])
        ) : null
      });
    }
    const characters = Object.entries(profile.characterLoadouts?.data ?? {}).map(([characterId, { loadouts = [] }]) => ({
      classType: profile.characters?.data?.[characterId]?.classType ?? -1,
      slots: loadouts.flatMap((loadout, slot) => {
        const saved = (loadout.items ?? []).filter((it) => it.itemInstanceId && it.itemInstanceId !== "0");
        if (!saved.length) return [];
        const artifact = saved.find((it) => labels.has(it.itemInstanceId));
        return [
          {
            slot,
            nameHash: loadout.nameHash,
            artifact: artifact ? labels.get(artifact.itemInstanceId) : null,
            plugs: artifact?.plugItemHashes ?? null,
            itemCount: saved.length
          }
        ];
      })
    }));
    return { artifacts, characters };
  }
  function makeSlotPairKey(characterId, slotIndexA, slotIndexB) {
    const lowerSlotIndex = Math.min(slotIndexA, slotIndexB);
    const higherSlotIndex = Math.max(slotIndexA, slotIndexB);
    return `${characterId}:${lowerSlotIndex}:${higherSlotIndex}`;
  }
  function findNewClashes(previousAnalysis, currentAnalysis) {
    const previousPairKeys = /* @__PURE__ */ new Set();
    for (const character of previousAnalysis.characters) {
      for (const slot of character.slots) {
        for (const clash of slot.clashes) {
          previousPairKeys.add(makeSlotPairKey(character.characterId, slot.index, clash.otherIndex));
        }
      }
    }
    const newClashes = [];
    const reportedPairKeys = /* @__PURE__ */ new Set();
    for (const character of currentAnalysis.characters) {
      for (const slot of character.slots) {
        for (const clash of slot.clashes) {
          const pairKey = makeSlotPairKey(character.characterId, slot.index, clash.otherIndex);
          if (previousPairKeys.has(pairKey) || reportedPairKeys.has(pairKey)) continue;
          reportedPairKeys.add(pairKey);
          const thisSlotComesFirst = slot.index < clash.otherIndex;
          newClashes.push({
            characterId: character.characterId,
            classType: character.classType,
            firstSlotIndex: thisSlotComesFirst ? slot.index : clash.otherIndex,
            firstSlotNameHash: thisSlotComesFirst ? slot.nameHash : clash.otherNameHash,
            secondSlotIndex: thisSlotComesFirst ? clash.otherIndex : slot.index,
            secondSlotNameHash: thisSlotComesFirst ? clash.otherNameHash : slot.nameHash,
            perkHashes: clash.perks.map((clashPerk) => clashPerk.perkHash)
          });
        }
      }
    }
    return newClashes;
  }
  function debugItemHashes(snapshot) {
    const hashes = /* @__PURE__ */ new Set();
    for (const artifact of snapshot.artifacts) {
      hashes.add(artifact.itemHash);
      for (const h of artifact.current ?? []) hashes.add(h);
      for (const list of Object.values(artifact.allowed ?? {})) for (const p of list) hashes.add(p.hash);
    }
    for (const character of snapshot.characters) {
      for (const slot of character.slots) for (const h of slot.plugs ?? []) hashes.add(h);
    }
    hashes.delete(0);
    hashes.delete(UNSET_PLUG_HASH);
    return hashes;
  }
  function neededHashes(analysis) {
    const items = /* @__PURE__ */ new Set();
    const loadoutNames = /* @__PURE__ */ new Set();
    for (const character of analysis.characters) {
      for (const plan of character.plans) {
        for (const change of plan.changes) for (const move of change.moves) items.add(move.perkHash);
      }
      for (const slot of character.slots) {
        items.add(slot.artifactHash);
        loadoutNames.add(slot.nameHash);
        for (const perk of slot.brokenNow) items.add(perk.perkHash);
        for (const clash of slot.clashes) {
          loadoutNames.add(clash.otherNameHash);
          for (const perk of clash.perks) items.add(perk.perkHash);
        }
      }
    }
    return { items, loadoutNames };
  }

  // src/inject.ts
  var PROFILE_RE = /\/Platform\/Destiny2\/\d+\/Profile\/\d+\//i;
  var MANIFEST_RE = /\/Platform\/Destiny2\/Manifest\/?(\?|$)/i;
  var CACHE_KEY = "dim-artifact-slot-check:names:v1";
  var CLASS_NAMES = { 0: "Titan", 1: "Hunter", 2: "Warlock" };
  var LOG_TAG = "[Artifact Slot Check]";
  var TOAST_VISIBLE_MILLISECONDS = 1e4;
  var MAX_CLASHES_IN_TOAST = 3;
  var CSS = `
:host{all:initial;position:fixed;left:16px;bottom:16px;z-index:2147483000;
  font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#e8e9f0}
*{box-sizing:border-box}
[hidden]{display:none!important}
button{font:inherit;color:inherit}
button:focus-visible,summary:focus-visible{outline:2px solid #8ab4ff;outline-offset:2px;border-radius:4px}
.pill{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 14px 0 11px;
  border-radius:17px;border:1px solid #3a3d52;background:#1c1e2b;font-weight:600;cursor:pointer;
  box-shadow:0 4px 14px rgba(0,0,0,.45);transition:border-color .15s,background .15s}
.pill:hover{background:#252839;border-color:#565a78}
.dot{width:9px;height:9px;border-radius:50%;background:#6c7086;flex:none}
.ok .dot,.dot.ok{background:#5fd38d}.clash .dot,.dot.clash{background:#ff6b5e}.broken .dot,.dot.broken{background:#f5b942}
.panel{position:absolute;left:0;bottom:44px;width:min(420px,calc(100vw - 32px));max-height:min(72vh,660px);
  display:flex;flex-direction:column;border:1px solid #3a3d52;border-radius:10px;background:#1c1e2b;
  box-shadow:0 10px 32px rgba(0,0,0,.6);overflow:hidden}
.head{display:flex;align-items:center;gap:6px;padding:10px 10px 10px 14px;border-bottom:1px solid #2e3145}
.title{flex:1;font-size:14px;font-weight:700}
.icon{width:26px;height:26px;border:0;border-radius:5px;background:none;color:#a5a8be;font-size:15px;
  font-weight:700;line-height:1;cursor:pointer}
.icon:hover,.icon[aria-pressed="true"]{color:#fff;background:#2e3145}
.tabs{display:flex;gap:2px;padding:6px 10px 0;border-bottom:1px solid #2e3145}
.tab{display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border:0;border-bottom:2px solid transparent;
  background:none;color:#a5a8be;font-weight:600;cursor:pointer;border-radius:5px 5px 0 0}
.tab:hover{color:#e8e9f0;background:#242636}
.tab[aria-selected="true"]{color:#e8e9f0;border-bottom-color:#8ab4ff}
.filters{display:flex;flex-wrap:wrap;gap:6px;padding:9px 14px 0}
.filter{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:12px;border:1px solid #3a3d52;
  background:none;color:#a5a8be;font-size:12px;font-weight:600;cursor:pointer}
.filter:hover{border-color:#565a78;color:#e8e9f0}
.filter[aria-pressed="true"]{background:#2e3145;border-color:#6d7396;color:#fff}
.filter .dot{width:7px;height:7px}
.body{overflow-y:auto;padding:10px 14px 12px;color-scheme:dark;scrollbar-width:thin;scrollbar-color:#4a4e68 transparent}
.char{margin:2px 0 8px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#a5a8be}
.note{color:#a5a8be;font-size:12px;margin:8px 0 0}
.muted{color:#a5a8be}

.slot{margin-bottom:5px;border-radius:7px;background:#242636;border-left:3px solid #5fd38d}
.slot.clash{border-left-color:#ff6b5e}.slot.broken{border-left-color:#f5b942}
.row{display:flex;align-items:baseline;gap:8px;padding:7px 10px;list-style:none}
.row::-webkit-details-marker{display:none}
summary.row{cursor:pointer}
summary.row::before{content:"\u25B8";color:#a5a8be;font-size:10px;width:8px;flex:none}
details[open]>summary.row::before{content:"\u25BE"}
div.row{padding-left:26px}
.name{font-weight:600;white-space:nowrap}
.art{flex:1;min-width:0;color:#a5a8be;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chip{flex:none;font-size:11px;font-weight:700;color:#5fd38d}
.clash>.row .chip{color:#ff6b5e}.broken>.row .chip{color:#f5b942}
.detail{padding:0 10px 9px 26px;font-size:12px;color:#d3d5e3}
.label{margin:6px 0 3px;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#a5a8be}
.label:first-child{margin-top:0}
.kv{display:grid;grid-template-columns:minmax(0,auto) 1fr;gap:2px 12px}
.kv .k{font-weight:600;color:#e8e9f0}
.kv .v{color:#c3c6d6}

.card{margin-bottom:8px;border-radius:8px;border:1px solid #35507a;background:#1f2738}
.card.warn{border-color:#6b5a2a;background:#2a2619}
.card.alert{border-color:#7a3a38;background:#2f1d1f}
.card.alert .card-title{color:#ff9d94}
.alert-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 11px}
.card>summary{display:flex;align-items:baseline;gap:8px;padding:9px 11px;cursor:pointer;list-style:none}
.card>summary::-webkit-details-marker{display:none}
.card>summary::before{content:"\u25B8";color:#a5a8be;font-size:10px;width:8px;flex:none}
.card[open]>summary::before{content:"\u25BE"}
.card-title{flex:1;font-weight:700;color:#a9c8ff}
.card.warn .card-title{color:#f5cf7a}
.badge{flex:none;font-size:11px;color:#a5a8be}
.card-body{padding:0 11px 11px;font-size:12px;color:#d3d5e3}
.lead{margin:0 0 8px;color:#c3c6d6}
.step{padding:7px 9px;margin-bottom:5px;border-radius:6px;background:rgba(255,255,255,.045)}
.step-title{font-weight:700;color:#e8e9f0;margin-bottom:3px}
.arrow{color:#8ab4ff;padding:0 3px}
.facts{margin-top:8px}
ol,ul{margin:3px 0 0;padding-left:18px}
li{margin:2px 0}

.help h3{margin:14px 0 5px;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#a9c8ff}
.help h3:first-of-type{margin-top:8px}
.help p{margin:0 0 6px;color:#d3d5e3}
.help li{color:#d3d5e3}
.legend{display:grid;grid-template-columns:auto 1fr;gap:5px 9px;align-items:baseline}
.legend .dot{position:relative;top:1px}
.back{border:1px solid #3a3d52;background:none;color:#d3d5e3;font-size:12px;padding:3px 10px;border-radius:5px;cursor:pointer}
.back:hover{background:#2e3145}

.toast{position:fixed;top:16px;right:16px;width:min(340px,calc(100vw - 32px));padding:11px 14px 12px;
  border-radius:10px;border:1px solid #7a3a38;background:#2a1b1d;box-shadow:0 10px 32px rgba(0,0,0,.6);
  animation:toast-in .18s ease-out}
@keyframes toast-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.toast{animation:none}}
.toast-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px}
.toast-title{font-weight:700;color:#ff9d94}
.toast-line{margin-top:3px;font-size:12px;color:#e3e4ee}
.toast-line.muted{color:#a5a8be}
.toast-actions{margin-top:10px}
.foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 14px;
  border-top:1px solid #2e3145;color:#a5a8be;font-size:11px}
.export{flex:none;border:1px solid #3a3d52;background:none;color:#d3d5e3;font-size:11px;
  padding:3px 9px;border-radius:5px;cursor:pointer}
.export:hover:not(:disabled){background:#2e3145;border-color:#565a78}
.export:disabled{opacity:.5;cursor:default}
`;
  function start() {
    if (window.__dimArtifactSlotCheck || typeof window.fetch !== "function") return;
    const origFetch = window.fetch;
    const state = {
      analysis: null,
      updatedAt: null,
      paths: null,
      open: false,
      debug: null,
      tab: null,
      filter: "all",
      view: "main",
      newClashes: []
    };
    const names = readCache();
    const notFound = /* @__PURE__ */ new Set();
    const extraItemHashes = /* @__PURE__ */ new Set();
    let namesJob = Promise.resolve();
    const toggled = /* @__PURE__ */ new Set();
    let shownKey = null;
    let toastTimerId;
    let ui = null;
    window.fetch = function(...args) {
      const promise = origFetch.apply(this, args);
      try {
        const input = args[0];
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
        const kind = !url ? null : PROFILE_RE.test(url) ? "profile" : MANIFEST_RE.test(url) ? "manifest" : null;
        if (kind) {
          promise.then(async (res) => {
            if (res?.ok) onData(kind, await res.clone().json());
          }).catch(() => {
          });
        }
      } catch {
      }
      return promise;
    };
    function onData(kind, json) {
      try {
        if (!json?.Response) return;
        if (kind === "profile") {
          const profile = json.Response;
          if (!profile.characterLoadouts) return;
          const previousAnalysis = state.analysis;
          state.analysis = analyze(profile);
          let freshClashes = [];
          if (previousAnalysis) {
            freshClashes = findNewClashes(previousAnalysis, state.analysis);
            state.newClashes.push(...freshClashes);
          }
          state.debug = debugSnapshot(profile);
          state.updatedAt = /* @__PURE__ */ new Date();
          render();
          if (freshClashes.length > 0) {
            void ensureNames().then(() => showToast(freshClashes));
          }
        } else {
          const byLang = json.Response.jsonWorldComponentContentPaths;
          if (!byLang) return;
          const lang = (document.documentElement.lang || "en").toLowerCase();
          const baseLang = lang.split("-")[0] ?? lang;
          state.paths = byLang[lang] ?? byLang[baseLang] ?? byLang.en ?? null;
        }
        void ensureNames();
      } catch (e) {
        console.warn(LOG_TAG, e);
      }
    }
    function readCache() {
      try {
        const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
        if (parsed?.items && parsed.loadouts) return parsed;
      } catch {
      }
      return { items: {}, loadouts: {} };
    }
    function writeCache() {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(names));
      } catch {
      }
    }
    function missingNames() {
      if (!state.analysis) return { items: [], loadouts: [] };
      const needed = neededHashes(state.analysis);
      return {
        items: [...needed.items, ...extraItemHashes].filter((h) => !names.items[h] && !notFound.has(`i${h}`)),
        loadouts: [...needed.loadoutNames].filter((h) => !names.loadouts[h] && !notFound.has(`l${h}`))
      };
    }
    async function fetchTable(path) {
      const res = await origFetch(`https://www.bungie.net${path}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }
    function ensureNames() {
      namesJob = namesJob.then(loadMissingNames);
      return namesJob;
    }
    async function loadMissingNames() {
      const paths = state.paths;
      if (!paths) return;
      const missing = missingNames();
      if (!missing.items.length && !missing.loadouts.length) return;
      const jobs = [];
      const itemPath = paths.DestinyInventoryItemLiteDefinition ?? paths.DestinyInventoryItemDefinition;
      if (missing.items.length && itemPath) {
        jobs.push(
          fetchTable(itemPath).then((defs) => {
            for (const h of missing.items) {
              const name = defs[h]?.displayProperties?.name;
              if (name) names.items[h] = name;
              else notFound.add(`i${h}`);
            }
          })
        );
      }
      const loadoutNamePath = paths.DestinyLoadoutNameDefinition;
      if (missing.loadouts.length && loadoutNamePath) {
        jobs.push(
          fetchTable(loadoutNamePath).then((defs) => {
            for (const h of missing.loadouts) {
              const name = defs[h]?.name;
              if (name) names.loadouts[h] = name;
              else notFound.add(`l${h}`);
            }
          })
        );
      }
      const results = await Promise.allSettled(jobs);
      for (const result of results) {
        if (result.status === "rejected") console.warn(LOG_TAG, "could not load names", result.reason);
      }
      writeCache();
      render();
    }
    async function exportDebug() {
      const snapshot = state.debug;
      if (!snapshot) return;
      for (const h of debugItemHashes(snapshot)) extraItemHashes.add(h);
      await ensureNames();
      const itemNames = {};
      for (const h of debugItemHashes(snapshot)) {
        const name = names.items[h];
        if (name) itemNames[h] = name;
      }
      const report = {
        tool: "dim-artifact-slot-check",
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        dataFrom: state.updatedAt?.toISOString() ?? null,
        host: location.host,
        language: document.documentElement.lang || null,
        namesAvailable: Boolean(state.paths),
        constants: { unsetPlugHash: UNSET_PLUG_HASH, artifactBucketHash: ARTIFACT_BUCKET_HASH },
        snapshot,
        // Character ids are dropped; class and slots are enough to troubleshoot.
        analysis: state.analysis?.characters.map(({ characterId: _omitted, ...rest }) => rest) ?? null,
        itemNames,
        loadoutNames: names.loadouts
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
      const link = el("a");
      link.href = url;
      link.download = "artifact-slot-check-debug.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1e4);
    }
    const perkName = (hash) => names.items[hash] ?? `Perk ${hash}`;
    function slotLabel(index, nameHash) {
      const name = names.loadouts[nameHash];
      return `Slot ${index + 1}${name ? ` \xB7 ${name}` : ""}`;
    }
    function ordinal(n) {
      const rem10 = n % 10;
      const rem100 = n % 100;
      if (rem10 === 1 && rem100 !== 11) return `${n}st`;
      if (rem10 === 2 && rem100 !== 12) return `${n}nd`;
      if (rem10 === 3 && rem100 !== 13) return `${n}rd`;
      return `${n}th`;
    }
    function el(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== void 0) node.textContent = text;
      return node;
    }
    function mount() {
      if (ui || !document.body) return;
      const host = el("div");
      host.id = "dim-artifact-slot-check";
      const shadow = host.attachShadow({ mode: "open" });
      try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(CSS);
        shadow.adoptedStyleSheets = [sheet];
      } catch {
        shadow.appendChild(el("style", void 0, CSS));
      }
      const panel = el("div", "panel");
      panel.hidden = true;
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "Artifact slot check");
      const head = el("div", "head");
      const close = el("button", "icon", "\xD7");
      close.type = "button";
      close.setAttribute("aria-label", "Close");
      const help = el("button", "icon", "?");
      help.type = "button";
      help.title = "What this is and how to use it";
      help.setAttribute("aria-label", "Help");
      help.addEventListener("click", () => {
        state.view = state.view === "help" ? "main" : "help";
        render();
      });
      head.append(el("div", "title", "Artifact slot check"), help, close);
      const filters = el("div", "filters");
      filters.hidden = true;
      const body = el("div", "body");
      const foot = el("div", "foot");
      const footText = el("span");
      const exportButton = el("button", "export", "Export debug file");
      exportButton.type = "button";
      exportButton.title = "Saves the artifact data behind this panel as a JSON file. No account or item ids.";
      exportButton.addEventListener("click", () => {
        exportButton.disabled = true;
        exportDebug().catch((e) => console.warn(LOG_TAG, "export failed", e)).finally(() => render());
      });
      foot.append(footText, exportButton);
      const tabs = el("div", "tabs");
      tabs.setAttribute("role", "tablist");
      tabs.hidden = true;
      tabs.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        const all = [...tabs.querySelectorAll(".tab")];
        const next = all.findIndex((t) => t.getAttribute("aria-selected") === "true") + (e.key === "ArrowRight" ? 1 : -1);
        all[(next + all.length) % all.length]?.click();
      });
      panel.append(head, tabs, filters, body, foot);
      const pill = el("button", "pill");
      pill.type = "button";
      pill.setAttribute("aria-expanded", "false");
      const label = el("span", void 0, "Artifact check");
      label.setAttribute("aria-live", "polite");
      pill.append(el("span", "dot"), label);
      const toast = el("div", "toast");
      toast.hidden = true;
      toast.addEventListener("mouseenter", () => window.clearTimeout(toastTimerId));
      toast.addEventListener("mouseleave", startToastTimer);
      toast.addEventListener("focusin", () => window.clearTimeout(toastTimerId));
      toast.addEventListener("focusout", startToastTimer);
      toast.addEventListener("keydown", (event) => {
        if (event.key === "Escape") hideToast();
      });
      shadow.append(panel, pill, toast);
      const setOpen = (open) => {
        if (open) hideToast();
        const firstNewClash = state.newClashes[0];
        if (open && firstNewClash) {
          state.tab = firstNewClash.characterId;
        }
        if (!open) {
          state.newClashes = [];
        }
        state.open = open;
        panel.hidden = !open;
        pill.setAttribute("aria-expanded", String(open));
        render();
      };
      pill.addEventListener("click", () => setOpen(!state.open));
      close.addEventListener("click", () => {
        setOpen(false);
        pill.focus();
      });
      shadow.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && state.open) {
          e.stopPropagation();
          setOpen(false);
          pill.focus();
        }
      });
      document.body.appendChild(host);
      ui = { host, pill, label, tabs, filters, help, toast, setOpen, body, footText, exportButton };
      render();
    }
    function render() {
      if (!ui) return;
      if (!ui.host.isConnected && document.body) document.body.appendChild(ui.host);
      const summary = summarize(state.analysis);
      let status = "idle";
      let text = "Artifact check: waiting for DIM";
      if (state.analysis) {
        if (summary.clashing) {
          status = "clash";
          text = `${summary.clashing} artifact ${summary.clashing === 1 ? "slot clashes" : "slots clash"}`;
        } else if (summary.broken) {
          status = "broken";
          text = "Check artifact";
        } else if (summary.slots) {
          status = "ok";
          text = "Artifact slots OK";
        } else {
          text = "No artifact loadouts";
        }
      }
      if (state.newClashes.length > 0 && !state.open) {
        status = "clash";
        text = describeNewClashesShort();
      }
      ui.pill.className = `pill ${status}`;
      ui.label.textContent = text;
      ui.help.setAttribute("aria-pressed", String(state.view === "help"));
      const body = ui.body;
      const scrollTop = body.scrollTop;
      const shownBefore = shownKey;
      body.textContent = "";
      ui.tabs.textContent = "";
      ui.filters.textContent = "";
      ui.footText.textContent = state.updatedAt ? `Checked ${state.updatedAt.toLocaleTimeString()} \xB7 updates when DIM refreshes` : "No data yet";
      ui.exportButton.disabled = !state.debug;
      if (state.view === "help") {
        ui.tabs.hidden = ui.filters.hidden = true;
        body.append(renderHelp());
        shownKey = "help";
        body.scrollTop = shownKey === shownBefore ? scrollTop : 0;
        return;
      }
      const withSlots = state.analysis?.characters.filter((c) => c.slots.length) ?? [];
      const character = withSlots.find((c) => c.characterId === state.tab) ?? withSlots.find((c) => c.slots.some((s) => s.status !== "ok")) ?? withSlots[0];
      ui.tabs.hidden = withSlots.length < 2;
      for (const c of withSlots) ui.tabs.append(renderTab(c, c === character));
      ui.filters.hidden = !character;
      if (!state.analysis) {
        body.append(el("p", "note", "Waiting for DIM to load your inventory. Refresh DIM if this does not change."));
      } else if (!character) {
        body.append(el("p", "note", "None of your saved in-game loadouts include an artifact with perks."));
      } else {
        const count = (s) => character.slots.filter((slot) => slot.status === s).length;
        const filters = [
          ["all", "All", character.slots.length],
          ["clash", "Clash", count("clash")],
          ["broken", "Check artifact", count("broken")],
          ["ok", "OK", count("ok")]
        ];
        const kinds = filters.filter(([f, , n]) => f !== "all" && n).length;
        ui.filters.hidden = kinds < 2;
        const active = kinds < 2 ? "all" : filters.find(([f, , n]) => f === state.filter && n)?.[0] ?? "all";
        for (const [filter, label, n] of kinds < 2 ? [] : filters) {
          if (!n && filter !== "all") continue;
          const chip = el("button", "filter");
          chip.type = "button";
          chip.setAttribute("aria-pressed", String(filter === active));
          if (filter !== "all") chip.append(el("span", `dot ${filter}`));
          chip.append(el("span", void 0, `${label} ${n}`));
          chip.addEventListener("click", () => {
            state.filter = filter;
            render();
          });
          ui.filters.append(chip);
        }
        if (ui.tabs.hidden) body.append(el("div", "char", CLASS_NAMES[character.classType] ?? "Character"));
        if (state.newClashes.length > 0) body.append(renderNewClashBanner());
        if (active === "all" || active === "clash") {
          for (const plan of character.plans) body.append(renderPlan(character.characterId, plan));
        }
        if (active === "all" || active === "broken") {
          for (const drift of artifactDrift(character)) body.append(renderDrift(character.characterId, drift));
        }
        for (const slot of character.slots) {
          if (active === "all" || slot.status === active) body.append(renderSlot(character.characterId, slot));
        }
        shownKey = `${character.characterId}:${active}`;
      }
      body.scrollTop = shownKey === shownBefore ? scrollTop : 0;
    }
    function foldable(className, key, openByDefault) {
      const box = el("details", className);
      box.open = toggled.has(key) ? !openByDefault : openByDefault;
      box.addEventListener("toggle", () => {
        if (box.open === openByDefault) toggled.delete(key);
        else toggled.add(key);
      });
      return box;
    }
    function pairs(rows) {
      const grid = el("div", "kv");
      for (const [k, v] of rows) grid.append(el("span", "k", k), el("span", "v", v));
      return grid;
    }
    function list(tag, lines) {
      const node = el(tag);
      for (const line of lines) node.append(el("li", void 0, line));
      return node;
    }
    function labelled(label, content) {
      return [el("div", "label", label), typeof content === "string" ? el("div", void 0, content) : content];
    }
    const slotNames = (refs) => refs.map((r) => slotLabel(r.index, r.nameHash)).join(", ");
    const artifactName = (hash) => names.items[hash] ?? "Artifact";
    function renderTab(character, selected) {
      const worst = character.slots.some((s) => s.status === "clash") ? "clash" : character.slots.some((s) => s.status === "broken") ? "broken" : "ok";
      const tab = el("button", `tab ${worst}`);
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      tab.append(el("span", "dot"), el("span", void 0, CLASS_NAMES[character.classType] ?? "Character"));
      tab.addEventListener("click", () => {
        state.tab = character.characterId;
        render();
        ui?.tabs.querySelector('[aria-selected="true"]')?.focus();
      });
      return tab;
    }
    function describeNewClashesShort() {
      const firstNewClash = state.newClashes[0];
      if (state.newClashes.length === 1 && firstNewClash) {
        return `New clash: slot ${firstNewClash.firstSlotIndex + 1} and slot ${firstNewClash.secondSlotIndex + 1}`;
      }
      return `${state.newClashes.length} new clashes`;
    }
    function startToastTimer() {
      window.clearTimeout(toastTimerId);
      toastTimerId = window.setTimeout(hideToast, TOAST_VISIBLE_MILLISECONDS);
    }
    function hideToast() {
      window.clearTimeout(toastTimerId);
      if (ui) ui.toast.hidden = true;
    }
    function showToast(freshClashes) {
      if (!ui || state.open) return;
      const toast = ui.toast;
      toast.textContent = "";
      const title = freshClashes.length === 1 ? "New artifact clash" : `${freshClashes.length} new artifact clashes`;
      const closeButton = el("button", "icon", "\xD7");
      closeButton.type = "button";
      closeButton.setAttribute("aria-label", "Dismiss");
      closeButton.addEventListener("click", hideToast);
      const header = el("div", "toast-head");
      header.append(el("span", "toast-title", title), closeButton);
      toast.append(header);
      for (const freshClash of freshClashes.slice(0, MAX_CLASHES_IN_TOAST)) {
        const className = CLASS_NAMES[freshClash.classType] ?? "Character";
        const firstSlotName = slotLabel(freshClash.firstSlotIndex, freshClash.firstSlotNameHash);
        const secondSlotName = slotLabel(freshClash.secondSlotIndex, freshClash.secondSlotNameHash);
        const perkNames = freshClash.perkHashes.map((perkHash) => perkName(perkHash)).join(", ");
        toast.append(
          el("div", "toast-line", `${className}: ${firstSlotName} and ${secondSlotName}`),
          el("div", "toast-line muted", perkNames)
        );
      }
      const hiddenClashCount = freshClashes.length - MAX_CLASHES_IN_TOAST;
      if (hiddenClashCount > 0) toast.append(el("div", "toast-line muted", `and ${hiddenClashCount} more`));
      const openPanelButton = el("button", "back", "Open panel");
      openPanelButton.type = "button";
      openPanelButton.addEventListener("click", () => ui?.setOpen(true));
      const actions = el("div", "toast-actions");
      actions.append(openPanelButton);
      toast.append(actions);
      toast.hidden = false;
      startToastTimer();
    }
    function renderNewClashBanner() {
      const banner = el("div", "card alert");
      const header = el("div", "alert-header");
      const title = state.newClashes.length === 1 ? "New clash since the last refresh" : `${state.newClashes.length} new clashes since the last refresh`;
      const dismissButton = el("button", "back", "Dismiss");
      dismissButton.type = "button";
      dismissButton.addEventListener("click", () => {
        state.newClashes = [];
        render();
      });
      header.append(el("span", "card-title", title), dismissButton);
      const content = el("div", "card-body");
      for (const newClash of state.newClashes) {
        const className = CLASS_NAMES[newClash.classType] ?? "Character";
        const firstSlotName = slotLabel(newClash.firstSlotIndex, newClash.firstSlotNameHash);
        const secondSlotName = slotLabel(newClash.secondSlotIndex, newClash.secondSlotNameHash);
        const perkNames = newClash.perkHashes.map((perkHash) => perkName(perkHash)).join(", ");
        const step = el("div", "step");
        step.append(
          el("div", "step-title", `${className}: ${firstSlotName} and ${secondSlotName}`),
          el("div", void 0, `They keep these perks in different positions: ${perkNames}.`)
        );
        content.append(step);
      }
      content.append(el("p", "note", 'Saving a build over a slot can cause this. See "Suggested fix" below.'));
      banner.append(header, content);
      return banner;
    }
    function renderPlan(characterId, plan) {
      const box = foldable("card", `plan:${characterId}:${plan.artifactHash}`, true);
      const summary = el("summary");
      const n = plan.changes.length;
      summary.append(
        el("span", "card-title", `Suggested fix \xB7 ${artifactName(plan.artifactHash)}`),
        el("span", "badge", n ? `${n} ${n === 1 ? "slot" : "slots"} to re-save` : "no fix found")
      );
      const content = el("div", "card-body");
      if (n) {
        content.append(el("p", "lead", "Move these perks so each one sits in the same position in every slot."));
        for (const change of plan.changes) {
          const step = el("div", "step");
          step.append(
            el("div", "step-title", slotLabel(change.index, change.nameHash)),
            pairs(change.moves.map((m) => [perkName(m.perkHash), `${ordinal(m.from)} \u2192 ${ordinal(m.to)}`]))
          );
          content.append(step);
        }
        content.append(
          ...labelled(
            "How to apply, per slot",
            list("ol", ["Equip the slot, in orbit.", "Rearrange the perks on the artifact.", "Overwrite the slot."])
          )
        );
      }
      if (plan.unchanged.length) content.append(...labelled("Already fine", slotNames(plan.unchanged)));
      if (plan.excluded.length) {
        content.append(
          ...labelled("Can't fit", slotNames(plan.excluded)),
          el("div", "muted", "It needs a perk in a position another build uses, so it will keep clashing.")
        );
      }
      content.append(
        el(
          "p",
          "note",
          "Only positions already seen in your loadouts are suggested." + (plan.exhaustive ? "" : " The search was cut short, so a shorter fix may exist.")
        )
      );
      box.append(summary, content);
      return box;
    }
    function artifactDrift(character) {
      const planned = new Set(character.plans.map((p) => p.artifactHash));
      const drifts = /* @__PURE__ */ new Map();
      for (const slot of character.slots) {
        if (planned.has(slot.artifactHash) || !slot.brokenNow.length) continue;
        const drift = drifts.get(slot.artifactHash) ?? { artifactHash: slot.artifactHash, moves: /* @__PURE__ */ new Map(), slots: 0 };
        drift.slots++;
        for (const p of slot.brokenNow) drift.moves.set(p.perkHash, { from: p.current, to: p.saved });
        drifts.set(slot.artifactHash, drift);
      }
      return [...drifts.values()];
    }
    function renderDrift(characterId, drift) {
      const box = foldable("card warn", `drift:${characterId}:${drift.artifactHash}`, true);
      const summary = el("summary");
      summary.append(
        el("span", "card-title", `Check artifact \xB7 ${artifactName(drift.artifactHash)}`),
        el("span", "badge", `${drift.slots} ${drift.slots === 1 ? "slot" : "slots"} affected`)
      );
      const content = el("div", "card-body");
      content.append(
        el("p", "lead", "Your slots agree with each other, but Bungie reports the artifact arranged differently."),
        pairs(
          [...drift.moves].map(([perkHash, m]) => [
            perkName(perkHash),
            `reported ${ordinal(m.from)}, saved ${ordinal(m.to)}`
          ])
        ),
        ...labelled(
          "What to do",
          list("ul", [
            "Looks right in game? Ignore this. Bungie can be slow to report in-game changes.",
            "Otherwise, move the perks on the artifact to the saved positions. No re-saving needed."
          ])
        )
      );
      box.append(summary, content);
      return box;
    }
    function renderSlot(characterId, slot) {
      const chip = slot.status === "clash" ? "Clash" : slot.status === "broken" ? "Check artifact" : "OK";
      const rowContent = [
        el("span", "name", slotLabel(slot.index, slot.nameHash)),
        el("span", "art", artifactName(slot.artifactHash)),
        el("span", "chip", chip)
      ];
      if (slot.status === "ok") {
        const box2 = el("div", `slot ${slot.status}`);
        const row2 = el("div", "row");
        row2.append(...rowContent);
        box2.append(row2);
        return box2;
      }
      const box = foldable(`slot ${slot.status}`, `slot:${characterId}:${slot.index}`, false);
      const row = el("summary", "row");
      row.append(...rowContent);
      const detail = el("div", "detail");
      if (slot.clashes.length) {
        const byPerk = /* @__PURE__ */ new Map();
        for (const clash of slot.clashes) {
          for (const p of clash.perks) {
            const entry = byPerk.get(p.perkHash) ?? { here: p.here, there: /* @__PURE__ */ new Map() };
            entry.there.set(p.there, [...entry.there.get(p.there) ?? [], String(clash.otherIndex + 1)]);
            byPerk.set(p.perkHash, entry);
          }
        }
        detail.append(
          ...labelled(
            "Clashes with other slots",
            pairs(
              [...byPerk].map(([perkHash, entry]) => [
                perkName(perkHash),
                `${ordinal(entry.here)} here \xB7 ` + [...entry.there].map(([position, others]) => `${ordinal(position)} in slot${others.length > 1 ? "s" : ""} ${others.join(", ")}`).join(" \xB7 ")
              ])
            )
          )
        );
      }
      if (slot.brokenNow.length) {
        detail.append(
          ...labelled(
            "Artifact reported differently",
            pairs(
              slot.brokenNow.map((p) => [perkName(p.perkHash), `saved ${ordinal(p.saved)}, reported ${ordinal(p.current)}`])
            )
          )
        );
      }
      box.append(row, detail);
      return box;
    }
    function renderHelp() {
      const help = el("div", "help");
      const back = el("button", "back", "\u2190 Back");
      back.type = "button";
      back.addEventListener("click", () => {
        state.view = "main";
        render();
      });
      const section = (title, ...content) => [el("h3", void 0, title), ...content];
      const legend = el("div", "legend");
      const legendRows = [
        ["ok", "OK: nothing to do."],
        ["clash", "Clash: this slot and another keep a shared perk in different positions. Equipping one breaks the other."],
        ["broken", "Check artifact: the slot is fine, but Bungie reports the artifact arranged differently. Often just Bungie's data running behind."]
      ];
      for (const [status, text] of legendRows) legend.append(el("span", `dot ${status}`), el("span", void 0, text));
      help.append(
        back,
        ...section(
          "What this checks",
          el(
            "p",
            void 0,
            'A saved in-game loadout remembers the position of each artifact perk. If a perk sits in a different position when you equip the loadout, the game leaves it out and shows "Contains items with invalid mods".'
          ),
          el("p", void 0, "This panel compares your saved slots and warns you before that happens.")
        ),
        ...section("Colours", legend),
        ...section(
          "Fixing a clash",
          el("p", void 0, 'Open "Suggested fix". For each slot it lists:'),
          list("ol", [
            "Equip the slot, in orbit.",
            "On the artifact, move the listed perks to the new positions.",
            "Overwrite the slot from the in-game loadout screen."
          ]),
          el("p", "note", `Some builds cannot share a layout. Those are listed under "Can't fit".`)
        ),
        ...section(
          "Finding your way around",
          list("ul", [
            "Tabs switch between your classes.",
            "The chips under the tabs filter slots by status.",
            "Click a slot to see which perks are involved.",
            "The panel updates each time DIM refreshes."
          ])
        ),
        ...section(
          "Good habits",
          list("ul", [
            "Save your builds to in-game slots in one sitting.",
            "Avoid rearranging artifact perks by hand unless a fix asks for it.",
            "Check the dot before starting an activity."
          ])
        ),
        ...section(
          "Your data",
          el(
            "p",
            void 0,
            'Everything comes from the data DIM already downloads. Nothing is sent anywhere. "Export debug file" saves the artifact data behind this panel, with no account or item ids, for troubleshooting.'
          )
        )
      );
      return help;
    }
    if (document.body) mount();
    else document.addEventListener("DOMContentLoaded", mount);
    window.__dimArtifactSlotCheck = { core: clash_exports, getState: () => state };
  }
  start();
})();
