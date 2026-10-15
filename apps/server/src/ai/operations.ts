import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  DIAGRAM_ICONS,
  DIAGRAM_TOPIC_INDEX,
  DiagramSpec,
  difficultyName,
  Evaluation,
  GeneratedQuestion,
  QUESTION_TYPE_LABEL,
  RecallReview,
  QUESTION_TYPES,
  SimDebrief,
  SimStepOutput,
  SimWorld,
  type QuestionDef,
  type QuestionType,
  type Settings,
} from '@psc/shared';
import type { AIProvider, ChatMessage } from './provider';
import { AIError } from './provider';
import { callStructured, recordFailure, recordSuccess } from './structured';

const MENTOR_PROMPT = fs.readFileSync(fileURLToPath(new URL('../prompts/mentor.md', import.meta.url)), 'utf8');
const DIAGRAM_PROMPT = fs.readFileSync(fileURLToPath(new URL('../prompts/diagram.md', import.meta.url)), 'utf8');

const OUTPUT_RULES = `
# OUTPUT CONTRACT
You are called by an application backend, not chatting with the user directly.
Every response MUST be a single JSON object matching the schema described in the task.
No markdown fences, no commentary outside the JSON.
String fields that are shown to the student may use GitHub-flavored Markdown.
All scenarios are fictional and set in authorized lab environments.`;

const system = (): ChatMessage => ({ role: 'system', content: `${MENTOR_PROMPT}\n${OUTPUT_RULES}` });

/** Icon allow-list is injected so the prompt and the schema can never drift apart. */
const diagramSystem = (): ChatMessage => ({
  role: 'system',
  content: `${DIAGRAM_PROMPT}\n# ICON NAMES\nUse only these lowercase names for "icon":\n${DIAGRAM_ICONS.join(', ')}\n${OUTPUT_RULES}`,
});

/** Student context assembled by the backend from the DB (the source of truth). */
export interface StudentContext {
  learnerGoal: string;
  conceptMasteryLabel: string; // human-readable band, never the raw number
  attempts: number;
  typesSeen: string[];
  activeMisconceptions: string[];
  recentMistakes: string[];
  recentPrompts: string[];
}

export interface KnowledgeSnippet {
  title: string;
  content: string;
  sourceUrl?: string | null;
}

function knowledgeBlock(snippets: KnowledgeSnippet[]) {
  if (!snippets.length) return 'KNOWLEDGE BASE: (no curated snippets for this concept; rely on well-established facts only and say when behavior is implementation-dependent)';
  return (
    'KNOWLEDGE BASE (trusted, prefer over your own recall):\n' +
    snippets.map((s, i) => `[${i + 1}] ${s.title}${s.sourceUrl ? ` <${s.sourceUrl}>` : ''}\n${s.content.slice(0, 1200)}`).join('\n\n')
  );
}

function studentBlock(s: StudentContext) {
  return [
    `STUDENT GOAL: ${s.learnerGoal}`,
    `CURRENT LEVEL ON THIS CONCEPT: ${s.conceptMasteryLabel} (${s.attempts} prior attempts)`,
    `QUESTION TYPES ALREADY SEEN: ${s.typesSeen.join(', ') || 'none'}`,
    `ACTIVE MISCONCEPTIONS: ${s.activeMisconceptions.join(' | ') || 'none recorded'}`,
    `RECENT MISTAKES: ${s.recentMistakes.join(' | ') || 'none recorded'}`,
  ].join('\n');
}

export class AIOperations {
  constructor(
    private provider: AIProvider,
    private settings: () => Settings,
  ) {}

  get providerName() {
    return this.provider.name;
  }

  private chain(role: keyof Settings['models']) {
    const s = this.settings();
    return [s.models[role], ...s.fallbackModels];
  }

  async generateQuestion(args: {
    conceptId: string;
    conceptName: string;
    domainName: string;
    difficulty: number;
    preferredType: QuestionType;
    secondary?: { id: string; name: string } | null;
    student: StudentContext;
    knowledge: KnowledgeSnippet[];
  }) {
    const typeList = QUESTION_TYPES.map((t) => `${t} (${QUESTION_TYPE_LABEL[t]})`).join(', ');
    const user = `TASK: generate_question
CONCEPT: ${args.conceptName}
CONCEPT ID: ${args.conceptId}
DOMAIN: ${args.domainName}
TARGET DIFFICULTY: ${args.difficulty} (${difficultyName(args.difficulty)})
PREFERRED QUESTION TYPE: ${args.preferredType}
${args.secondary ? `CROSS-DOMAIN: combine with "${args.secondary.name}" (${args.secondary.id})` : ''}

${studentBlock(args.student)}

RECENTLY ASKED (do not repeat; change the context):
${args.student.recentPrompts.map((p) => `- ${p.slice(0, 160)}`).join('\n') || '- none'}

${knowledgeBlock(args.knowledge)}

Write ONE question that requires the student to explain their reasoning.
If the student has an active misconception on this concept, test it indirectly.
When useful, include an "artifact" (kind: code|terminal|http|packet|dns|log|config) with realistic but fictional content the student must interpret; otherwise omit it.

Return JSON:
{
  "type": one of [${typeList}],
  "difficulty": 1-5,
  "prompt": markdown question text,
  "artifact": { "kind": ..., "language": optional, "title": optional, "content": string } | null,
  "objective": short learning objective,
  "estMinutes": number,
  "secondaryConcepts": [concept ids],
  "rubric": { "keyPoints": [what a strong answer must contain], "misconceptions": [likely wrong ideas], "referenceAnswer": concise model answer }
}`;
    const { data } = await callStructured({
      provider: this.provider,
      models: this.chain('generator'),
      schema: GeneratedQuestion,
      messages: [system(), { role: 'user', content: user }],
      temperature: Math.min(1, this.settings().temperature + 0.3),
    });
    return data;
  }

  async evaluate(args: {
    question: QuestionDef;
    conceptName: string;
    answer: string;
    isFollowUp: boolean;
    parentContext?: string;
    student: StudentContext;
    knowledge: KnowledgeSnippet[];
    examMode: boolean;
  }) {
    const q = args.question;
    const user = `TASK: evaluate
CONCEPT: ${args.conceptName}
QUESTION TYPE: ${q.type}  DIFFICULTY: ${q.difficulty} (${difficultyName(q.difficulty)})
${args.isFollowUp ? `THIS IS A FOLLOW-UP to an earlier question. Earlier context:\n${args.parentContext ?? ''}\n` : ''}
QUESTION:
${q.prompt}
${q.artifact ? `\nARTIFACT (${q.artifact.kind}):\n${q.artifact.content}\n` : ''}
RUBRIC KEY POINTS: ${q.rubric.keyPoints.join(' | ') || '(none provided — judge on technical merit)'}
KNOWN MISCONCEPTIONS: ${q.rubric.misconceptions.join(' | ') || '(none listed)'}
REFERENCE ANSWER: ${q.rubric.referenceAnswer || '(none provided)'}

${studentBlock(args.student)}

${knowledgeBlock(args.knowledge)}

STUDENT ANSWER:
${args.answer}

Evaluate strictly. Do not inflate scores for terminology without explanation.
${args.examMode ? 'EXAM MODE: no follow-up question; set recommended_action to "advance".' : 'If a misconception or a close-but-incomplete answer is revealed, set recommended_action "follow_up" and write a targeted follow_up_question that lets the student discover the missing piece (do not reveal the full answer). If a prerequisite is clearly missing, use "review_prerequisite".'}

Return JSON:
{
  "result": "correct" | "partial" | "incorrect",
  "scores": { "correctness": 0-1, "conceptual_understanding": 0-1, "reasoning_quality": 0-1, "pentest_application": 0-1, "observation_vs_hypothesis": 0-1 },
  "confidence": 0-1 (how sure you are of this assessment),
  "guessed": boolean,
  "understands_mechanism": boolean,
  "misconceptions": [short statements of wrong ideas actually present in the answer],
  "concepts_demonstrated": [..],
  "concepts_to_review": [..],
  "missing_points": [..],
  "recommended_action": "advance" | "follow_up" | "review_prerequisite",
  "follow_up_question": markdown string or null,
  "mastery_delta": number between -0.35 and 0.35 (proposal only),
  "feedback": concise markdown teaching feedback: acknowledge what is right, name the exact gap, minimal correction
}`;
    const { data } = await callStructured({
      provider: this.provider,
      models: this.chain('evaluator'),
      schema: Evaluation,
      messages: [system(), { role: 'user', content: user }],
      temperature: 0.2,
    });
    return data;
  }

  async simWorld(args: { focus: string; difficulty: number; student: string; scope?: string }) {
    const user = `TASK: sim_world
Design a fictional penetration-test engagement in an AUTHORIZED LAB for a training simulation.
FOCUS: ${args.focus}
DIFFICULTY: ${args.difficulty} (${difficultyName(args.difficulty)})
${args.scope ? `REQUESTED SCOPE: ${args.scope}` : ''}
STUDENT PROFILE: ${args.student}

The world model is hidden from the student and used to keep simulated evidence consistent.
Use private/lab address space and *.lab.local or example.* names only.

Return JSON:
{
  "title": short name,
  "briefing": markdown briefing shown to the student (scope, rules of engagement, what they are given) — no spoilers,
  "scope": string, "attackerModel": string, "credentials": string, "timeLimitMinutes": number,
  "hosts": [{ "id", "hostname", "ip", "os", "role", "services": [{ "port", "proto", "name", "version", "notes" }] }],
  "vulnerabilities": [{ "id", "hostId", "title", "concept", "detail", "evidenceHints" }],
  "intendedChain": [ordered steps of the intended path],
  "objectives": [student-facing objectives],
  "concepts": [taxonomy concept ids exercised, e.g. "method.recon"]
}`;
    const { data } = await callStructured({
      provider: this.provider,
      models: this.chain('simulator'),
      schema: SimWorld,
      messages: [system(), { role: 'user', content: user }],
      temperature: 0.8,
      timeoutMs: 180_000,
    });
    return data;
  }

  async simStep(args: { world: SimWorld; transcript: { role: string; content: string }[]; action: string; phase: string; discovered: string[] }) {
    const user = `TASK: sim_step
You are the simulation engine AND the mentor for an ongoing training engagement.

HIDDEN WORLD MODEL (never reveal directly; only reveal what the student's action would plausibly uncover):
${JSON.stringify(args.world)}

CURRENT PHASE: ${args.phase}
ALREADY DISCOVERED NODE IDS: ${args.discovered.join(', ') || 'none'}

TRANSCRIPT SO FAR (latest last):
${args.transcript.slice(-14).map((t) => `${t.role.toUpperCase()}: ${t.content.slice(0, 1500)}`).join('\n')}

STUDENT ACTION:
${args.action}

Rules:
- Return realistic simulated evidence consistent with the world model (tool output, responses, observations). Vague actions get vague results; ask for specifics in mentor_note.
- Do not solve the engagement for the student. Do not reveal vulnerabilities they have not earned.
- If the action is out of scope or unsafe, the evidence should say so and the mentor_note should explain why.
- Score both the action and the reasoning behind it. Mark which parts of OBSERVATION → HYPOTHESIS → TEST → EVIDENCE → CONCLUSION the student exhibited in this action.
- "discovered": graph nodes newly revealed by this action (hosts/services/findings/credentials/objectives), using stable ids; parent links services to hosts and findings to services/hosts.

Return JSON:
{
  "evidence": markdown (use code blocks for tool output),
  "mentor_note": short markdown coaching note (may be empty),
  "reasoning": { "action_quality": 0-1, "reasoning_quality": 0-1, "observation": bool, "hypothesis": bool, "test": bool, "evidence": bool, "conclusion": bool },
  "phase": one of recon|enumeration|hypothesis|testing|initial-access|privesc|lateral|impact,
  "discovered": [{ "id", "kind": host|service|finding|credential|objective, "label", "parent": id or null }],
  "objective_completed": objective text or null,
  "engagement_over": boolean,
  "concepts": [taxonomy concept ids exercised by this action]
}`;
    const { data } = await callStructured({
      provider: this.provider,
      models: this.chain('simulator'),
      schema: SimStepOutput,
      messages: [system(), { role: 'user', content: user }],
      temperature: 0.5,
      timeoutMs: 180_000,
    });
    return data;
  }

  async simDebrief(args: { world: SimWorld; transcript: { role: string; content: string }[]; selfDebrief?: string }) {
    const user = `TASK: sim_debrief
The engagement has ended. Debrief the student.

HIDDEN WORLD MODEL (may now be discussed):
${JSON.stringify(args.world)}

FULL TRANSCRIPT:
${args.transcript.map((t) => `${t.role.toUpperCase()}: ${t.content.slice(0, 1200)}`).join('\n')}

STUDENT'S OWN DEBRIEF (written before seeing yours):
${args.selfDebrief?.trim() || '(none written)'}

Score how they reasoned, not only what they found.
In "self_assessment_feedback", compare the student's own debrief with what actually happened: where their
self-assessment was accurate, where it was over- or under-confident, and what they did not notice. Empty string if they wrote none.

Return JSON:
{
  "summary": markdown debrief,
  "overall": 0-1,
  "phase_scores": [{ "phase": recon|enumeration|hypothesis|testing|initial-access|privesc|lateral|impact, "score": 0-1, "note": string }],
  "strengths": [..], "weaknesses": [..], "missed_opportunities": [..],
  "reasoning_loop": { "observation": 0-1, "hypothesis": 0-1, "test": 0-1, "evidence": 0-1, "conclusion": 0-1 },
  "concept_updates": [{ "concept": taxonomy concept id, "score": 0-1 }],
  "next_steps": [..],
  "self_assessment_feedback": markdown string
}`;
    const { data } = await callStructured({
      provider: this.provider,
      models: this.chain('simulator'),
      schema: SimDebrief,
      messages: [system(), { role: 'user', content: user }],
      temperature: 0.3,
      timeoutMs: 180_000,
    });
    return data;
  }

  async recallReview(args: { domainName: string; concepts: { id: string; name: string }[]; text: string; student: string }) {
    const user = `TASK: recall_review
The student did a FREE RECALL exercise: with no notes, they wrote everything they remember about one domain.
Judge only what is written. A term mentioned without explanation is at most "partial".

DOMAIN: ${args.domainName}
STUDENT PROFILE: ${args.student}
CONCEPTS IN THIS DOMAIN (id: name):
${args.concepts.map((c) => `- ${c.id}: ${c.name}`).join('\n')}

STUDENT TEXT:
${args.text}

END OF STUDENT TEXT

For EVERY concept above, decide:
- "solid": explains the mechanism correctly in their own words
- "partial": mentions it with some correct detail but gaps or no mechanism
- "none": absent, or only named in passing

Return JSON:
{
  "concepts": [{ "concept": concept id, "recalled": "none" | "partial" | "solid", "note": one short sentence on what was there or missing }],
  "errors": [{ "concept": concept id, "text": a factually wrong statement the student made, stated as a misconception }],
  "connections": [links the student drew to other concepts or domains, short phrases],
  "feedback": concise markdown: what they retrieved well, the most important gaps to restudy, one concrete next step
}`;
    const { data } = await callStructured({
      provider: this.provider,
      models: this.chain('evaluator'),
      schema: RecallReview,
      messages: [system(), { role: 'user', content: user }],
      temperature: 0.2,
    });
    return data;
  }

  async diagramSpec(args: { topic: string; prompt: string }) {
    const topic = args.topic ? DIAGRAM_TOPIC_INDEX.get(args.topic) : undefined;
    const user = `TASK: diagram_spec
${topic ? `TOPIC: ${topic.title}\nTOPIC BRIEF (follow it — it carries the correctness cues for this topic):\n${topic.prompt}\n` : ''}
STUDENT REQUEST: ${args.prompt || topic?.title || 'design a teaching diagram'}
${topic && args.prompt ? `ADDITIONAL FOCUS FROM THE STUDENT: ${args.prompt}` : ''}

Design the diagram now. Requirements:
- Zones arranged on the 12-column grid; 2-4 zones; nodes listed in reveal order inside their zone.
- 3-8 steps; step 1 is the initial state; everything else reveals in causal order.
- Accurate per the guardrails; teaching captions with the exact fields that matter.
- Use the "danger" edge kind and/or a final "attacks" step when the topic has an attack overlay.

Return JSON:
{
  "title": short title,
  "subtitle": one sentence,
  "alt": accessible one-paragraph description of the whole picture,
  "zones": [{ "id", "label", "sub"?, "tone": "brand"|"plain"|"warn", "col": 1-12, "span": 2-12 }],
  "nodes": [{ "id", "title", "sub"?, "icon", "zone"?, "tags"?: [...], "tone"?: "std"|"brand"|"warn", "explain": plain-language label (ALWAYS), "step" }],
  "edges": [{ "id", "from", "to", "label"?, "kind"?: "flow"|"untrusted"|"signed"|"stream"|"optional"|"danger", "packets"?: 0-4, "dur"?: 1.4-4.5, "route"?: "auto"|"h"|"v"|"below"|"above", "labelAt"?: "start"|"mid"|"end", "explain": plain-language label (ALWAYS), "step" }],
  "notes": [{ "zone", "text", "style"?: "plain"|"mono"|"strong", "step"? }],
  "steps": [{ "title", "caption" }]
}`;
    const { data } = await callStructured({
      provider: this.provider,
      models: this.chain('generator'),
      schema: DiagramSpec,
      messages: [diagramSystem(), { role: 'user', content: user }],
      temperature: Math.min(1.05, this.settings().temperature + 0.15),
      timeoutMs: 240_000,
    });
    return data;
  }

  async diagramRefine(args: { spec: DiagramSpec; instruction: string }) {
    const user = `TASK: diagram_refine
You are editing an existing diagram spec.

CURRENT SPEC (JSON):
${JSON.stringify(args.spec)}

REFINEMENT REQUEST: ${args.instruction}

Apply the request with MINIMAL edits. Keep every existing id, title and unmentioned
field exactly as they are; add/remove/reorder/relabel only what the request touches.
If asked to add a node/edge/zone, place it logically (order inside the zone matters)
and connect it with edges whose step ≥ their endpoints' steps. If asked to re-teach or
simplify, update captions/subtitles rather than deleting content. Whenever you change a
title/label, update that element's "explain" to match (keep it plain-language). Never
drop unrelated elements. Return the FULL updated spec as one JSON object, same schema
as the input.`;
    const { data } = await callStructured({
      provider: this.provider,
      models: this.chain('generator'),
      schema: DiagramSpec,
      messages: [diagramSystem(), { role: 'user', content: user }],
      temperature: 0.25,
      timeoutMs: 240_000,
    });
    return data;
  }

  /** One component or link explained in plain everyday language (the tap-a-label popup). */
  async explainEntity(args: { spec: DiagramSpec; kind: 'node' | 'edge'; id: string; deeper: boolean }) {
    const { spec } = args;
    const nodeName = (id: string) => spec.nodes.find((n) => n.id === id)?.title ?? id;
    let entity = '';
    let existing = '';
    if (args.kind === 'node') {
      const n = spec.nodes.find((x) => x.id === args.id);
      if (!n) return null;
      entity = `NODE "${n.title}"${n.sub ? ` (${n.sub})` : ''}${n.tags.length ? ` [${n.tags.join(', ')}]` : ''}`;
      existing = n.explain ?? '';
    } else {
      const e = spec.edges.find((x) => x.id === args.id);
      if (!e) return null;
      entity = `CONNECTION ${nodeName(e.from)} → ${nodeName(e.to)}${e.label ? ` labelled "${e.label}"` : ''} (kind: ${e.kind})`;
      existing = e.explain ?? '';
    }
    const user = `TASK: explain_entity
DIAGRAM: ${spec.title} — ${spec.subtitle}
${entity}
${existing ? `EXISTING EXPLANATION (go deeper: keep it consistent but ADD a concrete example or analogy; do not just repeat it):\n${existing}\n` : ''}
Explain this in plain everyday language for someone who has never heard the term:
first give a one-line meaning (expand any acronym), then what it does in THIS diagram's
flow, then why it matters (what breaks, or what an attacker gains) — in context.
1-3 short sentences to one short paragraph. Light markdown allowed. No filler.

Return JSON: { "explanation": markdown string }`;
    const { data } = await callStructured({
      provider: this.provider,
      models: this.chain('generator'),
      schema: z.object({ explanation: z.string().max(1600) }),
      messages: [diagramSystem(), { role: 'user', content: user }],
      temperature: 0.35,
      timeoutMs: 90_000,
    });
    return data.explanation;
  }

  /** Saved conversation about one diagram. Plain markdown replies (no schema). */
  async diagramChat(args: {
    spec: DiagramSpec;
    history: { role: 'user' | 'assistant'; content: string }[];
    message: string;
    focus?: { kind: 'node' | 'edge'; id: string } | null;
  }) {
    const { spec } = args;
    const compact = {
      title: spec.title,
      subtitle: spec.subtitle,
      zones: spec.zones.map((z) => ({ label: z.label, sub: z.sub })),
      nodes: spec.nodes.map((n) => ({ id: n.id, title: n.title, sub: n.sub, tags: n.tags, zone: n.zone, explain: n.explain?.slice(0, 400) })),
      edges: spec.edges.map((e) => ({ from: e.from, to: e.to, label: e.label, kind: e.kind, explain: e.explain?.slice(0, 400) })),
      steps: spec.steps.map((s) => ({ title: s.title, caption: s.caption.slice(0, 500) })),
    };
    let focusBlock = '';
    if (args.focus) {
      const label =
        args.focus.kind === 'node'
          ? (spec.nodes.find((n) => n.id === args.focus!.id)?.title ?? args.focus.id)
          : (() => {
              const e = spec.edges.find((x) => x.id === args.focus!.id);
              if (!e) return args.focus!.id;
              const from = spec.nodes.find((n) => n.id === e.from)?.title ?? e.from;
              const to = spec.nodes.find((n) => n.id === e.to)?.title ?? e.to;
              return `${e.label ? `"${e.label}" · ` : ''}${from} → ${to}`;
            })();
      focusBlock = `THE STUDENT IS LOOKING AT: ${args.focus.kind} — ${label}. Anchor your answer to it when relevant, then zoom out if useful.`;
    }

    const system = `You are the companion for ONE specific diagram in Pentest Skill Coach: the animated step-by-step teaching
diagram the student is currently looking at. The full diagram (components, links, step captions and plain-language
explanations) is given below as JSON.

HOW TO ANSWER
- Ground every answer in THIS diagram. Refer to components and wires by their labels so the student can map your
  words onto the canvas.
- Anticipate asks like: deeper mechanics, plain-language definitions, "why does it matter", "what would an attacker
  do next", "what if X changed", comparisons, or a quick quiz. Meet the ask directly.
- Plain, direct language. Short markdown: 1-4 short paragraphs or a tight list; bold the key term; no filler, no
  restating the question, no headings unless the answer is long.
- Be technically exact. Never invent CVEs, commands, protocol behavior or tool capabilities. When something depends
  on implementation or version, say so. When the diagram simplifies reality, say where.
- If the question reveals a misconception, correct it explicitly and briefly.
- Everything stays inside authorized labs (RFC1918, *.lab.local, example.*).
- If asked about something this diagram does not cover, answer it but make clear it goes beyond the diagram.

DIAGRAM:
${JSON.stringify(compact)}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      ...args.history.slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 1500) })),
      { role: 'user', content: `${focusBlock ? focusBlock + '\n\n' : ''}QUESTION: ${args.message}` },
    ];

    let lastErr: AIError = new AIError('unavailable', 'No models configured.');
    for (const model of this.chain('generator')) {
      try {
        const raw = await this.provider.chat({ model, messages, temperature: 0.4, timeoutMs: 90_000 });
        if (raw.trim()) {
          recordSuccess(this.provider.name);
          return raw.trim();
        }
        lastErr = new AIError('invalid_output', 'Model returned an empty reply.', model);
      } catch (e) {
        lastErr = e instanceof AIError ? e : new AIError('unknown', (e as Error).message, model);
        if (!lastErr.retryableWithOtherModel) break;
      }
    }
    recordFailure(this.provider.name, lastErr);
    throw lastErr;
  }

  async ping(model: string) {
    const raw = await this.provider.chat({
      model,
      messages: [{ role: 'user', content: 'TASK: ping\nReply with the JSON object {"ok": true}.' }],
      schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
      timeoutMs: 60_000,
    });
    return raw.slice(0, 200);
  }

  listModels() {
    return this.provider.listModels();
  }
}
