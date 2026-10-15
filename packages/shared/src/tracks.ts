/**
 * Study tracks: preset learning objectives a profile can adopt. A track is just a curated set of
 * focus domains plus a suggested daily goal; `''`/`all` means the whole taxonomy. These seed the
 * profile's objective and focusDomains, and the selector/recommendation respect focusDomains.
 */
export interface StudyTrack {
  id: string;
  name: string;
  blurb: string;
  /** Domain ids from the taxonomy; empty = all domains. */
  domains: string[];
  dailyGoal: number;
}

export const STUDY_TRACKS: StudyTrack[] = [
  { id: 'all', name: 'Everything', blurb: 'Rotate across the whole taxonomy. Good for broad, balanced growth.', domains: [], dailyGoal: 10 },
  { id: 'fundamentals', name: 'Networking & Protocol Fundamentals', blurb: 'OSI/TCP-IP, DNS, HTTP and TLS — the ground everything else stands on.', domains: ['net', 'dns', 'http', 'tls'], dailyGoal: 8 },
  { id: 'web', name: 'Web Application Security', blurb: 'HTTP, authentication, authorization, databases, APIs and source-code review.', domains: ['http', 'authn', 'authz', 'db', 'api', 'code'], dailyGoal: 10 },
  { id: 'windows', name: 'Windows & Active Directory', blurb: 'Windows internals and AD attack paths: Kerberos, NTLM, delegation, trusts.', domains: ['win', 'ad'], dailyGoal: 8 },
  { id: 'linux', name: 'Linux & Privilege Escalation', blurb: 'Linux internals, permissions and local privilege escalation.', domains: ['linux', 'prog'], dailyGoal: 8 },
  { id: 'cloud', name: 'Cloud & Containers', blurb: 'Cloud IAM, metadata, storage and secrets; Docker and Kubernetes.', domains: ['cloud', 'ctr'], dailyGoal: 8 },
  { id: 'methodology', name: 'Pentest Methodology & Tooling', blurb: 'The O→H→T→E→C reasoning loop, the engagement phases and the core tools.', domains: ['method', 'tools'], dailyGoal: 8 },
  { id: 'ai', name: 'AI-Assisted Pentesting & AI Security', blurb: 'Agents, tool calling, MCP and prompt injection — offence and defence.', domains: ['ai', 'code', 'prog'], dailyGoal: 6 },
];

export const TRACK_BY_ID: Record<string, StudyTrack> = Object.fromEntries(STUDY_TRACKS.map((t) => [t.id, t]));
