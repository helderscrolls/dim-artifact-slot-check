/*
 * Works out a "home" position for every artifact perk so that saved slots
 * stop clashing: a perk shared by several slots sits in the same position in
 * all of them.
 *
 * Not every set of builds can share a layout. When they cannot, the plan
 * leaves out as few slots as possible and, among the options that keep the
 * same number of slots, asks for the fewest slots to be re-saved.
 *
 * Pure logic: no DOM, no network. Positions in here are socket indices
 * (0-based); callers convert to 1-based for display.
 */

export interface PlanInput {
  /** 0-based in-game loadout slot. */
  index: number;
  nameHash: number;
  /** Perk hash -> socket index. */
  layout: ReadonlyMap<number, number>;
}

export interface PlanMove {
  perkHash: number;
  from: number;
  to: number;
}

export interface PlanChange {
  index: number;
  nameHash: number;
  moves: PlanMove[];
}

export interface SlotRef {
  index: number;
  nameHash: number;
}

export interface PlanResult {
  /** Slots to re-save, with the perks to move. */
  changes: PlanChange[];
  /** Slots that already match the layout. */
  unchanged: SlotRef[];
  /** Slots that cannot share a layout with the rest. */
  excluded: SlotRef[];
  /** False when the search ran out of budget, so a better plan may exist. */
  exhaustive: boolean;
}

/** Slots with the same set of perks, whatever order they are saved in. */
interface Build {
  perks: number[];
  slots: PlanInput[];
}

interface Solution {
  homes: Map<number, number>;
  cost: number;
}

const NODE_BUDGET = 400_000;
const NODES_PER_ATTEMPT = 40_000;
/** Above this many distinct builds, only try leaving out one or two. */
const MAX_BUILDS_FOR_FULL_SEARCH = 12;

const popcount = (n: number) => {
  let count = 0;
  for (let v = n; v; v &= v - 1) count++;
  return count;
};

/**
 * @param allowed positions (socket indices) a perk may be placed in
 */
export function planLayout(slots: PlanInput[], allowed: (perkHash: number) => number[]): PlanResult {
  const byPerkSet = new Map<string, Build>();
  for (const slot of slots) {
    const perks = [...slot.layout.keys()].sort((a, b) => a - b);
    const key = perks.join(',');
    const build = byPerkSet.get(key) ?? { perks, slots: [] };
    build.slots.push(slot);
    byPerkSet.set(key, build);
  }
  const builds = [...byPerkSet.values()];
  const budget = { nodes: NODE_BUDGET };

  // Every way of leaving builds out, cheapest (fewest slots lost) first.
  const fullSearch = builds.length <= MAX_BUILDS_FOR_FULL_SEARCH;
  const candidates: { mask: number; lost: number }[] = [];
  for (let mask = 0; mask < 1 << builds.length; mask++) {
    if (!fullSearch && popcount(mask) > 2) continue;
    let lost = 0;
    builds.forEach((build, i) => {
      if (mask & (1 << i)) lost += build.slots.length;
    });
    candidates.push({ mask, lost });
  }
  candidates.sort((a, b) => a.lost - b.lost || popcount(a.mask) - popcount(b.mask));

  let best: { mask: number; lost: number; solution: Solution } | null = null;
  let exhaustive = true;
  for (const candidate of candidates) {
    if (best && candidate.lost > best.lost) break;
    const included = builds.filter((_, i) => !(candidate.mask & (1 << i)));
    // Each attempt gets its own cap, so one hard case cannot starve the rest.
    const attempt = { nodes: Math.min(NODES_PER_ATTEMPT, budget.nodes) };
    const granted = attempt.nodes;
    const solution = solve(included, allowed, attempt, best?.solution.cost ?? Infinity);
    budget.nodes -= granted - Math.max(attempt.nodes, 0);
    if (attempt.nodes <= 0) exhaustive = false;
    if (solution && (!best || solution.cost < best.solution.cost)) best = { ...candidate, solution };
    if (budget.nodes <= 0) break;
  }

  const ref = ({ index, nameHash }: PlanInput): SlotRef => ({ index, nameHash });
  const result: PlanResult = { changes: [], unchanged: [], excluded: [], exhaustive };
  if (!best) {
    // Out of budget before anything fitted: report nothing rather than guess.
    result.excluded = slots.map(ref);
    return result;
  }
  builds.forEach((build, i) => {
    for (const slot of build.slots) {
      if (best.mask & (1 << i)) {
        result.excluded.push(ref(slot));
        continue;
      }
      const moves: PlanMove[] = [];
      for (const [perkHash, from] of slot.layout) {
        const to = best.solution.homes.get(perkHash)!;
        if (to !== from) moves.push({ perkHash, from, to });
      }
      moves.sort((a, b) => a.to - b.to);
      if (moves.length) result.changes.push({ ...ref(slot), moves });
      else result.unchanged.push(ref(slot));
    }
  });
  const bySlot = (a: SlotRef, b: SlotRef) => a.index - b.index;
  result.changes.sort(bySlot);
  result.unchanged.sort(bySlot);
  result.excluded.sort(bySlot);
  return result;
}

/**
 * Finds home positions for every perk of the given builds, changing as few
 * slots as possible. Returns null when no layout fits (or none cheaper than
 * `costLimit`).
 */
function solve(
  builds: Build[],
  allowed: (perkHash: number) => number[],
  budget: { nodes: number },
  costLimit: number,
): Solution | null {
  const slots = builds.flatMap((build) => build.slots);
  const slotNumber = new Map(slots.map((slot, i) => [slot, i]));

  interface Perk {
    hash: number;
    /** Candidate positions, most-used first. */
    domain: number[];
    builds: number[];
    /** Where each slot that uses this perk has it saved. */
    saved: { slot: number; position: number }[];
  }
  const perkMap = new Map<number, Perk>();
  builds.forEach((build, buildIndex) => {
    for (const hash of build.perks) {
      const perk = perkMap.get(hash) ?? { hash, domain: [], builds: [], saved: [] };
      perk.builds.push(buildIndex);
      for (const slot of build.slots) {
        perk.saved.push({ slot: slotNumber.get(slot)!, position: slot.layout.get(hash)! });
      }
      perkMap.set(hash, perk);
    }
  });
  for (const perk of perkMap.values()) {
    // A position the perk is already saved in is always legal.
    const positions = new Set([...allowed(perk.hash), ...perk.saved.map((s) => s.position)]);
    const uses = (position: number) => perk.saved.filter((s) => s.position === position).length;
    perk.domain = [...positions].sort((a, b) => uses(b) - uses(a) || a - b);
  }
  // Most constrained perks first.
  const perks = [...perkMap.values()].sort(
    (a, b) => a.domain.length - b.domain.length || b.builds.length - a.builds.length,
  );

  const occupied = new Array<number>(builds.length).fill(0);
  const mismatches = new Array<number>(slots.length).fill(0);
  const homes = new Map<number, number>();
  let cost = 0;
  let best: Solution | null = null;
  let limit = costLimit;

  const search = (depth: number): void => {
    if (budget.nodes-- <= 0 || cost >= limit) return;
    const perk = perks[depth];
    if (!perk) {
      best = { homes: new Map(homes), cost };
      limit = cost;
      return;
    }
    for (const position of perk.domain) {
      const bit = 1 << position;
      if (perk.builds.some((b) => occupied[b]! & bit)) continue;

      for (const b of perk.builds) occupied[b]! |= bit;
      for (const s of perk.saved) {
        if (s.position !== position && mismatches[s.slot]!++ === 0) cost++;
      }
      homes.set(perk.hash, position);

      search(depth + 1);

      for (const b of perk.builds) occupied[b]! &= ~bit;
      for (const s of perk.saved) {
        if (s.position !== position && --mismatches[s.slot]! === 0) cost--;
      }
      homes.delete(perk.hash);
    }
  };
  search(0);
  return best;
}
