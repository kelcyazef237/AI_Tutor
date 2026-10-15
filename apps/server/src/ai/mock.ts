import type { AIProvider, ChatRequest } from './provider';

/**
 * Deterministic offline provider for development, demos and tests.
 * It does not produce real teaching content: every output is clearly
 * labelled as mock data so it is never mistaken for an assessment.
 */
export class MockProvider implements AIProvider {
  readonly name = 'mock';
  calls: ChatRequest[] = [];

  async chat(req: ChatRequest): Promise<string> {
    this.calls.push(req);
    const user = req.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
    const system = req.messages.find((m) => m.role === 'system')?.content ?? '';
    const task = system.includes('companion for ONE specific diagram') ? 'diagram_chat' : (/TASK:\s*(\S+)/.exec(user)?.[1] ?? 'unknown');
    const concept = /CONCEPT:\s*(.+)/.exec(user)?.[1]?.trim() ?? 'the concept';
    // The answer is followed by the evaluation instructions ("Evaluate strictly…").
    const answer = /STUDENT ANSWER:\s*([\s\S]*?)(?:\n\s*Evaluate strictly|\n[A-Z ]+:|$)/.exec(user)?.[1]?.trim() ?? '';

    switch (task) {
      case 'generate_question':
        return JSON.stringify({
          type: 'explain',
          difficulty: 2,
          prompt: `**[Mock question]** Explain, in your own words, how *${concept}* works and why it matters during an assessment. (Mock provider — switch to a real model in Settings for genuine questions.)`,
          objective: `Explain ${concept}`,
          estMinutes: 3,
          secondaryConcepts: [],
          rubric: { keyPoints: ['Describes the mechanism', 'Connects it to practical impact'], misconceptions: [], referenceAnswer: 'Mock reference answer.' },
        });
      case 'evaluate': {
        const len = answer.length;
        const s = Math.min(1, len / 300);
        const result = s > 0.7 ? 'correct' : s > 0.35 ? 'partial' : 'incorrect';
        return JSON.stringify({
          result,
          scores: { correctness: s, conceptual_understanding: s, reasoning_quality: s * 0.9, pentest_application: s * 0.8, observation_vs_hypothesis: s * 0.7 },
          confidence: 0.6,
          guessed: false,
          understands_mechanism: s > 0.6,
          misconceptions: result === 'incorrect' ? ['[mock] answer too brief to show the mechanism'] : [],
          concepts_demonstrated: result === 'correct' ? [concept] : [],
          concepts_to_review: result === 'correct' ? [] : [concept],
          missing_points: result === 'correct' ? [] : ['[mock] more detail on the mechanism'],
          recommended_action: result === 'partial' ? 'follow_up' : 'advance',
          follow_up_question: result === 'partial' ? `**[Mock follow-up]** Expand on the part of *${concept}* you skipped.` : null,
          mastery_delta: (s - 0.5) * 0.4,
          feedback: `**Mock evaluation** (length-based heuristic, not a real assessment). Result: *${result}*.`,
        });
      }
      case 'sim_world':
        return JSON.stringify({
          title: 'Mock Lab Engagement',
          briefing: 'Mock scenario for UI testing. Switch to a real model for a genuine simulation.',
          scope: '10.0.0.0/30 (mock lab)',
          attackerModel: 'External, unauthenticated',
          credentials: 'None',
          timeLimitMinutes: 30,
          hosts: [{ id: 'h1', hostname: 'web01.lab.local', ip: '10.0.0.2', os: 'Linux', role: 'web', services: [{ port: 80, proto: 'tcp', name: 'http', version: 'mock', notes: '' }] }],
          vulnerabilities: [],
          intendedChain: ['recon', 'enumeration'],
          objectives: ['Map the mock environment'],
          concepts: ['method.recon'],
        });
      case 'sim_step':
        return JSON.stringify({
          evidence: '```\n[mock] Simulated output for your action.\n```',
          mentor_note: 'Mock mentor note.',
          reasoning: { action_quality: 0.6, reasoning_quality: 0.6, observation: true, hypothesis: answer.length > 40, test: false, evidence: false, conclusion: false },
          phase: 'recon',
          discovered: [{ id: 'h1', kind: 'host', label: 'web01.lab.local', parent: null }, { id: 'h1-80', kind: 'service', label: '80/tcp http', parent: 'h1' }],
          objective_completed: null,
          engagement_over: false,
          concepts: ['method.recon'],
        });
      case 'sim_debrief':
        return JSON.stringify({
          summary: 'Mock debrief.',
          overall: 0.6,
          phase_scores: [{ phase: 'recon', score: 0.6, note: 'mock' }],
          strengths: ['[mock] strength'],
          weaknesses: ['[mock] weakness'],
          missed_opportunities: [],
          reasoning_loop: { observation: 0.7, hypothesis: 0.5, test: 0.4, evidence: 0.4, conclusion: 0.3 },
          concept_updates: [{ concept: 'method.recon', score: 0.6 }],
          next_steps: ['[mock] next step'],
          self_assessment_feedback: /STUDENT'S OWN DEBRIEF[^\n]*\n\(none written\)/.test(user) ? '' : '[mock] Comparison with your own debrief.',
        });
      case 'recall_review': {
        const text = (/STUDENT TEXT:\n([\s\S]*?)\n\nEND OF STUDENT TEXT/.exec(user)?.[1] ?? '').toLowerCase();
        const concepts = [...user.matchAll(/^- ([a-z]+\.[a-z0-9-]+): (.+)$/gm)].map((m) => ({ id: m[1]!, name: m[2]!.trim() }));
        return JSON.stringify({
          concepts: concepts.map((c) => ({
            concept: c.id,
            recalled: text.includes(c.name.toLowerCase()) ? 'solid' : text.includes(c.id.split('.')[1]!) ? 'partial' : 'none',
            note: '[mock] name-matching heuristic',
          })),
          errors: text.includes('wrong') && concepts[0] ? [{ concept: concepts[0].id, text: '[mock] stated something wrong' }] : [],
          connections: [],
          feedback: '**Mock recall review** (name matching, not a real assessment).',
        });
      }
      case 'diagram_spec':
      case 'diagram_refine': {
        const instruction = /REFINEMENT REQUEST: (.+)/.exec(user)?.[1]?.trim();
        return JSON.stringify({
          title: instruction ? 'Mock refined diagram' : 'Mock Lab Diagram',
          subtitle: instruction ? `[mock] ${instruction.slice(0, 120)}` : 'Mock provider — switch to a real model in Settings for genuine diagrams.',
          alt: 'A mock client node connected to a mock server node, with one animated packet flow.',
          zones: [{ id: 'lab', label: 'MOCK LAB', sub: 'not a real diagram', tone: 'brand', col: 1, span: 12 }],
          nodes: [
            { id: 'client', title: 'Client', sub: '10.0.0.2 · workstation', icon: 'laptop', zone: 'lab', tags: ['10.0.0.2'], step: 1 },
            { id: 'server', title: 'Server', sub: '10.0.0.9 · web', icon: 'server', zone: 'lab', tags: [':443'], tone: 'brand', step: 1 },
          ],
          edges: [{ id: 'req', from: 'client', to: 'server', label: 'MOCK', kind: 'flow', packets: 2, step: 2 }],
          notes: [{ zone: 'lab', text: '[mock] replace the provider in Settings', style: 'mono' }],
          steps: [
            { title: '1 · The scene', caption: 'Mock initial state. Nothing is connected yet.' },
            { title: '2 · The flow', caption: 'A mock packet travels from client to server. **This is not real content.**' },
          ],
        });
      }
      case 'explain_entity':
        return JSON.stringify({ explanation: `**[Mock explanation]** This placeholder describes the component in plain terms. (Mock provider — switch to a real model in Settings.) Request: ${user.slice(0, 120)}` });
      case 'diagram_chat':
        return `**[Mock chat]** Placeholder answer about this diagram. (Mock provider — switch to a real model in Settings.) You asked: ${user.slice(-140)}`;
      case 'greeting':
        return JSON.stringify({ greeting: 'Mock mentor greeting.' });
      default:
        return JSON.stringify({ ok: true });
    }
  }

  async listModels() {
    return ['mock-model'];
  }
}
