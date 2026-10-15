"""d3 — MYEVIEW Deployment: one host, two networks, and the knobs that make it more."""
from lib import *

W, H = 1280, 740
g = []
g.append(defs(["docker","react","fastapi","postgresql","redis","celery","nvidia","deepseek",
               "lucide-globe","lucide-server","lucide-database","lucide-lock","lucide-cpu","lucide-radar","lucide-gauge","lucide-activity"]))

# ---- zones -----------------------------------------------------------------
g.append(zone(20, 60, 230, 300, "Internet", "warn", 2, "people and public sources"))
g.append(zone(20, 400, 230, 300, "AI provider", "plain", 5, "one of two, chosen by config"))
g.append(zone(280, 60, 720, 640, "One host · Docker Compose", "", 1, "six containers · two networks · two volumes"))
g.append(zone(300, 118, 680, 170, "network: edge", "plain", 1, "routable — the only way in"))
g.append(zone(300, 322, 680, 356, "network: data", "plain", 3, "internal: true — no route off the host, ever"))
g.append(zone(1030, 60, 230, 640, "Growing", "plain", 6, "what changes when demand does"))

# ---- internet ----------------------------------------------------------------
g.append(node("browser", 32, 110, 206, 74, "Browsers", "owners · admins · public", "lucide-globe", 2, "ext", ["HTTPS"]))
g.append(node("sources", 32, 214, 206, 126, "Public sources", "domains · records · feeds", "lucide-radar", 4, "ext", ["read only"]))
for i, line in enumerate(["DNS · TLS · HTTP · mail", "crt.sh · RDAP · WHOIS", "PhishTank · URLhaus · OTX …"]):
    g.append(note(50, 268 + i*16, line, "mono", stage=4))

# ---- AI provider -------------------------------------------------------------
g.append(node("deepseek", 32, 450, 206, 74, "DeepSeek API", "cloud · today", "deepseek", 5, "ext", ["summary out","text back"]))
g.append(node("dgx", 32, 560, 206, 100, "DGX Spark", "Ollama · Mistral Small 4", "nvidia", 5, "brand", ["128 GB","240 W"]))
g.append(note(50, 640, "same code · AI_PROVIDER=ollama", "mono", stage=5))
g.append(note(50, 690, "one of the two is reachable at a time", stage=5))

# ---- edge network -------------------------------------------------------------
g.append(node("nginx", 320, 160, 300, 96, "frontend", "nginx · React build · reverse proxy", "react", 2, "", ["port 80 → host","256 MB"]))
g.append(note(372, 228, "/api/*  →  http://backend:8000", "mono", stage=2))
g.append(node("api", 660, 160, 300, 96, "backend", "FastAPI · uvicorn", "fastapi", 2, "brand", ["127.0.0.1:8000","2 workers","1 GB"]))
g.append(note(712, 228, "on both networks — the bridge", "mono", stage=2))

# ---- data network -------------------------------------------------------------
g.append(node("pg", 320, 366, 300, 96, "postgres", "15-alpine · every score and finding", "postgresql", 3, "brand", ["127.0.0.1:5432","1 GB"]))
g.append(node("redis", 660, 366, 300, 96, "redis", "7-alpine · broker · cache · limits", "redis", 3, "", ["appendonly yes","384 MB"]))
g.append(node("worker", 320, 520, 300, 96, "celery-worker", "scans · AI reports · PDFs", "celery", 4, "", ["CELERY_CONCURRENCY=4","1.5 GB"]))
g.append(note(372, 588, "queues: celery, verified · 200 tasks per child", "mono", stage=4))
g.append(node("beat", 660, 520, 300, 96, "celery-beat", "the clock: hourly · weekly · monthly", "celery", 4, "", ["one instance","384 MB"]))
g.append(note(712, 588, "schedules only — never runs the work", "mono", stage=4))

# volumes
def volume(vid, x, y, label, sub, stage):
    return (f'<g id="n-{vid}" class="node vol" data-stage="{stage}" data-node="{vid}" tabindex="0">'
            f'<path class="card" d="M {x} {y+8} a 40 8 0 0 1 80 0 v 30 a 40 8 0 0 1 -80 0 z"/>'
            f'<path class="card" d="M {x} {y+8} a 40 8 0 0 0 80 0" fill="none"/>'
            f'<text class="n-t" x="{x+40}" y="{y+28}" text-anchor="middle" style="font-size:11.5px">{esc(label)}</text>'
            f'<text class="n-s" x="{x+40}" y="{y+62}" text-anchor="middle">{esc(sub)}</text></g>')
g.append(volume("pgdata", 430, 630, "pgdata", "the database survives", 3))
g.append(volume("redisdata", 770, 630, "redisdata", "queue survives a restart", 3))

# ---- growing ------------------------------------------------------------------
g.append(node("knobs", 1042, 110, 206, 104, "Two knobs", "in .env — no code change", "lucide-gauge", 6, "brand"))
g.append(note(1060, 172, "WEB_CONCURRENCY   2 → 4", "mono", stage=6)); g.append(note(1060, 190, "CELERY_CONCURRENCY 4 → 8", "mono", stage=6))
g.append(node("mem", 1042, 236, 206, 118, "Memory budget", "reserved limits, added up", "lucide-cpu", 6))
for i, line in enumerate(["≈ 4.5 GB reserved today", "8 GB host: comfortable", "16 GB: room to double both"]):
    g.append(note(1060, 298 + i*16, line, "mono" if i == 0 else "", stage=6))
g.append(node("split", 1042, 376, 206, 118, "Second host", "when one is not enough", "lucide-server", 6))
for i, line in enumerate(["move postgres + redis", "keep the data network private", "add worker hosts, same image"]):
    g.append(note(1060, 438 + i*16, line, stage=6))
g.append(node("backup", 1042, 516, 206, 96, "What to back up", "two volumes, one file", "lucide-database", 6))
for i, line in enumerate(["pgdata nightly · redisdata optional", ".env holds the keys — never in git"]):
    g.append(note(1060, 578 + i*16, line, "mono" if i == 0 else "", stage=6))
g.append(note(1145, 660, "the browser never reaches", stage=1, anchor="middle"))
g.append(note(1145, 676, "postgres, redis or the workers", stage=1, anchor="middle"))

# ---- edges -----------------------------------------------------------------------
g.append(edge("b-n", link(238,147, 320,200), "HTTPS · :80", 2, "stream", "browser", "nginx", mid=(272,160), packets=3, dur=2.2))
g.append(edge("n-a", link(620,208, 660,208), "proxy", 2, "", "nginx", "api", mid=(640,196)))
g.append(edge("a-pg", "M 700 256 C 700 300, 420 320, 400 366", "SQL", 3, "", "api", "pg", mid=(548,318), packets=2, dur=2.4))
g.append(edge("a-r", vlink(810,256, 810,366), "cache · jobs", 3, "", "api", "redis", mid=(858,312), packets=2, dur=2.4))
g.append(edge("r-w", "M 700 462 C 700 490, 520 500, 500 520", "jobs", 4, "", "redis", "worker", mid=(600,502)))
g.append(edge("w-pg", vlink(400,520, 400,462), "writes", 4, "", "worker", "pg", mid=(370,492)))
g.append(edge("b-r", vlink(810,520, 810,462), "ticks", 4, "", "beat", "redis", mid=(846,492)))
g.append(edge("w-src", "M 320 560 C 290 560, 280 300, 238 280", "collectors · read only", 4, "untrusted", "worker", "sources", mid=(262,384), packets=3, dur=3))
g.append(edge("w-ai", "M 320 590 C 290 590, 300 487, 238 487", "summary out", 5, "stream", "worker", "deepseek", mid=(268,560), packets=2, dur=2.6))
g.append(edge("w-dgx", "M 320 600 C 290 600, 300 610, 238 610", None, 5, "optional", "worker", "dgx", packets=0))
g.append(edge("pg-v", vlink(470,462, 470,630), None, 3, "", "pg", "pgdata", packets=0))
g.append(edge("r-v", vlink(880,462, 880,630), None, 3, "", "redis", "redisdata", packets=0))

steps = [
  ["1 · One host, two networks", "Everything runs as six containers on one machine under Docker Compose. Two private networks split them: `edge`, which the outside can reach, and `data`, marked internal so it has no route off the host at all. Only the backend sits on both — it is the bridge."],
  ["2 · The only way in", "A browser reaches nginx on port 80 — the one published port. nginx serves the React build and proxies `/api/*` to the backend, which listens on 127.0.0.1:8000 and is never exposed directly. Two API processes by default."],
  ["3 · What must survive", "Postgres holds every score, finding and piece of evidence on the `pgdata` volume; Redis is the job broker, the response cache and the rate limiter on `redisdata`, with append-only persistence so a queued job survives a restart. Both bind to 127.0.0.1 only, for the administrator's own tools."],
  ["4 · Where the work happens", "Four Celery workers run the scans, the AI reports, the PDF renders and the cache warm-ups — this is the only container that talks to the public internet, dashed amber, read-only. `celery-beat` is the clock: hourly feeds, weekly scans, monthly reports. It schedules and never executes."],
  ["5 · The AI provider is a setting", "AI commentary goes out as a summary and comes back as text. Today that is DeepSeek's cloud API. The sovereign option is an NVIDIA DGX Spark on the same network running Ollama with Mistral Small 4 — the same code, one environment variable, nothing else changes."],
  ["6 · Growing", "Two numbers in `.env` scale it without a code change. The memory limits add up to about 4.5 GB, so an 8 GB host is comfortable and 16 GB leaves room to double both knobs. Beyond one machine: move Postgres and Redis to their own host, keep the data network private, and add worker hosts from the same image. Back up `pgdata` nightly; `.env` holds every secret and never enters git."],
]
legend = [("", "inside the host"), ("dash", "HTTPS / streamed"), ("warn dash", "public internet — read only"), ("dot", "data in motion"), ("zone", "Docker Compose host"), ("zone warn", "outside")]
out = page("MYEVIEW Deployment", "Six containers, two networks, one published port — and the two knobs that make it bigger.",
           "Deployment diagram: browsers reach nginx on port 80, which proxies to a FastAPI backend on the edge network; Postgres, Redis, Celery worker and beat live on an internal data network with two volumes; the worker alone reaches the public internet read-only and the AI provider, cloud DeepSeek today or a local DGX Spark; a side column lists the scaling knobs, memory budget, second-host split and backups.",
           "\n".join(g), (W, H), steps, legend, "d3_deployment.html", "Deployment")
print(out)
