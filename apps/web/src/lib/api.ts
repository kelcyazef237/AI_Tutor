import type {
  AIStatus,
  AnswerRequest,
  AnswerResponse,
  EvaluationDTO,
  SessionEndDTO,
  AttemptDTO,
  ConceptStateDTO,
  DashboardDTO,
  DiagramDTO,
  DiagramChatMessageDTO,
  DiagramChatRequest,
  DiagramExplainRequest,
  DiagramExplainResponse,
  DiagramGenerateRequest,
  DiagramSummaryDTO,
  DiagramUpdateRequest,
  ImportResultDTO,
  QuestionDef,
  QuestionInput,
  ProfileDTO,
  ProfilesDTO,
  QuestionRecordDTO,
  QuestionSource,
  SessionSummaryDTO,
  RecallDTO,
  SessionDTO,
  SessionReflection,
  Settings,
  SimulationDTO,
  SimulationSummaryDTO,
  StartSessionRequest,
  StartSimulationRequest,
  SubmitRecallResponse,
  RecallLevel,
} from '@psc/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Machine-readable error kind from the server (e.g. AI failures: "quota" | "unavailable" | …). */
    public kind?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the backend. Is the server running (npm run dev)?');
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = text || res.statusText;
    let kind: string | undefined;
    try {
      const body = JSON.parse(text) as { message?: string; kind?: string };
      msg = body.message ?? msg;
      kind = typeof body.kind === 'string' ? body.kind : undefined;
    } catch {
      /* plain text */
    }
    // Vite proxy returns 5xx with empty body when the backend is down
    if (res.status >= 500 && !text) msg = 'Cannot reach the backend. Is the server running (npm run dev)?';
    throw new ApiError(res.status, msg, kind);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) => request<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T>(p: string, body?: unknown) => request<T>(p, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  del: <T>(p: string) => request<T>(p, { method: 'DELETE' }),

  profiles: () => request<ProfilesDTO>('/profiles'),
  createProfile: (name: string) => request<ProfileDTO>('/profiles', { method: 'POST', body: JSON.stringify({ name }) }),
  activateProfile: (id: string) => request<ProfileDTO>(`/profiles/${encodeURIComponent(id)}/activate`, { method: 'POST', body: '{}' }),
  renameProfile: (id: string, name: string) => request<ProfileDTO>(`/profiles/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteProfile: (id: string) => request<{ ok: true }>(`/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  settings: () => request<Settings>('/settings'),
  saveSettings: (patch: Partial<Settings>) => request<Settings>('/settings', { method: 'PUT', body: JSON.stringify(patch) }),
  startSession: (body: StartSessionRequest) => request<SessionDTO>('/sessions', { method: 'POST', body: JSON.stringify(body) }),
  sessions: () => request<SessionSummaryDTO[]>('/sessions'),
  getSession: (id: string) => request<SessionDTO>(`/sessions/${encodeURIComponent(id)}`),
  answer: (id: string, body: AnswerRequest) => request<AnswerResponse>(`/sessions/${encodeURIComponent(id)}/answer`, { method: 'POST', body: JSON.stringify(body) }),
  nextQuestion: (id: string) => request<SessionDTO>(`/sessions/${encodeURIComponent(id)}/next`, { method: 'POST', body: '{}' }),
  selfGrade: (attemptId: string, score: number) =>
    request<EvaluationDTO>(`/attempts/${encodeURIComponent(attemptId)}/self-grade`, { method: 'POST', body: JSON.stringify({ score }) }),
  endSession: (id: string) => request<SessionEndDTO>(`/sessions/${encodeURIComponent(id)}/end`, { method: 'POST', body: '{}' }),
  saveReflection: (id: string, r: Partial<SessionReflection>) => request<SessionSummaryDTO>(`/sessions/${encodeURIComponent(id)}/reflection`, { method: 'PUT', body: JSON.stringify(r) }),
  sessionAttempts: (id: string) => request<AttemptDTO[]>(`/sessions/${id}/attempts`),
  concepts: () => request<ConceptStateDTO[]>('/concepts'),
  dashboard: () => request<DashboardDTO>('/dashboard'),
  recalls: () => request<RecallDTO[]>('/recall'),
  startRecall: (domainId: string) => request<RecallDTO>('/recall', { method: 'POST', body: JSON.stringify({ domainId }) }),
  getRecall: (id: string) => request<RecallDTO>(`/recall/${encodeURIComponent(id)}`),
  submitRecall: (id: string, text: string) => request<SubmitRecallResponse>(`/recall/${encodeURIComponent(id)}/submit`, { method: 'POST', body: JSON.stringify({ text }) }),
  selfCheckRecall: (id: string, items: { conceptId: string; recalled: RecallLevel }[]) =>
    request<RecallDTO>(`/recall/${encodeURIComponent(id)}/self-check`, { method: 'POST', body: JSON.stringify({ items }) }),
  simulations: () => request<SimulationSummaryDTO[]>('/simulations'),
  startSimulation: (body: Partial<StartSimulationRequest>) => request<SimulationDTO>('/simulations', { method: 'POST', body: JSON.stringify(body) }),
  getSimulation: (id: string) => request<SimulationDTO>(`/simulations/${encodeURIComponent(id)}`),
  simAction: (id: string, action: string) => request<SimulationDTO>(`/simulations/${encodeURIComponent(id)}/action`, { method: 'POST', body: JSON.stringify({ action }) }),
  endSimulation: (id: string, selfDebrief = '') => request<SimulationDTO>(`/simulations/${encodeURIComponent(id)}/end`, { method: 'POST', body: JSON.stringify({ selfDebrief }) }),
  deleteSimulation: (id: string) => request<{ ok: true }>(`/simulations/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  diagrams: () => request<DiagramSummaryDTO[]>('/diagrams'),
  generateDiagram: (body: DiagramGenerateRequest) => request<DiagramDTO>('/diagrams', { method: 'POST', body: JSON.stringify(body) }),
  getDiagram: (id: string) => request<DiagramDTO>(`/diagrams/${encodeURIComponent(id)}`),
  updateDiagram: (id: string, body: DiagramUpdateRequest) => request<DiagramDTO>(`/diagrams/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  explainDiagram: (id: string, body: DiagramExplainRequest) => request<DiagramExplainResponse>(`/diagrams/${encodeURIComponent(id)}/explain`, { method: 'POST', body: JSON.stringify(body) }),
  diagramChat: (id: string) => request<DiagramChatMessageDTO[]>(`/diagrams/${encodeURIComponent(id)}/chat`),
  askDiagram: (id: string, body: DiagramChatRequest) => request<DiagramChatMessageDTO[]>(`/diagrams/${encodeURIComponent(id)}/chat`, { method: 'POST', body: JSON.stringify(body) }),
  clearDiagramChat: (id: string) => request<{ ok: true }>(`/diagrams/${encodeURIComponent(id)}/chat`, { method: 'DELETE' }),
  refineDiagram: (id: string, instruction: string) =>
    request<DiagramDTO>(`/diagrams/${encodeURIComponent(id)}/refine`, { method: 'POST', body: JSON.stringify({ instruction }) }),
  deleteDiagram: (id: string) => request<{ ok: true }>(`/diagrams/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  aiStatus: () => request<AIStatus>('/ai/status'),
  aiModels: () => request<{ models: string[] }>('/ai/models'),
  aiTest: (model: string) => request<{ ok: boolean; message: string; ms: number }>('/ai/test', { method: 'POST', body: JSON.stringify({ model }) }),

  questions: (filters: { source?: QuestionSource; conceptId?: string; q?: string } = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
    const s = qs.toString();
    return request<QuestionRecordDTO[]>(`/questions${s ? `?${s}` : ''}`);
  },
  createQuestion: (q: QuestionInput) => request<QuestionRecordDTO>('/questions', { method: 'POST', body: JSON.stringify(q) }),
  updateQuestion: (id: string, q: QuestionInput) => request<QuestionRecordDTO>(`/questions/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(q) }),
  deleteQuestion: (id: string) => request<{ ok: true }>(`/questions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  importQuestions: (questions: unknown[]) => request<ImportResultDTO>('/questions/import', { method: 'POST', body: JSON.stringify({ questions }) }),
  exportQuestions: () => request<QuestionDef[]>('/questions/export'),
};
