/*
 * All the panel's styling, as one stylesheet. It lives inside a shadow root,
 * so none of it can leak into DIM's page and none of DIM's styles reach us.
 * Class names here match the ones the ui/ files put on their elements.
 */
export const PANEL_STYLES = `
/* ---- the host element and basics ---- */
:host{all:initial;position:fixed;left:16px;bottom:16px;z-index:2147483000;
  font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#e8e9f0}
*{box-sizing:border-box}
[hidden]{display:none!important}
button{font:inherit;color:inherit}
button:focus-visible,summary:focus-visible{outline:2px solid #8ab4ff;outline-offset:2px;border-radius:4px}

/* ---- the pill and status dots ---- */
.pill{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 14px 0 11px;
  border-radius:17px;border:1px solid #3a3d52;background:#1c1e2b;font-weight:600;cursor:pointer;
  box-shadow:0 4px 14px rgba(0,0,0,.45);transition:border-color .15s,background .15s}
.pill:hover{background:#252839;border-color:#565a78}
.dot{width:9px;height:9px;border-radius:50%;background:#6c7086;flex:none}
.ok .dot,.dot.ok{background:#5fd38d}.clash .dot,.dot.clash{background:#ff6b5e}.broken .dot,.dot.broken{background:#f5b942}

/* ---- the panel frame: header, tabs, filters, body ---- */
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

/* ---- one saved slot ---- */
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

/* ---- cards: suggested fix, check artifact, new clash banner ---- */
.card{margin-bottom:8px;border-radius:8px;border:1px solid #35507a;background:#1f2738}
.card.warn{border-color:#6b5a2a;background:#2a2619}
.card.alert{border-color:#7a3a38;background:#2f1d1f}
.card.alert .card-title{color:#ff9d94}
.alert-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 11px}
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

/* ---- the help page ---- */
.help h3{margin:14px 0 5px;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#a9c8ff}
.help h3:first-of-type{margin-top:8px}
.help p{margin:0 0 6px;color:#d3d5e3}
.help li{color:#d3d5e3}
.legend{display:grid;grid-template-columns:auto 1fr;gap:5px 9px;align-items:baseline}
.legend .dot{position:relative;top:1px}
.back{border:1px solid #3a3d52;background:none;color:#d3d5e3;font-size:12px;padding:3px 10px;border-radius:5px;cursor:pointer}
.back:hover{background:#2e3145}

/* ---- the popup in the top right corner ---- */
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

/* ---- the footer ---- */
.foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 14px;
  border-top:1px solid #2e3145;color:#a5a8be;font-size:11px}
.export{flex:none;border:1px solid #3a3d52;background:none;color:#d3d5e3;font-size:11px;
  padding:3px 9px;border-radius:5px;cursor:pointer}
.export:hover:not(:disabled){background:#2e3145;border-color:#565a78}
.export:disabled{opacity:.5;cursor:default}
`;
