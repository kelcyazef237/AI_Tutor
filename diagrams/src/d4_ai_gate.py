"""d4 — How the Analyst Stays Honest: one question's path from keyboard to verified answer."""
from lib import *

W, H = 1280, 700
g = []
g.append(defs(["react","fastapi","postgresql","deepseek","nvidia","redis",
               "lucide-shield-check","lucide-key","lucide-database","lucide-eye","lucide-file-text","lucide-lock","lucide-activity","lucide-gauge","lucide-layers"]))

# ---- zones -----------------------------------------------------------------
g.append(zone(20, 60, 260, 640, "Asking", "plain", 1, "the browser"))
g.append(zone(310, 60, 680, 640, "The grounding gate", "", 2, "inside the API — every question, every time"))
g.append(zone(1030, 60, 230, 300, "AI provider", "plain", 4, "sees a summary, never the database"))
g.append(zone(1030, 400, 230, 300, "Deterministic", "plain", 6, "the answer that needs no model"))

# ---- asking -----------------------------------------------------------------
g.append(node("q", 36, 110, 228, 96, "A question", "typed in the analyst chat", "react", 1, "brand"))
g.append(note(54, 172, "“Which sector is weakest", "mono", stage=1)); g.append(note(54, 188, "  across the estate?”", "mono", stage=1))
g.append(node("who", 36, 236, 228, 118, "Who is asking", "role decides scope", "lucide-key", 2))
for i, (a, b) in enumerate([("owner", "own organisation only"), ("admin", "estate · sector · one org"), ("public", "no analyst at all")]):
    g.append(note(54, 300 + i*16, a, "mono strong", stage=2)); g.append(note(112, 300 + i*16, b, stage=2))
g.append(node("shown", 36, 560, 228, 118, "What the reader sees", "written live, then verified", "lucide-eye", 5, "brand", ["grounded","sources","chart"]))
g.append(note(54, 618, "first word ≈ 1 s · SSE stream", "mono", stage=5))

# ---- gate · column A ----------------------------------------------------------
g.append(node("limit", 330, 110, 280, 74, "Rate limit", "per user, per hour — in Redis", "redis", 2, "", ["429 with Retry-After"]))
g.append(node("ctx", 330, 220, 280, 146, "Context", "database rows only", "postgresql", 3, "brand"))
for i, line in enumerate(["score · findings · sector means · ranks", "owner  → their org, nothing about others", "estate → no org in focus, sector tables", "never raw evidence · never other owners"]):
    g.append(note(348, 284 + i*16, line, "mono", stage=3))
g.append(node("brief", 330, 404, 280, 104, "Audience brief", "one of three, chosen by scope", "lucide-file-text", 4, "", ["owner","org","estate"]))
g.append(note(348, 468, "what may be said, and to whom", "mono", stage=4))

# ---- gate · column B ----------------------------------------------------------
g.append(node("prompt", 690, 110, 280, 118, "The prompt", "brief · format · catalogue · context", "lucide-layers", 4, "", ["stable prefix","question last"]))
g.append(note(708, 174, "same front, every question →", "mono", stage=4)); g.append(note(708, 190, "the provider's cache already knows it", "mono", stage=4))
g.append(node("verify", 690, 264, 280, 130, "The validator", "runs on the finished answer", "lucide-shield-check", 5, "brand"))
for i, line in enumerate(["every source must resolve to context", "no figure the rows do not contain", "chart = a request by kind, no numbers", "fail → the deterministic answer"]):
    g.append(note(708, 328 + i*16, line, "mono", stage=5))
g.append(node("charts", 690, 430, 280, 74, "Charts", "drawn from database rows only", "lucide-gauge", 5, "", ["sector_comparison","trend"]))
g.append(node("stream", 690, 540, 280, 74, "Stream + final", "deltas, then one final event", "lucide-activity", 5, "", ["delta · delta · final"]))
g.append(note(330, 684, "the model never emits chart data · the API never trusts a citation it cannot find in its own context", "strong", stage=5))

# ---- provider ---------------------------------------------------------------
g.append(node("ds", 1042, 110, 206, 74, "DeepSeek API", "cloud · today", "deepseek", 4, "ext", ["prefix cache hit"]))
g.append(note(1145, 202, "— or —", "mono", anchor="middle", stage=4))
g.append(node("ol", 1042, 216, 206, 74, "DGX Spark · Ollama", "sovereign · same code", "nvidia", 4, "", ["not yet"]))
g.append(note(1060, 318, "in: brief + context + question", "mono", stage=4)); g.append(note(1060, 334, "out: text, sources, chart kinds", "mono", stage=4))

# ---- deterministic --------------------------------------------------------------
g.append(node("det", 1042, 450, 206, 96, "Templates over rows", "same context, no model", "lucide-file-text", 6, "brand", ["grounded: false"]))
for i, line in enumerate(["used when the provider is down,", "slow past 40 s, or the validator", "rejects what came back —", "the reader is told which"]):
    g.append(note(1060, 580 + i*16, line, stage=6))

# ---- edges ------------------------------------------------------------------------
g.append(edge("q-l", link(264,158, 330,147), "stream", 2, "stream", "q", "limit", mid=(297,128), packets=2, dur=2.2))
g.append(edge("who-l", link(264,290, 330,170), "role", 2, "", "who", "limit", mid=(297,232)))
g.append(edge("l-c", vlink(470,184, 470,220), "allowed", 3, "", "limit", "ctx", mid=(512,202)))
g.append(edge("c-p", "M 610 250 C 648 250, 648 190, 690 190", "context", 4, "", "ctx", "prompt", mid=(650,224), packets=2, dur=2.2))
g.append(edge("b-p", "M 610 440 C 664 440, 664 210, 690 210", "brief", 4, "", "brief", "prompt", mid=(664,330)))
g.append(edge("p-ds", link(970,150, 1042,147), "summary", 4, "stream", "prompt", "ds", mid=(1006,132), packets=2, dur=2.2))
g.append(edge("ds-v", "M 1042 170 C 1000 170, 1000 300, 970 300", "streamed JSON", 5, "stream", "ds", "verify", mid=(1006,238), packets=2, dur=2.2))
g.append(edge("v-ch", vlink(830,394, 830,430), "kinds only", 5, "", "verify", "charts", mid=(880,412)))
g.append(edge("ch-s", vlink(830,504, 830,540), None, 5, "", "charts", "stream"))
g.append(edge("v-det", link(970,380, 1042,450), "if it fails", 6, "bad", "verify", "det", mid=(1000,412), packets=1, dur=2.4))
g.append(edge("det-s", "M 1042 520 C 1000 520, 1000 577, 970 577", None, 6, "bad", "det", "stream", packets=1, dur=2.4))
g.append(edge("s-shown", "M 690 577 C 500 577, 420 619, 264 619", "text · sources · charts · grounded", 5, "stream", "stream", "shown", mid=(470,596), packets=3, dur=2.4))

steps = [
  ["1 · A question", "Someone types a question in the analyst chat. Nothing about the answer is decided by the wording — the next two boxes decide it."],
  ["2 · Scope is decided by role, not by the model", "The API fixes who the answer may be about before anything else runs: an owner can only ask about their own organisation, an administrator about the estate, a sector, or one selected organisation; the public has no analyst. A per-user hourly rate limit in Redis stops abuse with a polite 429."],
  ["3 · Context is database rows only", "The gate assembles what the model is allowed to know: the score, the findings, sector means and ranks — read from Postgres, never recomputed. For an owner it carries nothing about anyone else; for an estate question it deliberately carries no single organisation. Raw evidence never leaves the database."],
  ["4 · One prompt, a stable prefix", "The audience brief — owner, organisation or estate — says what may be said and to whom. It, the format rules, the chart catalogue and the context come first and are identical from one question to the next; the question is last. The provider's prefix cache already knows the front of the prompt, which is why the first word arrives in about a second. Today the provider is DeepSeek's API; the sovereign option is a DGX Spark running Ollama with the same code."],
  ["5 · The validator has the last word", "The model's text streams to the reader as it is written. When it finishes, the validator checks every cited source against the context, refuses any figure the rows do not contain, and turns each chart request — a kind, never numbers — into a chart drawn from database rows. The final event replaces the streamed text; in the normal case nothing changes."],
  ["6 · The deterministic answer", "If the provider is down, slower than forty seconds, or the validator rejects what came back, a templated answer over the same rows is sent instead and marked grounded: false. The reader always gets an answer, and is always told which kind."],
]
legend = [("", "inside the API"), ("dash", "streamed"), ("warn dash", "fallback path"), ("dot", "data in motion"), ("zone", "grounding gate"), ("zone warn", "")]
legend = legend[:-1]
out = page("How the Analyst Stays Honest", "A question's path from the keyboard to a verified answer — and why the model never gets to invent a number.",
           "Flow diagram: a question from the browser passes a role-based scope check and rate limit, a context built from database rows only, a prompt with a stable prefix to the AI provider, then a validator that checks every citation and draws charts from rows; failures fall back to a deterministic templated answer marked grounded false.",
           "\n".join(g), (W, H), steps, legend, "d4_ai_gate.html", "Analyst grounding")
print(out)
