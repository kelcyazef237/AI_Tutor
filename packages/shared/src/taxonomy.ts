/**
 * Topic taxonomy: domains → concepts, with prerequisite edges.
 * Concept ids are globally unique, kebab-case, prefixed by domain id.
 */

export type AreaId = 'networking' | 'web' | 'linux' | 'windows' | 'cloud' | 'programming' | 'reasoning';

export interface Area {
  id: AreaId;
  name: string;
}

export interface ConceptDef {
  id: string;
  name: string;
  prereqs?: string[];
}

export interface DomainDef {
  id: string;
  name: string;
  area: AreaId;
  icon: string; // lucide icon name
  concepts: ConceptDef[];
}

export const AREAS: Area[] = [
  { id: 'networking', name: 'Networking' },
  { id: 'web', name: 'Web Security' },
  { id: 'linux', name: 'Linux' },
  { id: 'windows', name: 'Windows / AD' },
  { id: 'cloud', name: 'Cloud' },
  { id: 'programming', name: 'Programming' },
  { id: 'reasoning', name: 'Pentest Reasoning' },
];

const c = (domain: string, slug: string, name: string, prereqs: string[] = []): ConceptDef => ({
  id: `${domain}.${slug}`,
  name,
  prereqs,
});

export const DOMAINS: DomainDef[] = [
  {
    id: 'net', name: 'Networking', area: 'networking', icon: 'Network',
    concepts: [
      c('net', 'osi', 'OSI model'),
      c('net', 'tcpip', 'TCP/IP model', ['net.osi']),
      c('net', 'routing', 'Routing', ['net.tcpip']),
      c('net', 'arp', 'ARP', ['net.tcpip']),
      c('net', 'icmp', 'ICMP', ['net.tcpip']),
      c('net', 'tcp', 'TCP', ['net.tcpip']),
      c('net', 'udp', 'UDP', ['net.tcpip']),
      c('net', 'ports', 'Ports & services', ['net.tcp', 'net.udp']),
      c('net', 'sockets', 'Sockets', ['net.ports']),
      c('net', 'nat', 'NAT', ['net.routing']),
      c('net', 'firewalls', 'Firewalls', ['net.ports', 'net.nat']),
    ],
  },
  {
    id: 'dns', name: 'DNS', area: 'networking', icon: 'Globe',
    concepts: [
      c('dns', 'recursive', 'Recursive resolution', ['net.udp']),
      c('dns', 'authoritative', 'Authoritative servers', ['dns.recursive']),
      c('dns', 'hierarchy', 'Root / TLD hierarchy', ['dns.recursive']),
      c('dns', 'records', 'Record types (A/AAAA/CNAME/MX/NS/TXT/PTR)', ['dns.authoritative']),
      c('dns', 'dnssec', 'DNSSEC', ['dns.records']),
      c('dns', 'axfr', 'Zone transfers', ['dns.authoritative']),
      c('dns', 'subdomain-enum', 'Subdomain enumeration', ['dns.records']),
      c('dns', 'recon', 'DNS reconnaissance', ['dns.subdomain-enum', 'dns.axfr']),
    ],
  },
  {
    id: 'http', name: 'HTTP', area: 'web', icon: 'FileCode',
    concepts: [
      c('http', 'messages', 'Requests & responses', ['net.tcp']),
      c('http', 'headers', 'Headers', ['http.messages']),
      c('http', 'methods', 'Methods', ['http.messages']),
      c('http', 'status', 'Status codes', ['http.messages']),
      c('http', 'cookies', 'Cookies', ['http.headers']),
      c('http', 'sessions', 'Sessions', ['http.cookies']),
      c('http', 'caching', 'Caching', ['http.headers']),
      c('http', 'redirects', 'Redirects', ['http.status']),
      c('http', 'proxies', 'Proxies', ['http.headers']),
      c('http', 'websockets', 'WebSockets', ['http.headers']),
    ],
  },
  {
    id: 'tls', name: 'TLS', area: 'networking', icon: 'Lock',
    concepts: [
      c('tls', 'certificates', 'Certificates', ['net.tcp']),
      c('tls', 'ca', 'Certificate authorities', ['tls.certificates']),
      c('tls', 'validation', 'Certificate validation', ['tls.ca']),
      c('tls', 'handshake', 'Handshake', ['tls.certificates']),
      c('tls', 'encryption-vs-auth', 'Encryption vs authentication', ['tls.handshake']),
      c('tls', 'versions', 'TLS versions', ['tls.handshake']),
      c('tls', 'misconfig', 'Common misconfigurations', ['tls.validation', 'tls.versions']),
    ],
  },
  {
    id: 'linux', name: 'Linux', area: 'linux', icon: 'Terminal',
    concepts: [
      c('linux', 'processes', 'Processes'),
      c('linux', 'users-groups', 'Users & groups'),
      c('linux', 'permissions', 'File permissions', ['linux.users-groups']),
      c('linux', 'sudo', 'sudo', ['linux.users-groups']),
      c('linux', 'services', 'Services (systemd)', ['linux.processes']),
      c('linux', 'filesystem', 'Filesystem layout'),
      c('linux', 'env', 'Environment variables', ['linux.processes']),
      c('linux', 'networking', 'Linux networking', ['net.ports']),
      c('linux', 'cron', 'cron', ['linux.services']),
      c('linux', 'capabilities', 'Capabilities', ['linux.permissions']),
      c('linux', 'suid', 'SUID / SGID', ['linux.permissions']),
      c('linux', 'privesc', 'Privilege escalation', ['linux.suid', 'linux.sudo', 'linux.cron', 'linux.capabilities']),
    ],
  },
  {
    id: 'win', name: 'Windows', area: 'windows', icon: 'Monitor',
    concepts: [
      c('win', 'users-groups', 'Users & groups'),
      c('win', 'processes', 'Processes & tokens', ['win.users-groups']),
      c('win', 'services', 'Services', ['win.processes']),
      c('win', 'registry', 'Registry'),
      c('win', 'powershell', 'PowerShell'),
      c('win', 'auth', 'Windows authentication', ['win.users-groups']),
      c('win', 'networking', 'Windows networking (SMB/RPC)', ['net.ports']),
    ],
  },
  {
    id: 'ad', name: 'Active Directory', area: 'windows', icon: 'Building2',
    concepts: [
      c('ad', 'domains', 'Domains & forests', ['win.users-groups']),
      c('ad', 'dc', 'Domain controllers', ['ad.domains']),
      c('ad', 'ldap', 'LDAP', ['ad.dc']),
      c('ad', 'kerberos', 'Kerberos', ['ad.dc', 'win.auth']),
      c('ad', 'ntlm', 'NTLM', ['win.auth']),
      c('ad', 'principals', 'Users, groups & ACLs', ['ad.ldap']),
      c('ad', 'spn', 'SPNs & Kerberoasting', ['ad.kerberos']),
      c('ad', 'delegation', 'Delegation', ['ad.kerberos', 'ad.spn']),
      c('ad', 'gpo', 'Group Policy', ['ad.domains']),
      c('ad', 'trusts', 'Trusts', ['ad.domains', 'ad.kerberos']),
      c('ad', 'attack-paths', 'AD attack paths', ['ad.principals', 'ad.delegation', 'ad.ntlm']),
    ],
  },
  {
    id: 'authn', name: 'Authentication', area: 'web', icon: 'KeyRound',
    concepts: [
      c('authn', 'passwords', 'Password storage & policy'),
      c('authn', 'mfa', 'MFA', ['authn.passwords']),
      c('authn', 'sessions', 'Session management', ['http.sessions']),
      c('authn', 'tokens', 'Bearer tokens', ['authn.sessions']),
      c('authn', 'oauth', 'OAuth 2.0', ['authn.tokens', 'http.redirects']),
      c('authn', 'oidc', 'OpenID Connect', ['authn.oauth']),
      c('authn', 'jwt', 'JWT', ['authn.tokens']),
      c('authn', 'reset', 'Password reset & recovery', ['authn.passwords']),
    ],
  },
  {
    id: 'authz', name: 'Authorization', area: 'web', icon: 'ShieldCheck',
    concepts: [
      c('authz', 'authn-vs-authz', 'Authentication vs authorization', ['authn.sessions']),
      c('authz', 'rbac', 'RBAC', ['authz.authn-vs-authz']),
      c('authz', 'abac', 'ABAC', ['authz.rbac']),
      c('authz', 'object-level', 'Object-level authorization (BOLA/IDOR)', ['authz.authn-vs-authz']),
      c('authz', 'function-level', 'Function-level authorization (BFLA)', ['authz.rbac']),
      c('authz', 'tenant', 'Tenant isolation', ['authz.object-level']),
      c('authz', 'boundaries', 'Privilege boundaries', ['authz.function-level']),
    ],
  },
  {
    id: 'db', name: 'Databases', area: 'web', icon: 'Database',
    concepts: [
      c('db', 'sql', 'SQL fundamentals'),
      c('db', 'joins', 'Joins & queries', ['db.sql']),
      c('db', 'permissions', 'Database permissions', ['db.sql']),
      c('db', 'transactions', 'Transactions & race conditions', ['db.sql']),
      c('db', 'sqli', 'SQL injection', ['db.sql', 'http.messages']),
      c('db', 'nosql', 'NoSQL basics & injection', ['db.sqli']),
    ],
  },
  {
    id: 'api', name: 'APIs', area: 'web', icon: 'Webhook',
    concepts: [
      c('api', 'rest', 'REST', ['http.methods']),
      c('api', 'graphql', 'GraphQL', ['api.rest']),
      c('api', 'auth', 'API authentication', ['authn.tokens', 'api.rest']),
      c('api', 'bola', 'API object-level authorization', ['authz.object-level', 'api.rest']),
      c('api', 'rate-limit', 'Rate limiting', ['api.rest']),
      c('api', 'validation', 'Input validation & mass assignment', ['api.rest']),
      c('api', 'versioning', 'API versioning & shadow APIs', ['api.rest']),
    ],
  },
  {
    id: 'cloud', name: 'Cloud', area: 'cloud', icon: 'Cloud',
    concepts: [
      c('cloud', 'iam', 'IAM'),
      c('cloud', 'roles', 'Roles & assumed identity', ['cloud.iam']),
      c('cloud', 'storage', 'Object storage', ['cloud.iam']),
      c('cloud', 'metadata', 'Instance metadata services', ['cloud.roles', 'http.messages']),
      c('cloud', 'networking', 'Cloud networking & security groups', ['net.firewalls']),
      c('cloud', 'secrets', 'Secrets management', ['cloud.iam']),
      c('cloud', 'serverless', 'Serverless', ['cloud.roles']),
    ],
  },
  {
    id: 'ctr', name: 'Containers', area: 'cloud', icon: 'Container',
    concepts: [
      c('ctr', 'docker', 'Docker fundamentals', ['linux.processes']),
      c('ctr', 'images', 'Images & layers', ['ctr.docker']),
      c('ctr', 'namespaces', 'Namespaces & cgroups', ['ctr.docker', 'linux.processes']),
      c('ctr', 'capabilities', 'Container capabilities & privileged mode', ['ctr.namespaces', 'linux.capabilities']),
      c('ctr', 'volumes', 'Volumes & mounts', ['ctr.docker']),
      c('ctr', 'escape', 'Container escape concepts', ['ctr.capabilities', 'ctr.volumes']),
      c('ctr', 'k8s', 'Kubernetes fundamentals', ['ctr.docker']),
    ],
  },
  {
    id: 'method', name: 'Pentest Methodology', area: 'reasoning', icon: 'Route',
    concepts: [
      c('method', 'scope', 'Scope & rules of engagement'),
      c('method', 'recon', 'Reconnaissance', ['method.scope']),
      c('method', 'enumeration', 'Enumeration', ['method.recon']),
      c('method', 'attack-surface', 'Attack surface modeling', ['method.enumeration']),
      c('method', 'threat-model', 'Threat modeling', ['method.attack-surface']),
      c('method', 'vuln-analysis', 'Vulnerability analysis', ['method.enumeration']),
      c('method', 'hypothesis', 'Observation vs hypothesis', ['method.vuln-analysis']),
      c('method', 'exploitation', 'Exploitation & validation', ['method.hypothesis']),
      c('method', 'post-exploitation', 'Post-exploitation', ['method.exploitation']),
      c('method', 'lateral', 'Lateral movement', ['method.post-exploitation']),
      c('method', 'chaining', 'Attack chaining', ['method.exploitation']),
      c('method', 'impact', 'Impact assessment', ['method.chaining']),
      c('method', 'reporting', 'Reporting', ['method.impact']),
    ],
  },
  {
    id: 'tools', name: 'Security Tooling', area: 'reasoning', icon: 'Wrench',
    concepts: [
      c('tools', 'nmap', 'Nmap', ['net.ports']),
      c('tools', 'burp', 'Burp Suite', ['http.messages']),
      c('tools', 'ffuf', 'ffuf / content discovery', ['http.status']),
      c('tools', 'nuclei', 'Nuclei', ['http.messages']),
      c('tools', 'wireshark', 'Wireshark / tcpdump', ['net.tcp']),
      c('tools', 'metasploit', 'Metasploit', ['method.exploitation']),
      c('tools', 'bloodhound', 'BloodHound', ['ad.principals']),
      c('tools', 'impacket', 'Impacket / NetExec', ['win.networking', 'ad.ntlm']),
      c('tools', 'cracking', 'Hashcat / John', ['authn.passwords']),
      c('tools', 'cli', 'curl / dig / common CLI', ['http.messages', 'dns.records']),
    ],
  },
  {
    id: 'prog', name: 'Programming for Security', area: 'programming', icon: 'Code2',
    concepts: [
      c('prog', 'python', 'Python'),
      c('prog', 'bash', 'Bash', ['linux.processes']),
      c('prog', 'javascript', 'JavaScript'),
      c('prog', 'powershell', 'PowerShell scripting', ['win.powershell']),
      c('prog', 'http-scripting', 'HTTP scripting', ['prog.python', 'http.messages']),
      c('prog', 'automation', 'Automation & API interaction', ['prog.http-scripting']),
    ],
  },
  {
    id: 'code', name: 'Source-Code Security', area: 'programming', icon: 'FileSearch',
    concepts: [
      c('code', 'reading', 'Code reading'),
      c('code', 'dataflow', 'Data flow (source → sink)', ['code.reading']),
      c('code', 'trust-boundaries', 'Trust boundaries', ['code.dataflow']),
      c('code', 'authn-impl', 'Authentication implementation', ['code.reading', 'authn.sessions']),
      c('code', 'authz-impl', 'Authorization implementation', ['code.reading', 'authz.object-level']),
      c('code', 'deserialization', 'Insecure deserialization', ['code.dataflow']),
      c('code', 'command-exec', 'Command execution', ['code.dataflow']),
      c('code', 'injection', 'Injection (general)', ['code.dataflow']),
      c('code', 'secrets', 'Secrets in code', ['code.reading']),
      c('code', 'dependencies', 'Dependency security', ['code.reading']),
    ],
  },
  {
    id: 'ai', name: 'AI-Assisted Pentesting', area: 'reasoning', icon: 'Bot',
    concepts: [
      c('ai', 'llm-recon', 'LLM-assisted reconnaissance', ['method.recon']),
      c('ai', 'code-review', 'AI-assisted code review', ['code.reading']),
      c('ai', 'tool-calling', 'Tool calling', ['prog.automation']),
      c('ai', 'agents', 'Agents & orchestration', ['ai.tool-calling']),
      c('ai', 'mcp', 'MCP', ['ai.tool-calling']),
      c('ai', 'memory', 'Agent memory', ['ai.agents']),
      c('ai', 'prompt-injection', 'Prompt injection & agent trust boundaries', ['ai.agents', 'code.trust-boundaries']),
      c('ai', 'validation', 'Validation & human-in-the-loop', ['ai.agents']),
      c('ai', 'limitations', 'Limits of autonomous testing', ['ai.validation']),
    ],
  },
];

export interface FlatConcept extends ConceptDef {
  domainId: string;
  domainName: string;
  area: AreaId;
}

export const CONCEPTS: FlatConcept[] = DOMAINS.flatMap((d) =>
  d.concepts.map((x) => ({ ...x, prereqs: x.prereqs ?? [], domainId: d.id, domainName: d.name, area: d.area })),
);

export const CONCEPT_BY_ID: Record<string, FlatConcept> = Object.fromEntries(CONCEPTS.map((x) => [x.id, x]));
export const DOMAIN_BY_ID: Record<string, DomainDef> = Object.fromEntries(DOMAINS.map((d) => [d.id, d]));

export function conceptName(id: string): string {
  return CONCEPT_BY_ID[id]?.name ?? id;
}
