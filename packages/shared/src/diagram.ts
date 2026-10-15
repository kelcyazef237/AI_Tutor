import { z } from 'zod';

/**
 * Diagram Studio — AI-generated animated topology diagrams.
 *
 * The model NEVER emits SVG. It emits this constrained JSON (zones / nodes /
 * edges / steps), the server validates and normalises it, and the web client
 * renders it deterministically (shared layout engine → inline SVG with SMIL
 * packet animation). Same spec → same picture, on every device.
 *
 *  GET    /api/diagrams                → DiagramSummaryDTO[]
 *  POST   /api/diagrams                body DiagramGenerateRequest → DiagramDTO
 *  GET    /api/diagrams/:id            → DiagramDTO
 *  POST   /api/diagrams/:id/refine     body DiagramRefineRequest → DiagramDTO
 *  DELETE /api/diagrams/:id            → { ok: true }
 * Errors: JSON { message, kind? } — AI failures use HTTP 429 (quota) / 503 with kind.
 */

/* ── Icon allow-list ─────────────────────────────────────────────
   Names map 1:1 to lucide-react components in the web icon registry
   (apps/web/src/lib/diagramIcons.tsx). The AI may only pick from here. */
export const DIAGRAM_ICONS = [
  'server', 'laptop', 'smartphone', 'monitor', 'tablet', 'printer', 'hard-drive', 'cpu', 'database',
  'cloud', 'globe', 'network', 'wifi', 'router', 'cable', 'plug', 'radio-tower', 'satellite', 'antenna',
  'terminal', 'code', 'file-code', 'file-text', 'file-key', 'folder', 'workflow', 'boxes', 'package', 'container',
  'key', 'key-round', 'lock', 'unlock', 'shield', 'shield-check', 'shield-alert', 'fingerprint', 'scan-face', 'vault',
  'user', 'users', 'user-cog', 'building', 'landmark', 'mail', 'phone', 'camera', 'bot',
  'bug', 'skull', 'crosshair', 'target', 'radar', 'eye', 'search', 'activity', 'gauge', 'zap', 'flame',
  'alert-triangle', 'alert-octagon', 'check-circle', 'x-circle', 'circle-dot', 'waypoints', 'route', 'git-branch',
  'git-merge', 'share', 'split', 'shuffle', 'repeat', 'refresh-cw', 'arrow-right-left', 'send', 'inbox',
  'upload', 'download', 'clock', 'hourglass', 'flask-conical', 'microscope', 'map', 'map-pin', 'compass', 'layers', 'box',
] as const;
export type DiagramIcon = (typeof DIAGRAM_ICONS)[number];

export const EDGE_KINDS = ['flow', 'untrusted', 'signed', 'stream', 'optional', 'danger'] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export const EDGE_KIND_LABEL: Record<EdgeKind, string> = {
  flow: 'data flow',
  untrusted: 'untrusted / read-only',
  signed: 'authenticated / signed',
  stream: 'continuous channel',
  optional: 'optional / conditional',
  danger: 'attack path',
};

/* ── Spec schema ─────────────────────────────────────────────── */

const DiagramId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,29}$/, 'ids are short slugs: a-z 0-9 - _')
  .describe('short unique slug, e.g. "dc1" or "ssh-jump"');

const StepNum = z.number().int().min(1).max(12).describe('1-based step at which this element appears');

export const DiagramZone = z.object({
  id: DiagramId,
  label: z.string().max(40).default('').describe('uppercase group title, e.g. "CORP.LOCAL"'),
  sub: z.string().max(60).optional().describe('one-line zone subtitle'),
  tone: z.enum(['brand', 'plain', 'warn']).default('brand').describe('brand = trusted/accent, plain = neutral boundary, warn = untrusted/external'),
  col: z.number().int().min(1).max(12).default(1).describe('grid column (1-12) on the 12-column canvas'),
  span: z.number().int().min(2).max(12).default(12).describe('grid span (2-12); use 12 full width, 6 half, 4 third'),
});
export type DiagramZone = z.infer<typeof DiagramZone>;

export const DiagramNode = z.object({
  id: DiagramId,
  title: z.string().min(1).max(46).describe('2-4 word component name, e.g. "Domain Controller"'),
  sub: z.string().max(72).optional().describe('one short line of detail, e.g. "KDC · DNS · ntds.dit"'),
  icon: z.enum([...DIAGRAM_ICONS]).default('box'),
  zone: z.string().optional().describe('zones[].id this node belongs to; omit for an open strip at the top'),
  tags: z.array(z.string().max(12)).max(4).default([]).describe('0-3 tiny mono pills, e.g. "10.0.0.5" or "kerberos"'),
  tone: z.enum(['std', 'brand', 'warn']).default('std'),
  /** Plain-language explanation shown when the student taps this component. */
  explain: z.string().max(700).optional().describe('1-3 short sentences in everyday language: what this is, what it does here, why it matters. Define any acronym on first use.'),
  step: StepNum,
});
export type DiagramNode = z.infer<typeof DiagramNode>;

export const DiagramEdge = z.object({
  id: DiagramId,
  from: DiagramId.describe('source nodes[].id'),
  to: DiagramId.describe('target nodes[].id'),
  label: z.string().max(24).optional().describe('short wire label, e.g. "SYN" or "TGT"'),
  kind: z.enum([...EDGE_KINDS]).default('flow'),
  packets: z.number().int().min(0).max(4).default(2).describe('0 = static wire, 1-3 for busy flows'),
  dur: z.number().min(1.4).max(4.5).default(2.6).describe('seconds per packet loop; vary 2-3.5 so wires do not pulse in lockstep'),
  route: z.enum(['auto', 'h', 'v', 'below', 'above']).default('auto').describe('below/above bow the wire out for return flows'),
  labelAt: z.enum(['start', 'mid', 'end']).default('mid'),
  /** Plain-language explanation of what travels on this wire and what the label means. */
  explain: z.string().max(700).optional().describe('1-3 short sentences in everyday language: what moves along this wire, what the label/acronym means, why it matters here.'),
  step: StepNum,
});
export type DiagramEdge = z.infer<typeof DiagramEdge>;

export const DiagramNote = z.object({
  zone: DiagramId.describe('zones[].id this note sits inside'),
  text: z.string().min(1).max(90).describe('a single factual line, mono-friendly, e.g. "ack = seq+1 only for SYN/FIN"'),
  style: z.enum(['plain', 'mono', 'strong']).default('plain'),
  step: StepNum.optional(),
});
export type DiagramNote = z.infer<typeof DiagramNote>;

export const DiagramStep = z.object({
  title: z.string().min(1).max(72).describe('3-6 words, e.g. "2 · NAT rewrite"'),
  caption: z.string().min(1).max(700).describe('1-3 sentences of teaching markdown: what happens and WHY it matters'),
});
export type DiagramStep = z.infer<typeof DiagramStep>;

export const DiagramLegendItem = z.object({
  kind: z.enum([...EDGE_KINDS, 'packet', 'zone', 'zone-warn', 'zone-plain']),
  label: z.string().max(40),
});
export type DiagramLegendItem = z.infer<typeof DiagramLegendItem>;

export const DiagramSpec = z.object({
  title: z.string().min(1).max(70),
  subtitle: z.string().max(140).default('').describe('one sentence framing the diagram'),
  alt: z.string().min(1).max(300).describe('accessible description of the whole picture'),
  zones: z.array(DiagramZone).min(1).max(10),
  nodes: z.array(DiagramNode).min(1).max(42),
  edges: z.array(DiagramEdge).max(72).default([]),
  notes: z.array(DiagramNote).max(24).default([]),
  steps: z.array(DiagramStep).min(2).max(12),
  legend: z.array(DiagramLegendItem).max(8).optional(),
});
export type DiagramSpec = z.infer<typeof DiagramSpec>;

/* ── Requests / DTOs ─────────────────────────────────────────── */

export const DiagramGenerateRequest = z.object({
  /** Preset topic id from DIAGRAM_TOPICS, or '' for a free prompt. */
  topic: z.string().max(60).default(''),
  prompt: z.string().trim().max(2000).default(''),
});
export type DiagramGenerateRequest = z.infer<typeof DiagramGenerateRequest>;

export const DiagramRefineRequest = z.object({
  instruction: z.string().trim().min(2).max(600).describe('e.g. "add a firewall between the DMZ and internal zone"'),
});
export type DiagramRefineRequest = z.infer<typeof DiagramRefineRequest>;

/** On-demand plain-language explanation for one component or link. */
export const DiagramExplainRequest = z.object({
  kind: z.enum(['node', 'edge']),
  id: z.string().min(1).max(64),
});
export type DiagramExplainRequest = z.infer<typeof DiagramExplainRequest>;

export interface DiagramExplainResponse {
  explanation: string;
}

/* ── Per-diagram chat ─────────────────────────────────────────────
   A saved conversation about one diagram: follow-up questions after the
   label popup, "what if" scenarios, deeper mechanics. Grounded in the spec. */

export const DiagramChatRequest = z.object({
  message: z.string().trim().min(1).max(2000),
  /** The element the student was looking at when they opened the chat. */
  focus: z.object({ kind: z.enum(['node', 'edge']), id: z.string().min(1).max(64) }).optional(),
});
export type DiagramChatRequest = z.infer<typeof DiagramChatRequest>;

export interface DiagramChatMessageDTO {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  /** Set on a user message asked while focused on an element. */
  focus: { kind: 'node' | 'edge'; id: string } | null;
  at: number;
}

/* ── Hand-arranged layout & edits ─────────────────────────────────
   Positions (and frame sizes) the student dragged, stored separately from
   the AI spec so a later refine never loses the arrangement. Canvas units. */
export const ZoneOverride = z.object({
  x: z.number(),
  y: z.number(),
  /** Frame width/height (zones can be resized); missing = automatic. */
  w: z.number().positive().optional(),
  h: z.number().positive().optional(),
});
export type ZoneOverride = z.infer<typeof ZoneOverride>;

export const DiagramLayoutOverrides = z.object({
  nodes: z.record(z.string(), z.object({ x: z.number(), y: z.number() })).default({}),
  zones: z.record(z.string(), ZoneOverride).default({}),
});
export type DiagramLayoutOverrides = z.infer<typeof DiagramLayoutOverrides>;

/** PATCH /api/diagrams/:id — label edits (full spec) and/or dragged positions. */
export const DiagramUpdateRequest = z.object({
  spec: DiagramSpec.optional(),
  layout: DiagramLayoutOverrides.optional(),
});
export type DiagramUpdateRequest = z.infer<typeof DiagramUpdateRequest>;

export const OVERRIDE_BOUND = 5000;
export function sanitizeLayout(layout: Partial<DiagramLayoutOverrides> | null | undefined, spec: Pick<DiagramSpec, 'nodes' | 'zones'>): DiagramLayoutOverrides {
  const ok = (v: number) => Number.isFinite(v) && Math.abs(v) <= OVERRIDE_BOUND;
  const okOpt = (v: number | undefined) => v === undefined || (v > 0 && ok(v));
  const pick = <T extends { x: number; y: number }>(rec: Record<string, T> | undefined, ids: Set<string>) =>
    Object.fromEntries(Object.entries(rec ?? {}).filter(([id, p]) => ids.has(id) && ok(p.x) && ok(p.y)));
  const pickZones = (rec: DiagramLayoutOverrides['zones'] | undefined, ids: Set<string>) =>
    Object.fromEntries(Object.entries(rec ?? {}).filter(([id, z]) => ids.has(id) && ok(z.x) && ok(z.y) && okOpt(z.w) && okOpt(z.h)));
  return {
    nodes: pick(layout?.nodes, new Set(spec.nodes.map((n) => n.id))),
    zones: pickZones(layout?.zones, new Set(spec.zones.map((z) => z.id))),
  };
}

export interface DiagramSummaryDTO {
  id: string;
  title: string;
  subtitle: string;
  topic: string;
  prompt: string;
  nodeCount: number;
  stepCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface DiagramRefinement {
  instruction: string;
  at: number;
}

export interface DiagramDTO extends DiagramSummaryDTO {
  spec: DiagramSpec;
  /** Dragged positions (canvas units), separate from the AI spec. */
  layout: DiagramLayoutOverrides;
  model: string;
  refinements: DiagramRefinement[];
}

/* ── Normalisation (server-side, after AI generation) ────────────
   Zod already enforces shapes and caps. This repairs semantics the
   model gets wrong: dangling edges, step monotonicity, icon names. */

const slug = (s: string, fallback: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || fallback;

export function normalizeSpec(input: DiagramSpec): { spec: DiagramSpec; repairs: string[] } {
  const repairs: string[] = [];
  const steps = Math.max(2, input.steps.length);
  const clampStep = (n: number) => Math.min(Math.max(1, n), steps);

  // Unique ids everywhere.
  const seen = new Set<string>();
  const uniq = (raw: string, fallback: string) => {
    let id = slug(raw, fallback) || fallback;
    if (seen.has(id)) {
      let i = 2;
      while (seen.has(`${id}-${i}`)) i++;
      id = `${id}-${i}`;
      repairs.push(`id collision: renamed to "${id}"`);
    }
    seen.add(id);
    return id;
  };

  const zoneIds = new Set<string>();
  const zones = input.zones.map((zn, i) => {
    const id = uniq(zn.id, `zone-${i + 1}`);
    zoneIds.add(id);
    return { ...zn, id };
  });

  const nodeIds = new Set<string>();
  const nodes = input.nodes.map((n, i) => {
    const id = uniq(n.id, `node-${i + 1}`);
    nodeIds.add(id);
    const zone = n.zone && zoneIds.has(n.zone) ? n.zone : undefined;
    if (n.zone && !zone) repairs.push(`node "${id}": dropped unknown zone "${n.zone}"`);
    const icon = (DIAGRAM_ICONS as readonly string[]).includes(n.icon) ? n.icon : 'box';
    if (icon !== n.icon) repairs.push(`node "${id}": unknown icon "${n.icon}" → box`);
    return { ...n, id, zone, icon: icon as DiagramNode['icon'], step: clampStep(n.step) };
  });

  const stepOf = new Map(nodes.map((n) => [n.id, n.step]));
  const edges = input.edges
    .map((e, i) => ({ ...e, id: uniq(e.id, `edge-${i + 1}`) }))
    .filter((e) => {
      if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) {
        repairs.push(`edge "${e.id}": dangling endpoint ${e.from}→${e.to}, dropped`);
        return false;
      }
      if (e.from === e.to) {
        repairs.push(`edge "${e.id}": self-loop, dropped`);
        return false;
      }
      return true;
    })
    .map((e) => {
      const min = Math.max(stepOf.get(e.from) ?? 1, stepOf.get(e.to) ?? 1);
      const step = clampStep(Math.max(e.step, min));
      if (step !== e.step) repairs.push(`edge "${e.id}": step raised to ${step} (endpoints appear later)`);
      return { ...e, step };
    });

  const notes = input.notes
    .filter((nt) => {
      if (!zoneIds.has(nt.zone)) {
        repairs.push(`note dropped: unknown zone "${nt.zone}"`);
        return false;
      }
      return true;
    })
    .map((nt) => ({ ...nt, step: nt.step === undefined ? undefined : clampStep(nt.step) }));

  return { spec: { ...input, zones, nodes, edges, notes, steps: input.steps }, repairs };
}

/* ── Preset topics ───────────────────────────────────────────────
   One click generates a diagram. Each prompt already carries the
   correctness cues the model most often gets wrong for that topic;
   the shared system prompt carries the full guardrail list. */

export interface DiagramTopic {
  id: string;
  title: string;
  blurb: string;
  prompt: string;
}

export interface DiagramTopicGroup {
  id: string;
  name: string;
  blurb: string;
  topics: DiagramTopic[];
}

export const DIAGRAM_TOPICS: DiagramTopicGroup[] = [
  {
    id: 'net',
    name: 'Networking fundamentals',
    blurb: 'How packets, names and crypto actually move.',
    topics: [
      {
        id: 'net-packet-journey',
        title: 'Packet journey · LAN → NAT → internet',
        blurb: 'Workstation to server across the internet with NAT/PAT',
        prompt:
          'A workstation (192.168.1.10) sends an HTTPS request to 198.51.100.20. Show the journey: ARP for the default gateway, L2 frame to the switch, the router performing NAT/PAT (private tuple ↔ public IP:port, RFC 1918), TTL decrementing per hop across the internet, and the return trip resolved through the NAT table. Emphasise that MACs change each hop but IP addresses change only at NAT, and that the translation table is bidirectional.',
      },
      {
        id: 'net-tcp-handshake',
        title: 'TCP 3-way handshake + teardown',
        blurb: 'SYN / SYN-ACK / ACK with sequence math',
        prompt:
          'Diagram the TCP connection lifecycle: random ISN x (client SYN with MSS/window-scale options), server SYN/ACK with its own random ISN y acknowledging x+1, client ACK acknowledging y+1 → ESTABLISHED. Then one data segment (seq advances by payload length) and the teardown: FIN/ACK → ACK → FIN/ACK → ACK (four segments), noting RST as the abort path. ACK = seq+1 only for SYN/FIN.',
      },
      {
        id: 'net-dns',
        title: 'DNS resolution chain',
        blurb: 'Stub → resolver → root → TLD → authoritative',
        prompt:
          'Diagram a recursive DNS lookup for www.example.com: the stub resolver asks its recursive resolver once (RD=1); the resolver iterates — root servers return a referral to the .com TLD with glue, the TLD refers to the authoritative nameserver, the authoritative server answers with the A record (AA=1, TTL) — then the resolver caches it and a second lookup is a cache HIT. Note: 13 root identities (anycast instances), UDP/53 primary with TCP/53 for truncation, and that the root never knows the final answer.',
      },
      {
        id: 'net-tls13',
        title: 'TLS 1.3 handshake (1-RTT)',
        blurb: 'ClientHello key_share → encrypted handshake',
        prompt:
          'Diagram a TLS 1.3 handshake: ClientHello (random, key_share, supported_versions, SNI, ALPN), ServerHello (server key_share, chosen cipher) — the last plaintext message — then EncryptedExtensions, Certificate, CertificateVerify, Finished all encrypted; client Finished; then application data. Show the HKDF key schedule deriving handshake keys from the (EC)DHE shared secret. Stress: 1-RTT, certificate is encrypted, no ChangeCipherSpec (compat only), forward secrecy mandatory.',
      },
      {
        id: 'net-rev-proxy',
        title: 'HTTP through a reverse proxy',
        blurb: 'TLS termination, upstream pool, XFF',
        prompt:
          'Diagram a browser hitting a site through an nginx reverse proxy: TLS terminates at the proxy; routing by SNI/Host/path to an upstream pool (keepalive connections are the proxy\'s own, not the client\'s); the app sees the proxy IP unless X-Forwarded-For is trusted and parsed; app queries a database with a parameterized statement; response relayed back. Note 502 = upstream down, 504 = upstream timeout, and that XFF is user-forgeable.',
      },
    ],
  },
  {
    id: 'pivot',
    name: 'Tunneling & pivoting',
    blurb: 'Authorized-lab pivoting models, drawn accurately.',
    topics: [
      {
        id: 'pivot-ssh-local',
        title: 'SSH local forward (-L)',
        blurb: 'Listener on attacker, exit at the jump host',
        prompt:
          'Diagram SSH local port forwarding: ssh -N -L 8080:10.10.10.5:80 user@jump. The listener binds on the attacker (127.0.0.1:8080); the stream is encrypted inside the SSH channel; the sshd on the jump host opens the TCP connection to 10.10.10.5:80 — the destination is resolved and connected FROM the jump, not the attacker. Note GatewayPorts governs remote bind addresses for -R, and AllowTcpForwarding can disable this server-side.',
      },
      {
        id: 'pivot-ssh-remote-socks',
        title: 'SSH remote (-R) + dynamic SOCKS (-D)',
        blurb: 'Callback tunnels and one-listener-many-targets',
        prompt:
          'Two-panel style diagram: (1) ssh -R 9999:127.0.0.1:22 user@jump creates a listener ON the jump (loopback-only unless GatewayPorts yes) whose connections ride the existing session back to the attacker; this is the NAT/firewall-friendly direction. (2) ssh -D 1080 user@jump creates a local SOCKS5 proxy: SOCKS-aware apps ask the proxy per destination, TCP only (no ICMP; UDP needs SOCKS5 UDP ASSOCIATE, rarely wired into tools); DNS is resolved at the jump only with socks5h/proxychains proxy_dns.',
      },
      {
        id: 'pivot-chisel',
        title: 'chisel over 443',
        blurb: 'WebSocket tunnel that looks like HTTPS',
        prompt:
          'Diagram chisel in reverse mode: chisel client on the pivot dials https://server:443 out to the attacker (egress-friendly), tunnel rides HTTP/WebSocket (survives egress proxies, looks like HTTPS), with SSH-style encryption inside. Show chisel server --reverse accepting `R:0.0.0.0:1080:socks` so the SOCKS5 listener lands on the attacker side but exits from the pivot\'s network. Note --fingerprint validates the server key; udpsocks (both peers ≥ v1.8) is required for UDP.',
      },
      {
        id: 'pivot-ligolo',
        title: 'ligolo-ng (TUN, not SOCKS)',
        blurb: 'Routed interface; nmap works natively',
        prompt:
          'Diagram ligolo-ng: the agent on the pivot connects OUT to the proxy on the attacker (reverse TCP/TLS, agent needs no admin); the proxy creates a TUN interface (e.g. ligolo); the attacker adds a route for 10.10.10.0/24 dev ligolo; packets enter the TUN and are translated — SYN becomes connect() on the agent (SYN-ACK on success, RST on refused, silence on timeout). Stress: this is a routed TUN interface, NOT a SOCKS proxy — nmap/impacket run without proxychains, but a SYN scan degrades to connect() (use -Pn/--unprivileged). Listener mode binds ports on the agent for reverse shells.',
      },
      {
        id: 'pivot-double',
        title: 'Double pivot through a DMZ',
        blurb: 'Two-stage chain, failure modes included',
        prompt:
          'Diagram a double pivot: attacker (192.0.2.10) → DMZ pivot A (dual-homed 203.0.113.10 / 10.0.1.50) → internal pivot B (10.0.1.60 / 10.0.2.70) → target 10.0.2.80, with firewalls between zones. Tunnel 2 rides tunnel 1 (chaining agents or nested SOCKS ports). Add a failure-mode note panel: bind address (127.0.0.1 vs 0.0.0.0), egress-only rules (prefer reverse tunnels on 443), keepalive timeouts, IPv6 bypassing IPv4-only rules, and proxychains breaking Go binaries (use ALL_PROXY).',
      },
    ],
  },
  {
    id: 'ad',
    name: 'Active Directory',
    blurb: 'Infrastructure, Kerberos/NTLM flows, attack paths.',
    topics: [
      {
        id: 'ad-forest',
        title: 'Forest / domain / DC anatomy',
        blurb: 'Security boundary vs replication partition',
        prompt:
          'Diagram an AD forest: root domain corp.local with child eu.corp.local (tree = contiguous namespace), an alternate tree root corp2.local, and DCs in each domain. Show that each domain is a replication partition (users/hosts replicate per-domain), while schema + configuration naming contexts replicate forest-wide, and the Global Catalog holds a partial replica of all objects for forest-wide lookups. Emphasise: the FOREST is the security boundary (Enterprise/Schema Admins live here); parent-child trusts are automatic, two-way, transitive; no "primary DC" — FSMO are single-master operations only.',
      },
      {
        id: 'ad-dc-dns',
        title: 'DC roles · sites · AD DNS',
        blurb: 'SRV records are why logon works',
        prompt:
          'Diagram how a client finds and talks to a domain controller: DNS lookup of _ldap._tcp.dc._msdcs.corp.local (SRV) resolves the nearest DC by site (subnets mapped to sites); _kerberos._tcp SRV records locate KDCs; intra-site replication notifies partners in ~15 s uncompressed, inter-site replication is compressed and scheduled (~180 min) via site links and bridgehead servers; the same server usually holds DC+DNS+KDC+GC roles but they are distinct roles. Stress: broken AD DNS breaks domain logon, not just name resolution.',
      },
      {
        id: 'ad-kerberos',
        title: 'Kerberos flow (AS → TGS → AP)',
        blurb: 'Who encrypts what with which key',
        prompt:
          'Diagram the Kerberos flow: AS-REQ with PA-ENC-TIMESTAMP pre-auth → AS-REP containing the TGT encrypted with the KRBTGT key plus a session key encrypted with the user key; TGS-REQ presenting the TGT + authenticator + SPN=MSSQLSvc/db01:1433 → TGS-REP with a service ticket encrypted with the SERVICE ACCOUNT key; AP-REQ to the service. Show the PAC (group SIDs, KDC-signed). Ports: UDP/88 first, TCP/88 when the ticket is large. Add a final step overlaying attacks: Kerberoast (offline crack of TGS-REP), AS-REP roast (no preauth), Golden (forged TGT with krbtgt), Silver (forged service ticket).',
      },
      {
        id: 'ad-ntlm',
        title: 'NTLM authentication',
        blurb: 'Three messages; relay vs PtH',
        prompt:
          'Diagram NTLM: NEGOTIATE_MESSAGE (capabilities) → CHALLENGE_MESSAGE (8-byte server nonce) → AUTHENTICATE_MESSAGE (NTLMv2 response = HMAC-MD5(NT hash, server challenge + client blob)); domain accounts are validated via Netlogon pass-through to a DC; local accounts against SAM. Explain the attack overlay: capture NetNTLMv2 → offline crack; pass-the-hash reuses the NT hash directly; relay requires SMB/LDAP signing off (or missing EPA/channel binding). Stress: exactly three messages, the challenge is server-generated, and NTLM is the fallback when Kerberos can\'t be used (IP literals, no SPN).',
      },
      {
        id: 'ad-attack-path',
        title: 'Attack path to Domain Admin',
        blurb: 'BloodHound-style edges toward privilege',
        prompt:
          'Diagram a realistic AD attack path: user "helpdesk-01" → MemberOf → group → GenericWrite/AddMember ACL edge → gains local admin on server → AdminTo → server where a Domain Admin has a session (HasSession) → credential theft (LSASS) → DCSync rights (GetChanges + GetChangesAll on the domain object) → krbtgt hash → Golden Ticket → domain. Show a side path: unconstrained delegation host + coerced authentication (PrinterBug/PetitPotam) → TGT harvested from LSASS → impersonation. Stress: BloodHound-style arrows point TOWARD the privilege target; HasSession is volatile; DCSync is a replication right, not an automatic DA perk.',
      },
    ],
  },
  {
    id: 'web',
    name: 'Web, cloud & containers',
    blurb: 'Modern infrastructure and where attacks land.',
    topics: [
      {
        id: 'web-ssrf-imds',
        title: 'SSRF → cloud metadata (IMDS)',
        blurb: 'The confused-deputy classic',
        prompt:
          'Diagram SSRF to cloud metadata: an attacker finds a user-supplied URL fetch (webhook/preview) in an app; the server-side HTTP client is tricked into fetching http://169.254.169.254/latest/meta-data/iam/security-credentials/<role>. Show AWS IMDSv2 requiring a PUT /latest/api/token (X-aws-ec2-metadata-token-ttl-seconds) then a GET with the token header; Azure requiring Metadata: true; GCP requiring Metadata-Flavor: Google. Final step: stolen role credentials used against the cloud API. Note bypasses (redirects, decimal IP, DNS rebinding) and defenses (IMDSv2-only, no redirects, egress block to link-local).',
      },
      {
        id: 'web-k8s',
        title: 'Kubernetes topology',
        blurb: 'Service DNAT, ingress, where attacks land',
        prompt:
          'Diagram a Kubernetes cluster: external DNS → cloud LB → ingress controller → Service (ClusterIP is a VIRTUAL IP — kube-proxy DNATs to an endpoint) → Pod (shared network namespace per pod); control plane components (apiserver :6443, etcd, scheduler, controller-manager) and node components (kubelet :10250, container runtime); CoreDNS resolving <svc>.<ns>.svc.cluster.local; attack overlays: SSRF → kubelet 10250 / cloud metadata from a pod, stolen ServiceAccount token → API with the pod\'s RBAC, privileged/hostPath pod → node escape. Note: pod CIDR ≠ service CIDR; Ingress needs a controller; NetworkPolicy defaults allow-all.',
      },
      {
        id: 'web-waf-cdn',
        title: 'WAF/CDN + origin bypass',
        blurb: 'Why direct-to-origin defeats the WAF',
        prompt:
          'Diagram the CDN/WAF path: client resolves shop.example.com to anycast edge IPs; TLS terminates at the edge; the WAF inspects the request (block → 403; else cache HIT or MISS to origin); on MISS the edge forwards to origin with X-Forwarded-For; the origin firewall should accept only CDN IP ranges. Then draw the bypass path in red: attacker finds the origin IP via certificate transparency/DNS history and sends requests DIRECTLY to the origin, skipping the WAF entirely. Note: TLS terminates at the edge; caching applies to GET/static by default.',
      },
      {
        id: 'web-gpo',
        title: 'GPO application (LSDOU)',
        blurb: 'Local → Site → Domain → OU ordering',
        prompt:
          'Diagram Group Policy application: GPOs linked at site, domain and OU levels; processing order is Local → Site → Domain → OU (parent to child) = LSDOU; last writer wins unless a GPO is Enforced, and Block Inheritance changes the winner; security filtering and WMI filters decide who actually applies it; delivery is not AD replication — GPO files replicate via SYSVOL (DFSR) and clients refresh every ~90 min + 30 s jitter (gpupdate /force). Note: OUs ≠ sites (sites are subnets); LSDOU is the classic wrong-order mistake.',
      },
    ],
  },
];

export const DIAGRAM_TOPIC_INDEX: Map<string, DiagramTopic> = new Map(
  DIAGRAM_TOPICS.flatMap((g) => g.topics.map((t) => [t.id, t] as const)),
);
