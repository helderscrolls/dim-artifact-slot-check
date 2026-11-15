/*
 * The "Check artifact" card: saved slots that agree with each other, but which
 * Bungie reports the artifact arranged differently from. Nothing needs
 * re-saving: either Bungie's report is out of date, or moving the perks on the
 * artifact fixes it.
 */
import type { CharacterResult } from '../analysis';
import type { AppContext } from '../app/context';
import { el, foldable, labelled, list, ordinal, pairs, pluralizeSlots } from './dom';

/** One artifact whose reported arrangement differs from what its saved slots expect. */
export interface ArtifactDrift {
  artifactHash: number;
  /** Perk hash -> where Bungie reports it and where the saved slots expect it (1-based). */
  moves: Map<number, { from: number; to: number }>;
  /** How many slots are affected. */
  slotCount: number;
}

/** Finds the artifacts of one character that are reported differently from their saved slots. */
export function findArtifactDrifts(character: CharacterResult): ArtifactDrift[] {
  // Artifacts that already have a suggested fix are explained there instead.
  const artifactsWithAPlan = new Set(character.plans.map((plan) => plan.artifactHash));
  const driftByArtifact = new Map<number, ArtifactDrift>();

  for (const slot of character.slots) {
    if (artifactsWithAPlan.has(slot.artifactHash) || slot.brokenNow.length === 0) continue;

    const drift = driftByArtifact.get(slot.artifactHash) ?? {
      artifactHash: slot.artifactHash,
      moves: new Map(),
      slotCount: 0,
    };
    drift.slotCount++;
    for (const brokenPerk of slot.brokenNow) {
      drift.moves.set(brokenPerk.perkHash, { from: brokenPerk.current, to: brokenPerk.saved });
    }
    driftByArtifact.set(slot.artifactHash, drift);
  }
  return [...driftByArtifact.values()];
}

export function renderArtifactDrift(context: AppContext, characterId: string, drift: ArtifactDrift): HTMLElement {
  const { names, foldedSections } = context;
  const card = foldable(foldedSections, 'card warn', `drift:${characterId}:${drift.artifactHash}`, true);

  const summary = el('summary');
  summary.append(
    el('span', 'card-title', `Check artifact · ${names.artifactName(drift.artifactHash)}`),
    el('span', 'badge', `${pluralizeSlots(drift.slotCount)} affected`),
  );

  const moveRows = [...drift.moves].map(([perkHash, move]): [string, string] => [
    names.perkName(perkHash),
    `reported ${ordinal(move.from)}, saved ${ordinal(move.to)}`,
  ]);
  const content = el('div', 'card-body');
  content.append(
    el('p', 'lead', 'Your slots agree with each other, but Bungie reports the artifact arranged differently.'),
    pairs(moveRows),
    ...labelled(
      'What to do',
      list('ul', [
        'Looks right in game? Ignore this. Bungie can be slow to report in-game changes.',
        'Otherwise, move the perks on the artifact to the saved positions. No re-saving needed.',
      ]),
    ),
  );

  card.append(summary, content);
  return card;
}
