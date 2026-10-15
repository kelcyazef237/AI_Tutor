"""Shared scaffold for the MYEVIEW system diagrams.

Every diagram is one inline SVG on one page: nodes, labelled edges, and
packets that travel the edges that are live in the current step. The page
adds a Present control (step / play / all), a caption per step, hover-to-trace,
and both themes. No libraries; icons are inlined as <symbol>s.
"""
import base64, json, html
from pathlib import Path

HERE = Path(__file__).parent
_ICON_FILE = next(p for p in (HERE / "icons" / "icons.json", HERE.parent / "icons" / "icons.json") if p.exists())
ICONS = json.load(open(_ICON_FILE))
LOGO = base64.b64encode(open("/home/kelcy/Projects/MyEview/backend/app/reports/assets/logo/myeview-mark.png", "rb").read()).decode()

# ── icons ───────────────────────────────────────────────────────────────
def symbols(names):
    out = []
    for n in names:
        ic = ICONS[n]
        if ic["kind"] == "fill":
            out.append(f'<symbol id="i-{n}" viewBox="{ic["vb"]}"><path d="{ic["d"]}" fill="currentColor"/></symbol>')
        else:
            out.append(f'<symbol id="i-{n}" viewBox="{ic["vb"]}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{ic["inner"]}</symbol>')
    return "\n".join(out)

def icon(name, x, y, size=18, cls=""):
    return f'<use href="#i-{name}" x="{x}" y="{y}" width="{size}" height="{size}" class="ic {cls}"/>'

# ── primitives ──────────────────────────────────────────────────────────
def esc(s): return html.escape(str(s), quote=True)

def zone(x, y, w, h, label, cls="", stage=1, sub=None):
    s = f'<g class="zone {cls}" data-stage="{stage}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14"/>'
    s += f'<text class="zone-l" x="{x+16}" y="{y+22}">{esc(label)}</text>'
    if sub: s += f'<text class="zone-s" x="{x+16}" y="{y+38}">{esc(sub)}</text>'
    return s + "</g>"

def warn(msg):
    import sys; print("  ! " + msg, file=sys.stderr)

def node(nid, x, y, w, h, title, sub=None, ic=None, stage=1, cls="", tags=None, brand=False):
    """A component: rounded card, icon, name, one-line detail, optional tag pills."""
    s = f'<g id="n-{nid}" class="node {cls}{" brand" if brand else ""}" data-stage="{stage}" data-node="{nid}" tabindex="0">'
    s += f'<rect class="card" x="{x}" y="{y}" width="{w}" height="{h}" rx="10"/>'
    tx = x + 14
    if ic:
        s += f'<rect class="icbg" x="{x+12}" y="{y+12}" width="30" height="30" rx="8"/>'
        s += icon(ic, x+18, y+18, 18)
        tx = x + 52
    avail = x + w - 10 - tx
    if 7.4 * len(title) > avail: warn(f"{nid}: title overflows by ~{7.4*len(title)-avail:.0f}px: {title!r}")
    s += f'<text class="n-t" x="{tx}" y="{y+25}">{esc(title)}</text>'
    if sub:
        if 5.5 * len(sub) > avail: warn(f"{nid}: sub overflows by ~{5.5*len(sub)-avail:.0f}px: {sub!r}")
        s += f'<text class="n-s" x="{tx}" y="{y+41}">{esc(sub)}</text>'
    if tags:
        px = x + 14; py = y + h - 22
        if sub and h < 67: warn(f"{nid}: tags sit on the sub line (h={h}<67)")
        for t in tags:
            wpx = 7.2 * len(t) + 14
            s += f'<rect class="tag" x="{px}" y="{py}" width="{wpx:.0f}" height="17" rx="5"/><text class="tag-t" x="{px+7}" y="{py+12}">{esc(t)}</text>'
            px += wpx + 6
        if px - 6 > x + w - 10: warn(f"{nid}: tags overflow by ~{px-6-(x+w-10):.0f}px")
    return s + "</g>"

def _label(path_mid, text, cls=""):
    if not text: return ""
    mx, my = path_mid
    w = 6.6 * len(text) + 14
    return (f'<rect class="el-bg" x="{mx - w/2:.1f}" y="{my-9}" width="{w:.0f}" height="17" rx="5"/>'
            f'<text class="el {cls}" x="{mx:.1f}" y="{my+3.5}" text-anchor="middle">{esc(text)}</text>')

def edge(eid, d, label=None, stage=1, kind="", src=None, dst=None, mid=None, packets=2, dur=2.6, lcls=""):
    """A connection. `kind` in {"", "untrusted", "signed", "stream", "optional", "bad"}.
    `mid` is where the label sits; `packets` how many dots travel it."""
    attrs = f'data-stage="{stage}"' + (f' data-src="{src}"' if src else "") + (f' data-dst="{dst}"' if dst else "")
    s = f'<g id="e-{eid}" class="edge {kind}" {attrs}>'
    s += f'<path id="p-{eid}" d="{d}" class="wire" marker-end="url(#arr{"-w" if kind=="untrusted" or kind=="bad" else ""})"/>'
    s += f'<path d="{d}" class="wire-glow"/>'
    for i in range(packets):
        b = round(i * dur / max(packets, 1), 2)
        # a packet that has not started yet would sit at the origin: keep it hidden until its motion begins
        hide = f' visibility="hidden"><set attributeName="visibility" to="visible" begin="{b}s" fill="freeze"/' if b > 0 else ''
        s += (f'<circle class="pkt" r="4"{hide}><animateMotion dur="{dur}s" begin="{b}s" repeatCount="indefinite">'
              f'<mpath href="#p-{eid}" xlink:href="#p-{eid}"/></animateMotion></circle>')
    if label and mid: s += _label(mid, label, lcls)
    return s + "</g>"

def link(ax, ay, bx, by, bend=0.5):
    """Cubic from (ax,ay) to (bx,by) that leaves horizontally and arrives horizontally."""
    dx = (bx - ax) * bend
    return f"M {ax} {ay} C {ax+dx:.0f} {ay}, {bx-dx:.0f} {by}, {bx} {by}"

def vlink(ax, ay, bx, by, bend=0.5):
    dy = (by - ay) * bend
    return f"M {ax} {ay} C {ax} {ay+dy:.0f}, {bx} {by-dy:.0f}, {bx} {by}"

def note(x, y, text, cls="", anchor="start", stage=1):
    return f'<text class="note {cls}" x="{x}" y="{y}" text-anchor="{anchor}" data-stage="{stage}">{esc(text)}</text>'

def defs(icon_names):
    return f'''<defs>
{symbols(icon_names)}
<marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="arrhead"/></marker>
<marker id="arr-w" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="arrhead warn"/></marker>
</defs>'''

# ── page ────────────────────────────────────────────────────────────────
CSS = r"""
:root{
  --ground:#e9e5f4; --paper:#ffffff; --ink:#191627; --ink-soft:#3b3552; --muted:#6b6485;
  --hair:#e6e1f2; --edge-c:#cbc4e1;
  --brand:#7c3aed; --brand-ink:#5b21b6; --brand-soft:#a78bfa; --brand-wash:#f3efff; --brand-edge:#dcd2f8;
  --ok:#047857; --warn:#b45309; --warn-wash:#fdf1e3; --warn-edge:#f0dcc0; --bad:#dc2626; --bad-wash:#fdecec;
  --card:#ffffff; --card-edge:#d9d3ea; --wire:#9b93bd; --wire-live:#7c3aed; --pkt:#7c3aed;
  --display:'Space Grotesk',system-ui,sans-serif; --body:'Inter',system-ui,sans-serif; --mono:'JetBrains Mono',ui-monospace,Menlo,monospace;
  color-scheme:light dark;
}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){
  --ground:#0f0d1a; --paper:#17142a; --ink:#ece9f5; --ink-soft:#c3bdd6; --muted:#918aa9;
  --hair:#2f2a44; --edge-c:#3a3453;
  --brand:#a78bfa; --brand-ink:#c4b5fd; --brand-soft:#c4b5fd; --brand-wash:#221d36; --brand-edge:#3a3158;
  --ok:#34d399; --warn:#fbbf24; --warn-wash:#2b2113; --warn-edge:#54401a; --bad:#f87171; --bad-wash:#2e1717;
  --card:#1d1a2f; --card-edge:#332d4b; --wire:#5a5478; --wire-live:#a78bfa; --pkt:#c4b5fd;
}}
:root[data-theme="dark"]{
  --ground:#0f0d1a; --paper:#17142a; --ink:#ece9f5; --ink-soft:#c3bdd6; --muted:#918aa9;
  --hair:#2f2a44; --edge-c:#3a3453;
  --brand:#a78bfa; --brand-ink:#c4b5fd; --brand-soft:#c4b5fd; --brand-wash:#221d36; --brand-edge:#3a3158;
  --ok:#34d399; --warn:#fbbf24; --warn-wash:#2b2113; --warn-edge:#54401a; --bad:#f87171; --bad-wash:#2e1717;
  --card:#1d1a2f; --card-edge:#332d4b; --wire:#5a5478; --wire-live:#a78bfa; --pkt:#c4b5fd;
}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font:14px/1.5 var(--body);min-height:100vh;display:flex;flex-direction:column}
.top{display:flex;align-items:center;gap:14px;padding:14px 22px;border-bottom:1px solid var(--hair);background:var(--paper)}
.mark{width:30px;height:30px;background:url(data:image/png;base64,__LOGO__) center/contain no-repeat;flex:0 0 30px}
.wordmark{font:700 13px var(--display);letter-spacing:.14em;color:var(--brand-ink)}
.wordmark small{display:block;font:600 9px var(--display);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-top:2px}
.title{margin-left:14px;padding-left:14px;border-left:1px solid var(--hair)}
.title h1{margin:0;font:700 17px/1.2 var(--display);letter-spacing:-.01em}
.title p{margin:2px 0 0;color:var(--muted);font-size:12.5px}
.top .right{margin-left:auto;display:flex;gap:8px;align-items:center}
button{font:600 12px var(--display);letter-spacing:.02em;color:var(--ink-soft);background:var(--paper);border:1px solid var(--card-edge);border-radius:7px;padding:6px 11px;cursor:pointer}
button:hover{border-color:var(--brand);color:var(--brand-ink)}
button[aria-pressed="true"]{background:var(--brand);border-color:var(--brand);color:#fff}
button:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.stage{flex:1;display:flex;align-items:center;justify-content:center;padding:18px 22px 8px}
figure{margin:0;width:100%;max-width:1320px}
svg.d{width:100%;height:auto;display:block;font-family:var(--body)}
figcaption{position:absolute;left:-9999px}
.bar{display:flex;gap:16px;align-items:center;padding:12px 22px 18px;max-width:1320px;margin:0 auto;width:100%}
.controls{display:flex;gap:6px;align-items:center;flex:0 0 auto}
.steps{display:flex;gap:5px}
.steps button{width:28px;height:28px;padding:0;border-radius:50%;font-family:var(--mono);font-size:11px}
.cap{flex:1;min-height:44px;display:flex;flex-direction:column;justify-content:center}
.cap b{font:700 13px var(--display);color:var(--brand-ink)}
.cap span{color:var(--ink-soft);font-size:13px}
.legend{display:flex;gap:18px;flex-wrap:wrap;padding:0 22px 20px;max-width:1320px;margin:0 auto;width:100%;font-size:11.5px;color:var(--muted)}
.legend i{display:inline-block;width:22px;height:0;border-top:2px solid var(--wire-live);vertical-align:middle;margin-right:6px}
.legend i.dash{border-top-style:dashed}
.legend i.warn{border-top-color:var(--warn)}
.legend i.dot{width:8px;height:8px;border:0;border-radius:50%;background:var(--pkt)}
.legend i.zone{width:14px;height:10px;border:1px dashed var(--brand-edge);background:var(--brand-wash);border-radius:3px}
.legend i.zone.warn{border-color:var(--warn-edge);background:var(--warn-wash)}

/* drawing */
.zone rect{fill:var(--brand-wash);stroke:var(--brand-edge);stroke-dasharray:6 5;stroke-width:1.2}
.zone.warn rect{fill:var(--warn-wash);stroke:var(--warn-edge)}
.zone.plain rect{fill:transparent;stroke:var(--edge-c)}
.zone-l{font:700 11px var(--display);letter-spacing:.14em;text-transform:uppercase;fill:var(--brand-ink)}
.zone.warn .zone-l{fill:var(--warn)}
.zone.plain .zone-l{fill:var(--muted)}
.zone-s{font:11.5px var(--body);fill:var(--muted)}
.node .card{fill:var(--card);stroke:var(--card-edge);stroke-width:1.2;filter:drop-shadow(0 1px 1px rgba(30,22,66,.06))}
.node.brand .card{stroke:var(--brand);stroke-width:1.6}
.node.ext .card{stroke:var(--warn-edge);fill:var(--paper)}
.node .icbg{fill:var(--brand-wash)}
.node.ext .icbg{fill:var(--warn-wash)}
.node .ic{color:var(--brand-ink)}
.node.ext .ic{color:var(--warn)}
.n-t{font:600 13px var(--display);fill:var(--ink)}
.n-s{font:11px var(--body);fill:var(--muted)}
.tag{fill:var(--brand-wash);stroke:var(--brand-edge);stroke-width:.8}
.tag-t{font:9.5px var(--mono);fill:var(--brand-ink)}
.node.ext .tag{fill:var(--warn-wash);stroke:var(--warn-edge)} .node.ext .tag-t{fill:var(--warn)}
.note{font:11.5px var(--body);fill:var(--muted)}
.note.strong{fill:var(--ink-soft);font-weight:600}
.note.mono{font-family:var(--mono);font-size:10.5px}
.wire{fill:none;stroke:var(--wire);stroke-width:1.6}
.wire-glow{fill:none;stroke:var(--wire-live);stroke-width:5;opacity:0}
.edge.untrusted .wire,.edge.bad .wire{stroke:var(--warn);stroke-dasharray:5 4}
.edge.optional .wire{stroke-dasharray:3 5}
.edge.stream .wire{stroke-dasharray:10 5}
.edge.signed .wire{stroke:var(--ok)}
.edge.bad .wire{stroke:var(--bad)}
.arrhead{fill:var(--wire)} .arrhead.warn{fill:var(--warn)}
.pkt{fill:var(--pkt);stroke:var(--paper);stroke-width:1.5}
.edge.untrusted .pkt,.edge.bad .pkt{fill:var(--warn)}
.edge.bad .pkt{fill:var(--bad)}
.el-bg{fill:var(--paper);stroke:var(--card-edge);stroke-width:.8}
.el{font:10.5px var(--mono);fill:var(--ink-soft)}
.el.warn{fill:var(--warn)} .el.ok{fill:var(--ok)}

/* stepping: everything past the current step recedes; edges not yet live carry no traffic */
[data-stage]{transition:opacity .45s ease}
.pending[data-stage]{opacity:.10}
.pending.edge .pkt{display:none}
.edge.is-on .wire{stroke:var(--wire-live)}
.edge.is-on .arrhead{fill:var(--wire-live)}
.edge.is-on.untrusted .wire,.edge.is-on.bad .wire{stroke:var(--warn)}
.edge.is-on.bad .wire{stroke:var(--bad)}
.edge.is-on.signed .wire{stroke:var(--ok)}
/* hover-to-trace */
.node{cursor:default;outline:none}
.node:hover .card,.node:focus-visible .card,.node.lit .card{stroke:var(--brand);stroke-width:2}
.edge.lit .wire{stroke:var(--brand);stroke-width:2.4} .edge.lit .wire-glow{opacity:.18}
.edge.dim{opacity:.18}
@media (prefers-reduced-motion: reduce){ .pkt{display:none} [data-stage]{transition:none} }
@media print{ .bar,.top .right{display:none} .pending[data-stage]{opacity:1} .pkt{display:none} body{background:#fff} }
"""

JS = r"""
(function(){
  const steps = window.__STEPS__;
  const svg = document.querySelector('svg.d');
  const els = [...svg.querySelectorAll('[data-stage]')];
  const cap = document.querySelector('.cap');
  const dots = document.querySelector('.steps');
  let cur = 1, timer = null;
  const total = steps.length;
  for (let i=1;i<=total;i++){ const b=document.createElement('button'); b.textContent=i; b.setAttribute('aria-label','Step '+i); b.onclick=()=>go(i,true); dots.appendChild(b); }
  function render(){
    els.forEach(e=>{ const s=+e.dataset.stage; e.classList.toggle('pending', s>cur); e.classList.toggle('is-on', s<=cur); });
    const st = steps[cur-1]; cap.innerHTML = '<b>'+st[0]+'</b><span>'+st[1]+'</span>';
    [...dots.children].forEach((b,i)=>b.setAttribute('aria-pressed', i+1===cur ? 'true':'false'));
  }
  function go(n, stop){ cur=Math.max(1,Math.min(total,n)); render(); if(stop) pause(); }
  function play(){ if(timer) return; document.getElementById('play').setAttribute('aria-pressed','true'); if(cur>=total) cur=0; step(); timer=setInterval(()=>{ if(cur>=total){ pause(); return;} step(); }, 3200); }
  function step(){ go(cur+1); }
  function pause(){ clearInterval(timer); timer=null; document.getElementById('play').setAttribute('aria-pressed','false'); }
  document.getElementById('play').onclick=()=> timer?pause():play();
  document.getElementById('prev').onclick=()=>go(cur-1,true);
  document.getElementById('next').onclick=()=>go(cur+1,true);
  document.getElementById('all').onclick=()=>go(total,true);
  document.addEventListener('keydown',e=>{ if(e.key==='ArrowRight') go(cur+1,true); if(e.key==='ArrowLeft') go(cur-1,true); if(e.key===' '){e.preventDefault(); timer?pause():play();} });
  // hover-to-trace: light every edge that touches the node, dim the rest
  const edges=[...svg.querySelectorAll('.edge')];
  svg.querySelectorAll('.node').forEach(n=>{
    const id=n.dataset.node;
    const on=()=>{ edges.forEach(e=>{ const hit=e.dataset.src===id||e.dataset.dst===id; e.classList.toggle('lit',hit); e.classList.toggle('dim',!hit&&!!(e.dataset.src||e.dataset.dst)); }); n.classList.add('lit'); };
    const off=()=>{ edges.forEach(e=>e.classList.remove('lit','dim')); n.classList.remove('lit'); };
    n.addEventListener('mouseenter',on); n.addEventListener('mouseleave',off); n.addEventListener('focus',on); n.addEventListener('blur',off);
  });
  // theme
  const root=document.documentElement, tb=document.getElementById('theme');
  try{ const saved=localStorage.getItem('myeview-diagram-theme'); if(saved) root.dataset.theme=saved; }catch(_){}
  tb.onclick=()=>{ const next=(root.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'))==='dark'?'light':'dark'; root.dataset.theme=next; try{localStorage.setItem('myeview-diagram-theme',next);}catch(_){} };
  go(1);
})();
"""

def page(title, claim, aria, svg_inner, vb, steps, legend, out, subtitle="System diagram"):
    legend_html = "".join(f'<span><i class="{c}"></i>{esc(t)}</span>' for c, t in legend)
    doc = f'''<title>{esc(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap">
<style>{CSS.replace("__LOGO__", LOGO)}</style>
<header class="top">
  <div class="mark" aria-hidden="true"></div>
  <div class="wordmark">MYEVIEW<small>{esc(subtitle)}</small></div>
  <div class="title"><h1>{esc(title)}</h1><p>{esc(claim)}</p></div>
  <div class="right"><button id="theme" type="button" title="Light / dark">Theme</button></div>
</header>
<main class="stage">
  <figure>
    <svg class="d" viewBox="0 0 {vb[0]} {vb[1]}" role="img" aria-label="{esc(aria)}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
{svg_inner}
    </svg>
    <figcaption>{esc(aria)}</figcaption>
  </figure>
</main>
<div class="bar">
  <div class="controls">
    <button id="prev" type="button" aria-label="Previous step">◀</button>
    <button id="play" type="button" aria-pressed="false">Play</button>
    <button id="next" type="button" aria-label="Next step">▶</button>
    <div class="steps" role="group" aria-label="Steps"></div>
    <button id="all" type="button">All</button>
  </div>
  <div class="cap" aria-live="polite"></div>
</div>
<div class="legend">{legend_html}<span style="margin-left:auto">← → step · space play · hover a component to trace it</span></div>
<script>window.__STEPS__={json.dumps(steps, ensure_ascii=False)};</script>
<script>{JS}</script>
'''
    Path(out).write_text(doc, encoding="utf-8")
    return out
