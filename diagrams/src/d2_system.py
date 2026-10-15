"""MYEVIEW System Map — who talks to whom, and across which boundary."""
from lib import *

W, H = 1280, 740
g = []
g.append(defs(["react","fastapi","postgresql","redis","celery","lucide-radar","lucide-shield-check","lucide-webhook","n8n","lucide-bot",
               "deepseek","nvidia","lucide-globe","lucide-file-text","lucide-siren","lucide-network"]))

# zones
g.append(zone(20, 60, 220, 300, "People", "plain", 1))
g.append(zone(20, 400, 220, 300, "Automation & agents", "plain", 6, "outside, by invitation"))
g.append(zone(280, 60, 720, 640, "MYEVIEW", "", 1))
g.append(zone(1030, 60, 230, 420, "Public internet", "warn", 4, "untrusted · read only"))
g.append(zone(1030, 520, 230, 180, "AI provider", "plain", 5, "sends a summary out, gets text back"))

# people
g.append(node("browser", 32, 110, 196, 90, "Browser", "React SPA", "react", 1, "", ["owner","admin","public"]))
g.append(note(46, 232, "public lookup · owner dashboard", stage=1)); g.append(note(46, 249, "admin console · analyst chat", stage=1))
g.append(node("n8n", 32, 450, 196, 74, "n8n", "mail · chat · tickets", "n8n", 6, "", ["verifies signature"]))
g.append(node("agents", 32, 570, 196, 74, "AI agents", "Claude and others", "lucide-bot", 6, "", ["10 tools","via MCP"]))

# MYEVIEW column A
g.append(node("api", 300, 110, 240, 74, "API", "FastAPI · uvicorn workers", "fastapi", 1, "brand", ["REST · JSON","SSE"]))
g.append(node("mcp", 300, 240, 240, 60, "MCP server", "read tools · rescan · bearer", "lucide-network", 6))
g.append(node("hooks", 300, 360, 240, 60, "Webhook dispatcher", "4 events · retries · log", "lucide-webhook", 6))
g.append(node("gate", 300, 500, 680, 70, "Grounding gate", "scope by role · database rows only · every citation must resolve, or the deterministic answer stands", "lucide-shield-check", 5, "brand", ["grounded: true / false"]))
g.append(note(296, 690, "inside ANTIC's infrastructure — one host today, more when needed; nothing here is per-process except a cache", stage=1))
# column B
g.append(node("pg", 596, 110, 218, 74, "Postgres", "scores · findings · evidence", "postgresql", 2, "brand"))
g.append(node("redis", 840, 110, 140, 74, "Redis", "broker · cache", "redis", 2))
g.append(node("workers", 600, 240, 380, 74, "Celery workers", "scans · AI reports · PDFs · cache warm-ups", "celery", 3, "", ["queue celery","queue verified","beat schedules"]))
g.append(node("collect", 600, 360, 380, 66, "10 collectors", "async · read-only · SSRF guard · resolver quorum ×3", "lucide-radar", 3))

# internet
g.append(node("targets", 1050, 100, 190, 90, "Organisations", "DNS · TLS · HTTP · mail", "lucide-globe", 4, "ext", ["32 today"]))
g.append(node("records", 1050, 220, 190, 86, "Public records", "CT logs · RDAP · WHOIS", "lucide-file-text", 4, "ext"))
g.append(node("feeds", 1050, 340, 190, 116, "Threat feeds", "PhishTank · OpenPhish", "lucide-siren", 4, "ext"))
g.append(note(1068, 400, "URLhaus · Spamhaus · OTX", stage=4)); g.append(note(1068, 417, "pulled hourly, cached in Postgres", stage=4))

# AI
g.append(node("deepseek", 1050, 562, 190, 56, "DeepSeek API", "today · cloud", "deepseek", 5, "ext"))
g.append(node("ollama", 1050, 626, 190, 70, "DGX Spark", "Ollama · sovereign", "nvidia", 5, "", ["not yet"]))

# edges
g.append(edge("b-api", link(228,155, 300,147), "HTTPS · JSON · SSE", 1, "stream", "browser", "api", mid=(262,120), packets=3, dur=2.4))
g.append(edge("api-pg", link(540,140, 596,147), "SQL", 2, "", "api", "pg", mid=(570,128)))
g.append(edge("api-redis", "M 420 110 C 420 74, 910 74, 910 110", "cache · rate limits · jobs", 2, "", "api", "redis", mid=(660,80), packets=2, dur=3))
g.append(edge("redis-w", vlink(910,184, 910,240), "jobs", 3, "", "redis", "workers", mid=(928,214)))
g.append(edge("pg-w", vlink(705,184, 705,240), "reads · writes", 3, "", "pg", "workers", mid=(660,214)))
g.append(edge("w-c", vlink(790,314, 790,360), "runs a scan", 3, "", "workers", "collect", mid=(838,338)))
g.append(edge("c-t", "M 980 380 C 1010 380, 1010 145, 1050 145", "passive probes", 4, "untrusted", "collect", "targets", mid=(1005,326), packets=3, dur=2.4))
g.append(edge("c-r", "M 980 392 C 1010 392, 1010 263, 1050 263", None, 4, "untrusted", "collect", "records", packets=2))
g.append(edge("c-f", link(980,404, 1050,398), "hourly", 4, "untrusted", "collect", "feeds", mid=(1015,428), packets=2, dur=3.2))
g.append(edge("api-gate", "M 336 184 C 292 300, 292 400, 336 500", "question", 5, "stream", "api", "gate", mid=(300,342), packets=2, dur=2.8))
g.append(edge("gate-ds", link(980,528, 1050,584), "stable-prefix prompt", 5, "stream", "gate", "deepseek", mid=(1015,488), packets=2, dur=2.2))
g.append(edge("ds-gate", link(1050,598, 980,548), "streamed JSON", 5, "stream", "deepseek", "gate", mid=(995,628), packets=2, dur=2.2))
g.append(edge("gate-ol", link(980,556, 1050,661), None, 5, "optional", "gate", "ollama", packets=0))
g.append(edge("w-hooks", "M 600 290 C 570 300, 560 370, 540 380", "4 events", 6, "", "workers", "hooks", mid=(548,330)))
g.append(edge("hooks-n8n", link(300,392, 228,480), "HMAC-signed · retried", 6, "signed", "hooks", "n8n", mid=(262,432), lcls="ok", packets=2, dur=2.8))
g.append(edge("agents-mcp", link(228,600, 300,272), "bearer", 6, "", "agents", "mcp", mid=(256,548)))
g.append(edge("mcp-pg", "M 540 262 C 570 262, 578 200, 596 175", "read-only", 6, "", "mcp", "pg", mid=(572,222)))

steps = [
  ["1 · The front door", "One React application serves three audiences — public lookup, organisation owners, ANTIC administrators — over one API. Answers that take time stream back as server-sent events."],
  ["2 · What the API keeps", "Postgres holds every score, finding, piece of evidence and the AI-report ledger. Redis is the job broker, the response cache — ten minutes, or until a scan lands — and the rate limiter."],
  ["3 · Work that leaves the request path", "Celery workers run scans, write AI reports, pre-render PDFs and warm caches; beat schedules the hourly feeds, weekly scans, monthly report cycles and nightly drift check. The collectors run here, never in the API."],
  ["4 · The internet boundary", "Collectors read the assessed organisations' public surface and public records. Dashed amber: untrusted, read-only, guarded against SSRF, and every DNS answer confirmed by a three-resolver quorum."],
  ["5 · The AI boundary", "Every analyst question passes the grounding gate. Scope is fixed by role before the model sees anything, the context is database rows only, and an answer whose citations do not resolve is replaced by the deterministic one. Today's provider is DeepSeek's API; the sovereign option is the same code pointed at a local Ollama."],
  ["6 · What leaves, and who is let in", "Four webhook events go out HMAC-signed with retries and a delivery log — n8n ships with six workflows to consume them. AI agents come in through the MCP server: ten bearer-protected tools, read-only except rescan."],
]
legend = [("", "inside MYEVIEW"), ("dash", "streamed"), ("warn dash", "untrusted — read only"), ("dot", "data in motion"), ("zone", "ANTIC infrastructure"), ("zone warn", "public internet")]
out = page("MYEVIEW System Map", "Who talks to whom — and which two boundaries the data crosses on the way.",
           "Component diagram: a React browser talks to a FastAPI API backed by Postgres and Redis; Celery workers run ten collectors against the untrusted public internet; analyst questions pass a grounding gate before reaching the AI provider; webhooks leave HMAC-signed to n8n and AI agents enter via MCP.",
           "\n".join(g), (W, H), steps, legend, "d2_system.html", "System map")
print(out)
