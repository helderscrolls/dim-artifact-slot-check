/*
 * Works out a "home" position for every artifact perk, so that saved slots
 * stop clashing: a perk shared by several slots sits in the same position in
 * all of them.
 *
 * How it works, in short:
 *   1. Slots that use the same set of perks are grouped into one "build".
 *   2. Some sets of builds can never share a layout. So we try leaving out no
 *      builds first, then the cheapest ones (fewest slots lost), and so on.
 *   3. For each choice of builds to keep, a search tries every allowed
 *      position for every perk, and keeps the layout that needs the fewest
 *      slots to be re-saved.
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
  /** False when the search ran out of steps, so a better plan may exist. */
  exhaustive: boolean;
}

/** Slots that use the same set of perks, whatever order they are saved in. */
interface Build {
  perkHashes: number[];
  slots: PlanInput[];
}

/** One way of choosing which builds to leave out of the plan. */
interface LeaveOutOption {
  leftOutBuildIndexes: Set<number>;
  slotsLost: number;
}

/** A home position for every perk, and how many slots must be re-saved for it. */
interface Solution {
  homePositions: Map<number, number>;
  slotsToResave: number;
}

/** The search stops when it has taken this many steps in total. */
const TOTAL_SEARCH_STEPS = 400_000;
/** One attempt (one choice of builds to keep) may take this many steps. */
const STEPS_PER_ATTEMPT = 40_000;
/** With more distinct builds than this, only leaving out one or two is tried. */
const MAX_BUILDS_FOR_FULL_SEARCH = 12;
const MAX_BUILDS_LEFT_OUT_WHEN_MANY = 2;

/** Counts down as the search works, so it cannot run for too long. */
interface SearchBudget {
  stepsLeft: number;
}

export function planLayout(
  slots: PlanInput[],
  getAllowedPositions: (perkHash: number) => number[],
): PlanResult {
  const builds = groupSlotsIntoBuilds(slots);
  const totalBudget: SearchBudget = { stepsLeft: TOTAL_SEARCH_STEPS };

  let bestOption: { option: LeaveOutOption; solution: Solution } | null = null;
  let searchWasComplete = true;

  for (const option of listLeaveOutOptions(builds)) {
    // The options are sorted by slots lost, so once one loses more slots than
    // the best plan found so far, no later option can do better.
    if (bestOption && option.slotsLost > bestOption.option.slotsLost) break;

    const buildsToKeep = builds.filter((_, buildIndex) => !option.leftOutBuildIndexes.has(buildIndex));

    // Each attempt gets its own cap, so one hard case cannot use up everything.
    const attemptBudget: SearchBudget = { stepsLeft: Math.min(STEPS_PER_ATTEMPT, totalBudget.stepsLeft) };
    const stepsGranted = attemptBudget.stepsLeft;
    const costToBeat = bestOption ? bestOption.solution.slotsToResave : Infinity;
    const solution = findHomePositions(buildsToKeep, getAllowedPositions, attemptBudget, costToBeat);
    const stepsUsed = stepsGranted - Math.max(attemptBudget.stepsLeft, 0);
    totalBudget.stepsLeft -= stepsUsed;

    if (attemptBudget.stepsLeft <= 0) searchWasComplete = false;
    if (solution && (!bestOption || solution.slotsToResave < bestOption.solution.slotsToResave)) {
      bestOption = { option, solution };
    }
    if (totalBudget.stepsLeft <= 0) break;
  }

  const result: PlanResult = { changes: [], unchanged: [], excluded: [], exhaustive: searchWasComplete };

  if (!bestOption) {
    // Out of steps before any layout fitted: report nothing rather than guess.
    result.excluded = slots.map(toSlotRef);
    return result;
  }

  const { option: chosenOption, solution: chosenSolution } = bestOption;
  builds.forEach((build, buildIndex) => {
    for (const slot of build.slots) {
      if (chosenOption.leftOutBuildIndexes.has(buildIndex)) {
        result.excluded.push(toSlotRef(slot));
        continue;
      }

      const moves: PlanMove[] = [];
      for (const [perkHash, currentPosition] of slot.layout) {
        const homePosition = chosenSolution.homePositions.get(perkHash)!;
        if (homePosition !== currentPosition) {
          moves.push({ perkHash, from: currentPosition, to: homePosition });
        }
      }
      moves.sort((moveA, moveB) => moveA.to - moveB.to);

      if (moves.length > 0) result.changes.push({ ...toSlotRef(slot), moves });
      else result.unchanged.push(toSlotRef(slot));
    }
  });

  const bySlotNumber = (slotA: SlotRef, slotB: SlotRef) => slotA.index - slotB.index;
  result.changes.sort(bySlotNumber);
  result.unchanged.sort(bySlotNumber);
  result.excluded.sort(bySlotNumber);
  return result;
}

function toSlotRef(slot: SlotRef): SlotRef {
  return { index: slot.index, nameHash: slot.nameHash };
}

/** Puts slots that use exactly the same perks (in any order) into one build. */
function groupSlotsIntoBuilds(slots: PlanInput[]): Build[] {
  const buildsByPerkSet = new Map<string, Build>();
  for (const slot of slots) {
    const perkHashes = [...slot.layout.keys()].sort((hashA, hashB) => hashA - hashB);
    const perkSetKey = perkHashes.join(',');
    const build = buildsByPerkSet.get(perkSetKey) ?? { perkHashes, slots: [] };
    build.slots.push(slot);
    buildsByPerkSet.set(perkSetKey, build);
  }
  return [...buildsByPerkSet.values()];
}

/**
 * Every way of leaving builds out of the plan, best first: the options that
 * lose the fewest slots come first, and among those the ones that leave out
 * the fewest builds.
 */
function listLeaveOutOptions(builds: Build[]): LeaveOutOption[] {
  const tryEverySubset = builds.length <= MAX_BUILDS_FOR_FULL_SEARCH;
  const options: LeaveOutOption[] = [];

  // Count from 0 to 2^n - 1. Read each number as a row of on/off switches:
  // switch i being on means "leave build i out". That visits every subset once.
  const subsetCount = 2 ** builds.length;
  for (let switches = 0; switches < subsetCount; switches++) {
    const leftOutBuildIndexes = new Set<number>();
    builds.forEach((_, buildIndex) => {
      const switchIsOn = Math.floor(switches / 2 ** buildIndex) % 2 === 1;
      if (switchIsOn) leftOutBuildIndexes.add(buildIndex);
    });

    if (!tryEverySubset && leftOutBuildIndexes.size > MAX_BUILDS_LEFT_OUT_WHEN_MANY) continue;

    let slotsLost = 0;
    for (const buildIndex of leftOutBuildIndexes) {
      slotsLost += builds[buildIndex]!.slots.length;
    }
    options.push({ leftOutBuildIndexes, slotsLost });
  }

  // The sort is stable, so options that tie keep the order they were made in.
  options.sort(
    (optionA, optionB) =>
      optionA.slotsLost - optionB.slotsLost ||
      optionA.leftOutBuildIndexes.size - optionB.leftOutBuildIndexes.size,
  );
  return options;
}

/** The positions already taken by perks of one build while the search runs. */
interface BuildState {
  takenPositions: Set<number>;
}

/** How many of one slot's perks are not at their home position right now. */
interface SlotState {
  mismatchCount: number;
}

/** Where one slot has a perk saved today. */
interface SavedPosition {
  slotState: SlotState;
  savedPosition: number;
}

/** A perk that still needs a home position, with everything the search needs to know about it. */
interface PerkToPlace {
  perkHash: number;
  /** Positions to try, the one most slots already use first. */
  candidatePositions: number[];
  /** Perks of one build cannot share a position, so each build keeps track. */
  buildsUsingPerk: BuildState[];
  savedPositions: SavedPosition[];
}

/**
 * Finds a home position for every perk of the given builds, changing as few
 * slots as possible. Returns null when no layout fits, or none beats
 * `costToBeat` slots to re-save, or the budget runs out first.
 */
function findHomePositions(
  builds: Build[],
  getAllowedPositions: (perkHash: number) => number[],
  searchBudget: SearchBudget,
  costToBeat: number,
): Solution | null {
  const perksInSearchOrder = describePerks(builds, getAllowedPositions);

  const homePositions = new Map<number, number>();
  let slotsToResave = 0;
  let bestSolution: Solution | null = null;
  let cheapestCostToBeat = costToBeat;

  /** Gives a home to the perk at `perkNumber`, then to all the ones after it. */
  const placePerk = (perkNumber: number): void => {
    const hadStepsLeft = searchBudget.stepsLeft > 0;
    searchBudget.stepsLeft -= 1;
    if (!hadStepsLeft || slotsToResave >= cheapestCostToBeat) return;

    const perk = perksInSearchOrder[perkNumber];
    if (!perk) {
      // Every perk has a home, and it costs less than anything found before.
      bestSolution = { homePositions: new Map(homePositions), slotsToResave };
      cheapestCostToBeat = slotsToResave;
      return;
    }

    for (const position of perk.candidatePositions) {
      const positionIsFree = perk.buildsUsingPerk.every((buildState) => !buildState.takenPositions.has(position));
      if (!positionIsFree) continue;

      // Try this position...
      for (const buildState of perk.buildsUsingPerk) buildState.takenPositions.add(position);
      for (const { slotState, savedPosition } of perk.savedPositions) {
        if (savedPosition === position) continue;
        if (slotState.mismatchCount === 0) slotsToResave += 1;
        slotState.mismatchCount += 1;
      }
      homePositions.set(perk.perkHash, position);

      placePerk(perkNumber + 1);

      // ...then undo it, so the next position starts from a clean slate.
      for (const buildState of perk.buildsUsingPerk) buildState.takenPositions.delete(position);
      for (const { slotState, savedPosition } of perk.savedPositions) {
        if (savedPosition === position) continue;
        slotState.mismatchCount -= 1;
        if (slotState.mismatchCount === 0) slotsToResave -= 1;
      }
      homePositions.delete(perk.perkHash);
    }
  };

  placePerk(0);
  return bestSolution;
}

/** Collects, for every perk, the facts the search needs, in the order to try them. */
function describePerks(builds: Build[], getAllowedPositions: (perkHash: number) => number[]): PerkToPlace[] {
  const buildStates = builds.map((): BuildState => ({ takenPositions: new Set<number>() }));
  const slotStates = new Map<PlanInput, SlotState>();
  for (const build of builds) {
    for (const slot of build.slots) slotStates.set(slot, { mismatchCount: 0 });
  }

  const perksByHash = new Map<number, PerkToPlace>();
  builds.forEach((build, buildIndex) => {
    for (const perkHash of build.perkHashes) {
      const perk: PerkToPlace = perksByHash.get(perkHash) ?? {
        perkHash,
        candidatePositions: [],
        buildsUsingPerk: [],
        savedPositions: [],
      };
      perk.buildsUsingPerk.push(buildStates[buildIndex]!);
      for (const slot of build.slots) {
        perk.savedPositions.push({
          slotState: slotStates.get(slot)!,
          savedPosition: slot.layout.get(perkHash)!,
        });
      }
      perksByHash.set(perkHash, perk);
    }
  });

  for (const perk of perksByHash.values()) {
    // A position the perk is already saved in is always legal.
    const legalPositions = new Set([
      ...getAllowedPositions(perk.perkHash),
      ...perk.savedPositions.map((saved) => saved.savedPosition),
    ]);
    const countSlotsUsing = (position: number) =>
      perk.savedPositions.filter((saved) => saved.savedPosition === position).length;
    perk.candidatePositions = [...legalPositions].sort(
      (positionA, positionB) => countSlotsUsing(positionB) - countSlotsUsing(positionA) || positionA - positionB,
    );
  }

  // Perks with the fewest choices go first, which cuts the search short sooner.
  return [...perksByHash.values()].sort(
    (perkA, perkB) =>
      perkA.candidatePositions.length - perkB.candidatePositions.length ||
      perkB.buildsUsingPerk.length - perkA.buildsUsingPerk.length,
  );
}
