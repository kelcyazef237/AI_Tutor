"""From Domain to Score — how one scan turns public evidence into a published rating."""
from lib import *

W, H = 1280, 720
g = []
g.append(defs(["lucide-globe","lucide-search","lucide-file-text","lucide-siren","lucide-shield-check","lucide-radar",
               "lucide-layers","lucide-gauge","postgresql","lucide-landmark","lucide-webhook","n8n","lucide-bot","lucide-database"]))

# zones
g.append(zone(20, 60, 300, 640, "Public internet", "warn", 1, "somebody else's servers"))
g.append(zone(350, 60, 910, 640, "MYEVIEW", "", 1, "inside ANTIC's infrastructure"))

# sources (untrusted)
g.append(node("target", 40, 104, 260, 74, "Public surface", "the organisation's own servers", "lucide-globe", 1, "ext", ["DNS","TLS","HTTP","MX"]))
g.append(node("ct", 40, 198, 260, 60, "Certificate logs & hosts", "crt.sh · certspotter · hackertarget", "lucide-search", 1, "ext"))
g.append(node("rdap", 40, 278, 260, 60, "Registration records", "rdap.org first · WHOIS fallback", "lucide-file-text", 1, "ext"))
g.append(node("feeds", 40, 358, 260, 74, "Threat feeds", "PhishTank · OpenPhish · Feodo", "lucide-siren", 1, "ext", ["Spamhaus","OTX","hourly"]))
g.append(node("dnsbl", 40, 452, 260, 60, "DNS blocklists", "is the mail server listed anywhere?", "lucide-shield-check", 1, "ext"))
for i, line in enumerate(["Read only, always.", "No login, no exploitation, no writes:", "MYEVIEW never sends a packet that", "changes anything on these servers.", "", "The port scan is the one active probe,", "and it runs only for organisations", "that have opted in and verified", "ownership of the domain."]):
    g.append(note(40, 552 + i*15, line, "strong" if i == 0 else "", stage=2))

# collectors
g.append(node("collect", 380, 104, 210, 232, "10 collectors", "async · in parallel", "lucide-radar", 1, "", ["quorum ×3","SSRF guard"]))
for i, line in enumerate(["dns · email security", "tls · http headers", "rdap / whois", "threat intel · dnsbl", "asset discovery", "portscan — verified tier only"]):
    g.append(note(398, 172 + i*17, line, "mono", stage=1))

# normalise
g.append(node("norm", 670, 104, 240, 130, "7 normalisers", "one state per check", "lucide-layers", 3, "", ["PASS","WARN","FAIL","UNSEEN"]))
g.append(note(688, 170, "same evidence → same state, always", stage=3))
g.append(note(688, 187, "unseen is neither a pass nor a fail", stage=3))

# score
g.append(node("score", 960, 104, 280, 232, "Scoring engine", "same states, same score", "lucide-gauge", 4, "brand", ["ruleset v1 · YAML","stabiliser"]))
for i, line in enumerate(["7 categories · every scored check", "points withheld for what could not be seen", "carry-forward for flaky checks", "coverage floor decides 'publishable'", "", "score  /1000  ·  Shield tier  1–5", "coverage  %  ·  confidence"]):
    g.append(note(978, 172 + i*17, line, "mono" if i >= 5 else "", stage=4))

# persist + fan-out
g.append(node("pg", 380, 452, 230, 74, "Postgres", "score · findings · history", "postgresql", 5, "brand"))
g.append(node("reports", 660, 400, 250, 74, "Reports", "HTML & PDF · EN / FR", "lucide-file-text", 6, "", ["WeasyPrint","pre-rendered"]))
g.append(node("console", 660, 490, 250, 60, "Console & Index", "leaderboard · matrix · alerts", "lucide-landmark", 6))
g.append(node("hooks", 660, 566, 250, 74, "Webhooks", "4 events · retried · logged", "lucide-webhook", 6, "", ["scan.completed","tier.changed"]))
g.append(node("n8n", 980, 566, 260, 74, "n8n", "mail · chat · tickets", "n8n", 6, "", ["signature verified"]))
g.append(node("ai", 380, 566, 230, 74, "AI commentary", "written on a worker", "lucide-bot", 6, "", ["5 per month","validated"]))

# edges — stage 2: collect
g.append(edge("t",  link(300,141, 380,190), "read-only", 2, "untrusted", "target", "collect", mid=(336,158), packets=3, dur=2.2))
g.append(edge("c",  link(300,228, 380,205), None, 2, "untrusted", "ct", "collect", packets=2))
g.append(edge("r",  link(300,308, 380,220), None, 2, "untrusted", "rdap", "collect", packets=2))
g.append(edge("f",  link(300,395, 380,236), "hourly", 2, "untrusted", "feeds", "collect", mid=(336,318), packets=2, dur=3.2))
g.append(edge("b",  link(300,482, 380,252), None, 2, "untrusted", "dnsbl", "collect", packets=1, dur=3.4))
# stage 3–5: through the engine
g.append(edge("n",  link(590,170, 670,170), "evidence", 3, "", "collect", "norm", mid=(630,150)))
g.append(edge("s",  link(910,170, 960,170), "states", 4, "", "norm", "score", mid=(935,150)))
g.append(edge("p",  "M 1100 336 C 1100 420, 620 400, 610 480", "one Score row · every finding", 5, "", "score", "pg", mid=(1000,372), packets=3, dur=3))
# stage 6: fan-out
g.append(edge("rep", link(610,470, 660,437), None, 6, "", "pg", "reports"))
g.append(edge("con", link(610,489, 660,520), None, 6, "", "pg", "console"))
g.append(edge("hk",  link(610,508, 660,603), None, 6, "", "pg", "hooks"))
g.append(edge("nn",  link(910,603, 980,603), "HMAC", 6, "signed", "hooks", "n8n", mid=(945,583), lcls="ok"))
g.append(edge("aiin", vlink(470,526, 470,566), "evidence", 6, "stream", "pg", "ai", mid=(430,546), packets=2, dur=2.2))
g.append(edge("aiout", vlink(520,566, 520,526), "commentary", 6, "stream", "ai", "pg", mid=(575,546), packets=1, dur=2.2))
g.append(note(1240, 682, "every number on every surface is read back from these rows — nothing is recomputed on the way out", "strong", "end", 6))

steps = [
  ["1 · A scan is requested", "By an owner, an administrator, the weekly schedule, or an MCP call. Everything left of the boundary is somebody else's server; MYEVIEW only reads."],
  ["2 · Collect", "Ten collectors run in parallel against the organisation's public surface and against public records. Read-only probes, three-resolver DNS quorum, an SSRF guard, and a timeout budget — the port scan runs only for organisations that opted in."],
  ["3 · Normalise", "Seven normalisers turn each collector's raw payload into one of four states per check. No judgement is made here; a check that could not be observed is neither a pass nor a fail."],
  ["4 · Score", "The engine applies the versioned ruleset — the same states always give the same score. Points for unobserved checks are withheld, not awarded; below the coverage floor the score is provisional and kept out of the index."],
  ["5 · Persist", "One Score row, every finding, the category points and a history point land in Postgres. Every surface downstream reads from these rows."],
  ["6 · Fan out", "Reports render from a fact bundle (pre-rendered as PDFs on a worker). The console and National Index re-aggregate. Four webhook events go out HMAC-signed — n8n ships with six workflows to consume them. AI commentary is written off-request and stored back on the score."],
]
legend = [("", "inside MYEVIEW"), ("warn dash", "untrusted — read only"), ("dot", "data in motion"), ("zone warn", "public internet"), ("zone", "ANTIC infrastructure")]
out = page("From Domain to Score", "How one scan turns public evidence into a published rating — and why every number downstream is the same number.",
           "Flow diagram: public sources feed ten collectors, seven normalisers produce vector states, the scoring engine writes a score to Postgres, which fans out to reports, the console, signed webhooks to n8n, and AI commentary.",
           "\n".join(g), (W, H), steps, legend, "d1_pipeline.html", "Scan pipeline")
print(out)
