/*
 * Runs inside DIM's page. It listens to the Bungie API responses DIM already
 * fetches (profile + manifest), runs the clash check on them, and shows the
 * result in a small floating panel. It sends nothing anywhere; the only
 * requests it makes itself are for Bungie's public name tables.
 */
import type { ManifestPaths, ManifestResponse, ProfileResponse } from './bungie-types';
import * as core from './clash';
import type { Analysis, ArtifactPlan, CharacterResult, DebugSnapshot, SlotResult, SlotStatus } from './clash';

type Filter = 'all' | SlotStatus;

type Kind = 'profile' | 'manifest';

interface NameCache {
  items: Record<number, string>;
  loadouts: Record<number, string>;
}

interface State {
  analysis: Analysis | null;
  updatedAt: Date | null;
  paths: ManifestPaths | null;
  open: boolean;
  /** Character id of the tab the user picked, if any. */
  tab: string | null;
  filter: Filter;
  view: 'main' | 'help';
  /** Raw artifact data behind the analysis, for the debug export. */
  debug: DebugSnapshot | null;
}

interface Drift {
  artifactHash: number;
  /** Perk hash -> where it is now and where the saved slots expect it (1-based). */
  moves: Map<number, { from: number; to: number }>;
  /** How many slots are broken because of it. */
  slots: number;
}

interface Ui {
  tabs: HTMLElement;
  filters: HTMLElement;
  help: HTMLButtonElement;
  host: HTMLElement;
  pill: HTMLButtonElement;
  label: HTMLElement;
  body: HTMLElement;
  footText: HTMLElement;
  exportButton: HTMLButtonElement;
}

declare global {
  interface Window {
    __dimArtifactSlotCheck?: { core: typeof core; getState: () => State };
  }
}

const PROFILE_RE = /\/Platform\/Destiny2\/\d+\/Profile\/\d+\//i;
const MANIFEST_RE = /\/Platform\/Destiny2\/Manifest\/?(\?|$)/i;
const CACHE_KEY = 'dim-artifact-slot-check:names:v1';
const CLASS_NAMES: Record<number, string> = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };
const LOG_TAG = '[Artifact Slot Check]';

const CSS = `
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
summary.row::before{content:"▸";color:#a5a8be;font-size:10px;width:8px;flex:none}
details[open]>summary.row::before{content:"▾"}
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
.card>summary{display:flex;align-items:baseline;gap:8px;padding:9px 11px;cursor:pointer;list-style:none}
.card>summary::-webkit-details-marker{display:none}
.card>summary::before{content:"▸";color:#a5a8be;font-size:10px;width:8px;flex:none}
.card[open]>summary::before{content:"▾"}
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

.foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 14px;
  border-top:1px solid #2e3145;color:#a5a8be;font-size:11px}
.export{flex:none;border:1px solid #3a3d52;background:none;color:#d3d5e3;font-size:11px;
  padding:3px 9px;border-radius:5px;cursor:pointer}
.export:hover:not(:disabled){background:#2e3145;border-color:#565a78}
.export:disabled{opacity:.5;cursor:default}
`;

function start(): void {
  if (window.__dimArtifactSlotCheck || typeof window.fetch !== 'function') return;

  const origFetch = window.fetch;
  const state: State = {
    analysis: null,
    updatedAt: null,
    paths: null,
    open: false,
    debug: null,
    tab: null,
    filter: 'all',
    view: 'main',
  };
  const names = readCache();
  const notFound = new Set<string>();
  /** Extra item hashes to name, beyond what the panel shows (debug export). */
  const extraItemHashes = new Set<number>();
  let namesJob: Promise<void> = Promise.resolve();
  /** Sections the user opened or closed; the panel is rebuilt on every refresh. */
  const toggled = new Set<string>();
  /** What the list is showing, to tell a change of view from a refresh. */
  let shownKey: string | null = null;
  let ui: Ui | null = null;

  // ---- data capture -------------------------------------------------------

  window.fetch = function (this: unknown, ...args: Parameters<typeof fetch>): Promise<Response> {
    const promise = origFetch.apply(this as typeof globalThis, args);
    try {
      const input = args[0];
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
      const kind: Kind | null = !url
        ? null
        : PROFILE_RE.test(url)
          ? 'profile'
          : MANIFEST_RE.test(url)
            ? 'manifest'
            : null;
      if (kind) {
        // A separate chain on a clone: DIM's own handling is never touched.
        promise
          .then(async (res) => {
            if (res?.ok) onData(kind, await res.clone().json());
          })
          .catch(() => {});
      }
    } catch {
      /* never break DIM */
    }
    return promise;
  };

  function onData(kind: Kind, json: { Response?: unknown }): void {
    try {
      if (!json?.Response) return;
      if (kind === 'profile') {
        const profile = json.Response as ProfileResponse;
        if (!profile.characterLoadouts) return;
        state.analysis = core.analyze(profile);
        state.debug = core.debugSnapshot(profile);
        state.updatedAt = new Date();
        render();
      } else {
        const byLang = (json.Response as ManifestResponse).jsonWorldComponentContentPaths;
        if (!byLang) return;
        const lang = (document.documentElement.lang || 'en').toLowerCase();
        const baseLang = lang.split('-')[0] ?? lang;
        state.paths = byLang[lang] ?? byLang[baseLang] ?? byLang.en ?? null;
      }
      void ensureNames();
    } catch (e) {
      console.warn(LOG_TAG, e);
    }
  }

  // ---- names --------------------------------------------------------------

  function readCache(): NameCache {
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as NameCache | null;
      if (parsed?.items && parsed.loadouts) return parsed;
    } catch {
      /* corrupt or unavailable: start empty */
    }
    return { items: {}, loadouts: {} };
  }

  function writeCache(): void {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(names));
    } catch {
      /* storage full or blocked: names are refetched next time */
    }
  }

  function missingNames(): { items: number[]; loadouts: number[] } {
    if (!state.analysis) return { items: [], loadouts: [] };
    const needed = core.neededHashes(state.analysis);
    return {
      items: [...needed.items, ...extraItemHashes].filter((h) => !names.items[h] && !notFound.has(`i${h}`)),
      loadouts: [...needed.loadoutNames].filter((h) => !names.loadouts[h] && !notFound.has(`l${h}`)),
    };
  }

  async function fetchTable<T>(path: string): Promise<Record<number, T | undefined>> {
    const res = await origFetch(`https://www.bungie.net${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /** Loads any names still missing. Calls queue up, so none overlap. */
  function ensureNames(): Promise<void> {
    namesJob = namesJob.then(loadMissingNames);
    return namesJob;
  }

  async function loadMissingNames(): Promise<void> {
    const paths = state.paths;
    if (!paths) return;
    const missing = missingNames();
    if (!missing.items.length && !missing.loadouts.length) return;

    const jobs: Promise<void>[] = [];
    const itemPath = paths.DestinyInventoryItemLiteDefinition ?? paths.DestinyInventoryItemDefinition;
    if (missing.items.length && itemPath) {
      jobs.push(
        fetchTable<{ displayProperties?: { name?: string } }>(itemPath).then((defs) => {
          for (const h of missing.items) {
            const name = defs[h]?.displayProperties?.name;
            if (name) names.items[h] = name;
            else notFound.add(`i${h}`);
          }
        }),
      );
    }
    const loadoutNamePath = paths.DestinyLoadoutNameDefinition;
    if (missing.loadouts.length && loadoutNamePath) {
      jobs.push(
        fetchTable<{ name?: string }>(loadoutNamePath).then((defs) => {
          for (const h of missing.loadouts) {
            const name = defs[h]?.name;
            if (name) names.loadouts[h] = name;
            else notFound.add(`l${h}`);
          }
        }),
      );
    }

    const results = await Promise.allSettled(jobs);
    for (const result of results) {
      if (result.status === 'rejected') console.warn(LOG_TAG, 'could not load names', result.reason);
    }
    writeCache();
    render();
  }

  // ---- debug export -------------------------------------------------------

  /**
   * Saves a JSON file with the raw artifact data behind the panel: what each
   * saved slot holds, what is on each artifact now, and which perks each
   * position accepts. It contains no account, character or item ids.
   */
  async function exportDebug(): Promise<void> {
    const snapshot = state.debug;
    if (!snapshot) return;
    for (const h of core.debugItemHashes(snapshot)) extraItemHashes.add(h);
    await ensureNames();

    const itemNames: Record<number, string> = {};
    for (const h of core.debugItemHashes(snapshot)) {
      const name = names.items[h];
      if (name) itemNames[h] = name;
    }
    const report = {
      tool: 'dim-artifact-slot-check',
      exportedAt: new Date().toISOString(),
      dataFrom: state.updatedAt?.toISOString() ?? null,
      host: location.host,
      language: document.documentElement.lang || null,
      namesAvailable: Boolean(state.paths),
      constants: { unsetPlugHash: core.UNSET_PLUG_HASH, artifactBucketHash: core.ARTIFACT_BUCKET_HASH },
      snapshot,
      // Character ids are dropped; class and slots are enough to troubleshoot.
      analysis: state.analysis?.characters.map(({ characterId: _omitted, ...rest }) => rest) ?? null,
      itemNames,
      loadoutNames: names.loadouts,
    };

    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = el('a');
    link.href = url;
    link.download = 'artifact-slot-check-debug.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  const perkName = (hash: number) => names.items[hash] ?? `Perk ${hash}`;

  function slotLabel(index: number, nameHash: number): string {
    const name = names.loadouts[nameHash];
    return `Slot ${index + 1}${name ? ` · ${name}` : ''}`;
  }

  function ordinal(n: number): string {
    const rem10 = n % 10;
    const rem100 = n % 100;
    if (rem10 === 1 && rem100 !== 11) return `${n}st`;
    if (rem10 === 2 && rem100 !== 12) return `${n}nd`;
    if (rem10 === 3 && rem100 !== 13) return `${n}rd`;
    return `${n}th`;
  }

  // ---- UI -----------------------------------------------------------------
  // Built with createElement/textContent only, so it works under strict page
  // security policies and never interprets data as HTML.

  function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
  ): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function mount(): void {
    if (ui || !document.body) return;
    const host = el('div');
    host.id = 'dim-artifact-slot-check';
    const shadow = host.attachShadow({ mode: 'open' });
    // A constructed stylesheet is not subject to the page's style CSP.
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      shadow.adoptedStyleSheets = [sheet];
    } catch {
      shadow.appendChild(el('style', undefined, CSS));
    }

    const panel = el('div', 'panel');
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Artifact slot check');
    const head = el('div', 'head');
    const close = el('button', 'icon', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    const help = el('button', 'icon', '?');
    help.type = 'button';
    help.title = 'What this is and how to use it';
    help.setAttribute('aria-label', 'Help');
    help.addEventListener('click', () => {
      state.view = state.view === 'help' ? 'main' : 'help';
      render();
    });
    head.append(el('div', 'title', 'Artifact slot check'), help, close);
    const filters = el('div', 'filters');
    filters.hidden = true;
    const body = el('div', 'body');
    const foot = el('div', 'foot');
    const footText = el('span');
    const exportButton = el('button', 'export', 'Export debug file');
    exportButton.type = 'button';
    exportButton.title = 'Saves the artifact data behind this panel as a JSON file. No account or item ids.';
    exportButton.addEventListener('click', () => {
      exportButton.disabled = true;
      exportDebug()
        .catch((e) => console.warn(LOG_TAG, 'export failed', e))
        .finally(() => render());
    });
    foot.append(footText, exportButton);
    const tabs = el('div', 'tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.hidden = true;
    tabs.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const all = [...tabs.querySelectorAll<HTMLElement>('.tab')];
      const next = all.findIndex((t) => t.getAttribute('aria-selected') === 'true') + (e.key === 'ArrowRight' ? 1 : -1);
      all[(next + all.length) % all.length]?.click();
    });
    panel.append(head, tabs, filters, body, foot);

    const pill = el('button', 'pill');
    pill.type = 'button';
    pill.setAttribute('aria-expanded', 'false');
    const label = el('span', undefined, 'Artifact check');
    pill.append(el('span', 'dot'), label);

    shadow.append(panel, pill);

    const setOpen = (open: boolean) => {
      state.open = open;
      panel.hidden = !open;
      pill.setAttribute('aria-expanded', String(open));
    };
    pill.addEventListener('click', () => setOpen(!state.open));
    close.addEventListener('click', () => {
      setOpen(false);
      pill.focus();
    });
    shadow.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape' && state.open) {
        e.stopPropagation();
        setOpen(false);
        pill.focus();
      }
    });

    document.body.appendChild(host);
    ui = { host, pill, label, tabs, filters, help, body, footText, exportButton };
    render();
  }

  function render(): void {
    if (!ui) return;
    // DIM can replace <body> content; make sure we are still attached.
    if (!ui.host.isConnected && document.body) document.body.appendChild(ui.host);

    // Clashes come from saved data and are certain, so only they turn the
    // pill red. "Check artifact" depends on Bungie's report, which can lag.
    const summary = core.summarize(state.analysis);
    let status = 'idle';
    let text = 'Artifact check: waiting for DIM';
    if (state.analysis) {
      if (summary.clashing) {
        status = 'clash';
        text = `${summary.clashing} artifact ${summary.clashing === 1 ? 'slot clashes' : 'slots clash'}`;
      } else if (summary.broken) {
        status = 'broken';
        text = 'Check artifact';
      } else if (summary.slots) {
        status = 'ok';
        text = 'Artifact slots OK';
      } else {
        text = 'No artifact loadouts';
      }
    }
    ui.pill.className = `pill ${status}`;
    ui.label.textContent = text;
    ui.help.setAttribute('aria-pressed', String(state.view === 'help'));

    const body = ui.body;
    // The list is rebuilt on every DIM refresh; keep the reader's place.
    const scrollTop = body.scrollTop;
    const shownBefore = shownKey;
    body.textContent = '';
    ui.tabs.textContent = '';
    ui.filters.textContent = '';
    ui.footText.textContent = state.updatedAt
      ? `Checked ${state.updatedAt.toLocaleTimeString()} · updates when DIM refreshes`
      : 'No data yet';
    ui.exportButton.disabled = !state.debug;

    if (state.view === 'help') {
      ui.tabs.hidden = ui.filters.hidden = true;
      body.append(renderHelp());
      shownKey = 'help';
      body.scrollTop = shownKey === shownBefore ? scrollTop : 0;
      return;
    }

    const withSlots = state.analysis?.characters.filter((c) => c.slots.length) ?? [];
    // One tab per class. Open on the chosen one, else the first with a problem.
    const character =
      withSlots.find((c) => c.characterId === state.tab) ??
      withSlots.find((c) => c.slots.some((s) => s.status !== 'ok')) ??
      withSlots[0];
    ui.tabs.hidden = withSlots.length < 2;
    for (const c of withSlots) ui.tabs.append(renderTab(c, c === character));
    ui.filters.hidden = !character;

    if (!state.analysis) {
      body.append(el('p', 'note', 'Waiting for DIM to load your inventory. Refresh DIM if this does not change.'));
    } else if (!character) {
      body.append(el('p', 'note', 'None of your saved in-game loadouts include an artifact with perks.'));
    } else {
      const count = (s: SlotStatus) => character.slots.filter((slot) => slot.status === s).length;
      const filters: [Filter, string, number][] = [
        ['all', 'All', character.slots.length],
        ['clash', 'Clash', count('clash')],
        ['broken', 'Check artifact', count('broken')],
        ['ok', 'OK', count('ok')],
      ];
      // A filter with nothing in it falls back to showing everything.
      const active = filters.find(([f, , n]) => f === state.filter && n)?.[0] ?? 'all';
      for (const [filter, label, n] of filters) {
        if (!n && filter !== 'all') continue;
        const chip = el('button', 'filter');
        chip.type = 'button';
        chip.setAttribute('aria-pressed', String(filter === active));
        if (filter !== 'all') chip.append(el('span', `dot ${filter}`));
        chip.append(el('span', undefined, `${label} ${n}`));
        chip.addEventListener('click', () => {
          state.filter = filter;
          render();
        });
        ui.filters.append(chip);
      }

      if (ui.tabs.hidden) body.append(el('div', 'char', CLASS_NAMES[character.classType] ?? 'Character'));
      if (active === 'all' || active === 'clash') {
        for (const plan of character.plans) body.append(renderPlan(character.characterId, plan));
      }
      if (active === 'all' || active === 'broken') {
        for (const drift of artifactDrift(character)) body.append(renderDrift(character.characterId, drift));
      }
      for (const slot of character.slots) {
        if (active === 'all' || slot.status === active) body.append(renderSlot(character.characterId, slot));
      }
      shownKey = `${character.characterId}:${active}`;
    }
    body.scrollTop = shownKey === shownBefore ? scrollTop : 0;
  }

  // ---- small building blocks ----------------------------------------------

  /** A <details> that remembers whether the user opened or closed it across re-renders. */
  function foldable(className: string, key: string, openByDefault: boolean): HTMLDetailsElement {
    const box = el('details', className);
    box.open = toggled.has(key) ? !openByDefault : openByDefault;
    box.addEventListener('toggle', () => {
      if (box.open === openByDefault) toggled.delete(key);
      else toggled.add(key);
    });
    return box;
  }

  /** Two aligned columns: a bold name and what to know about it. */
  function pairs(rows: [string, string][]): HTMLElement {
    const grid = el('div', 'kv');
    for (const [k, v] of rows) grid.append(el('span', 'k', k), el('span', 'v', v));
    return grid;
  }

  function list(tag: 'ol' | 'ul', lines: string[]): HTMLElement {
    const node = el(tag);
    for (const line of lines) node.append(el('li', undefined, line));
    return node;
  }

  function labelled(label: string, content: HTMLElement | string): HTMLElement[] {
    return [el('div', 'label', label), typeof content === 'string' ? el('div', undefined, content) : content];
  }

  const slotNames = (refs: { index: number; nameHash: number }[]) =>
    refs.map((r) => slotLabel(r.index, r.nameHash)).join(', ');

  const artifactName = (hash: number) => names.items[hash] ?? 'Artifact';

  function renderTab(character: CharacterResult, selected: boolean): HTMLElement {
    const worst = character.slots.some((s) => s.status === 'clash')
      ? 'clash'
      : character.slots.some((s) => s.status === 'broken')
        ? 'broken'
        : 'ok';
    const tab = el('button', `tab ${worst}`);
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    tab.append(el('span', 'dot'), el('span', undefined, CLASS_NAMES[character.classType] ?? 'Character'));
    tab.addEventListener('click', () => {
      state.tab = character.characterId;
      render();
      ui?.tabs.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    });
    return tab;
  }

  // ---- suggested fix ------------------------------------------------------

  function renderPlan(characterId: string, plan: ArtifactPlan): HTMLElement {
    const box = foldable('card', `plan:${characterId}:${plan.artifactHash}`, true);
    const summary = el('summary');
    const n = plan.changes.length;
    summary.append(
      el('span', 'card-title', `Suggested fix · ${artifactName(plan.artifactHash)}`),
      el('span', 'badge', n ? `${n} ${n === 1 ? 'slot' : 'slots'} to re-save` : 'no fix found'),
    );
    const content = el('div', 'card-body');

    if (n) {
      content.append(el('p', 'lead', 'Move these perks so each one sits in the same position in every slot.'));
      for (const change of plan.changes) {
        const step = el('div', 'step');
        step.append(
          el('div', 'step-title', slotLabel(change.index, change.nameHash)),
          pairs(change.moves.map((m) => [perkName(m.perkHash), `${ordinal(m.from)} → ${ordinal(m.to)}`])),
        );
        content.append(step);
      }
      content.append(
        ...labelled(
          'How to apply, per slot',
          list('ol', ['Equip the slot, in orbit.', 'Rearrange the perks on the artifact.', 'Overwrite the slot.']),
        ),
      );
    }
    if (plan.unchanged.length) content.append(...labelled('Already fine', slotNames(plan.unchanged)));
    if (plan.excluded.length) {
      content.append(
        ...labelled("Can't fit", slotNames(plan.excluded)),
        el('div', 'muted', 'It needs a perk in a position another build uses, so it will keep clashing.'),
      );
    }
    content.append(
      el(
        'p',
        'note',
        'Only positions already seen in your loadouts are suggested.' +
          (plan.exhaustive ? '' : ' The search was cut short, so a shorter fix may exist.'),
      ),
    );
    box.append(summary, content);
    return box;
  }

  // ---- artifact reported differently --------------------------------------

  /**
   * Artifacts whose saved slots all agree with each other, but which Bungie
   * reports as arranged differently. Nothing needs re-saving: either the
   * report is out of date, or moving the perks on the artifact fixes it.
   */
  function artifactDrift(character: CharacterResult): Drift[] {
    const planned = new Set(character.plans.map((p) => p.artifactHash));
    const drifts = new Map<number, Drift>();
    for (const slot of character.slots) {
      if (planned.has(slot.artifactHash) || !slot.brokenNow.length) continue;
      const drift = drifts.get(slot.artifactHash) ?? { artifactHash: slot.artifactHash, moves: new Map(), slots: 0 };
      drift.slots++;
      for (const p of slot.brokenNow) drift.moves.set(p.perkHash, { from: p.current, to: p.saved });
      drifts.set(slot.artifactHash, drift);
    }
    return [...drifts.values()];
  }

  function renderDrift(characterId: string, drift: Drift): HTMLElement {
    const box = foldable('card warn', `drift:${characterId}:${drift.artifactHash}`, true);
    const summary = el('summary');
    summary.append(
      el('span', 'card-title', `Check artifact · ${artifactName(drift.artifactHash)}`),
      el('span', 'badge', `${drift.slots} ${drift.slots === 1 ? 'slot' : 'slots'} affected`),
    );
    const content = el('div', 'card-body');
    content.append(
      el('p', 'lead', 'Your slots agree with each other, but Bungie reports the artifact arranged differently.'),
      pairs(
        [...drift.moves].map(([perkHash, m]) => [
          perkName(perkHash),
          `reported ${ordinal(m.from)}, saved ${ordinal(m.to)}`,
        ]),
      ),
      ...labelled(
        'What to do',
        list('ul', [
          'Looks right in game? Ignore this. Bungie can be slow to report in-game changes.',
          'Otherwise, move the perks on the artifact to the saved positions. No re-saving needed.',
        ]),
      ),
    );
    box.append(summary, content);
    return box;
  }

  // ---- one saved slot -----------------------------------------------------

  function renderSlot(characterId: string, slot: SlotResult): HTMLElement {
    const chip = slot.status === 'clash' ? 'Clash' : slot.status === 'broken' ? 'Check artifact' : 'OK';
    const rowContent = [
      el('span', 'name', slotLabel(slot.index, slot.nameHash)),
      el('span', 'art', artifactName(slot.artifactHash)),
      el('span', 'chip', chip),
    ];
    if (slot.status === 'ok') {
      const box = el('div', `slot ${slot.status}`);
      const row = el('div', 'row');
      row.append(...rowContent);
      box.append(row);
      return box;
    }

    const box = foldable(`slot ${slot.status}`, `slot:${characterId}:${slot.index}`, false);
    const row = el('summary', 'row');
    row.append(...rowContent);
    const detail = el('div', 'detail');

    if (slot.clashes.length) {
      // One line per perk: where it is here, and where the other slots keep it.
      const byPerk = new Map<number, { here: number; there: Map<number, string[]> }>();
      for (const clash of slot.clashes) {
        for (const p of clash.perks) {
          const entry = byPerk.get(p.perkHash) ?? { here: p.here, there: new Map<number, string[]>() };
          entry.there.set(p.there, [...(entry.there.get(p.there) ?? []), String(clash.otherIndex + 1)]);
          byPerk.set(p.perkHash, entry);
        }
      }
      detail.append(
        ...labelled(
          'Clashes with other slots',
          pairs(
            [...byPerk].map(([perkHash, entry]) => [
              perkName(perkHash),
              `${ordinal(entry.here)} here · ` +
                [...entry.there]
                  .map(([position, others]) => `${ordinal(position)} in slot${others.length > 1 ? 's' : ''} ${others.join(', ')}`)
                  .join(' · '),
            ]),
          ),
        ),
      );
    }
    if (slot.brokenNow.length) {
      detail.append(
        ...labelled(
          'Artifact reported differently',
          pairs(
            slot.brokenNow.map((p) => [perkName(p.perkHash), `saved ${ordinal(p.saved)}, reported ${ordinal(p.current)}`]),
          ),
        ),
      );
    }
    box.append(row, detail);
    return box;
  }

  // ---- help ---------------------------------------------------------------

  function renderHelp(): HTMLElement {
    const help = el('div', 'help');
    const back = el('button', 'back', '← Back');
    back.type = 'button';
    back.addEventListener('click', () => {
      state.view = 'main';
      render();
    });
    const section = (title: string, ...content: HTMLElement[]) => [el('h3', undefined, title), ...content];

    const legend = el('div', 'legend');
    const legendRows: [string, string][] = [
      ['ok', 'OK: nothing to do.'],
      ['clash', 'Clash: this slot and another keep a shared perk in different positions. Equipping one breaks the other.'],
      ['broken', "Check artifact: the slot is fine, but Bungie reports the artifact arranged differently. Often just Bungie's data running behind."],
    ];
    for (const [status, text] of legendRows) legend.append(el('span', `dot ${status}`), el('span', undefined, text));

    help.append(
      back,
      ...section(
        'What this checks',
        el(
          'p',
          undefined,
          'A saved in-game loadout remembers the position of each artifact perk. If a perk sits in a different ' +
            'position when you equip the loadout, the game leaves it out and shows "Contains items with invalid mods".',
        ),
        el('p', undefined, 'This panel compares your saved slots and warns you before that happens.'),
      ),
      ...section('Colours', legend),
      ...section(
        'Fixing a clash',
        el('p', undefined, 'Open "Suggested fix". For each slot it lists:'),
        list('ol', [
          'Equip the slot, in orbit.',
          'On the artifact, move the listed perks to the new positions.',
          'Overwrite the slot from the in-game loadout screen.',
        ]),
        el('p', 'note', 'Some builds cannot share a layout. Those are listed under "Can\'t fit".'),
      ),
      ...section(
        'Finding your way around',
        list('ul', [
          'Tabs switch between your classes.',
          'The chips under the tabs filter slots by status.',
          'Click a slot to see which perks are involved.',
          'The panel updates each time DIM refreshes.',
        ]),
      ),
      ...section(
        'Good habits',
        list('ul', [
          'Save your builds to in-game slots in one sitting.',
          'Avoid rearranging artifact perks by hand unless a fix asks for it.',
          'Check the dot before starting an activity.',
        ]),
      ),
      ...section(
        'Your data',
        el(
          'p',
          undefined,
          'Everything comes from the data DIM already downloads. Nothing is sent anywhere. "Export debug file" ' +
            'saves the artifact data behind this panel, with no account or item ids, for troubleshooting.',
        ),
      ),
    );
    return help;
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  window.__dimArtifactSlotCheck = { core, getState: () => state };
}

start();
