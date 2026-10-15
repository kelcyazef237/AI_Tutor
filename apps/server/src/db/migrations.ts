/** Append-only list of migrations. Never edit a shipped entry; add a new one. */
export const MIGRATIONS: string[] = [
  /* v1 — initial schema */ `
  CREATE TABLE settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    json TEXT NOT NULL
  );

  CREATE TABLE concept_state (
    concept_id      TEXT PRIMARY KEY,
    mastery         REAL NOT NULL DEFAULT 0,
    confidence      REAL NOT NULL DEFAULT 0,
    attempts        INTEGER NOT NULL DEFAULT 0,
    success_streak  INTEGER NOT NULL DEFAULT 0,
    fail_streak     INTEGER NOT NULL DEFAULT 0,
    max_diff_passed INTEGER NOT NULL DEFAULT 0,
    types_seen      TEXT NOT NULL DEFAULT '[]',
    last_assessed   INTEGER,
    next_review     INTEGER,
    interval_hours  REAL NOT NULL DEFAULT 0,
    ease            REAL NOT NULL DEFAULT 2.5,
    theory          REAL NOT NULL DEFAULT 0,
    practical       REAL NOT NULL DEFAULT 0,
    pentest         REAL NOT NULL DEFAULT 0,
    obs_hyp         REAL NOT NULL DEFAULT 0,
    attack_path     REAL NOT NULL DEFAULT 0,
    updated_at      INTEGER NOT NULL
  );

  CREATE TABLE mastery_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    concept_id TEXT NOT NULL,
    mastery    REAL NOT NULL,
    confidence REAL NOT NULL,
    at         INTEGER NOT NULL
  );
  CREATE INDEX idx_mh_concept_at ON mastery_history(concept_id, at);
  CREATE INDEX idx_mh_at ON mastery_history(at);

  CREATE TABLE questions (
    id          TEXT PRIMARY KEY,
    concept_id  TEXT NOT NULL,
    type        TEXT NOT NULL,
    difficulty  INTEGER NOT NULL,
    source      TEXT NOT NULL CHECK (source IN ('imported', 'custom', 'generated', 'followup')),
    json        TEXT NOT NULL,
    times_asked INTEGER NOT NULL DEFAULT 0,
    last_asked  INTEGER,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX idx_q_concept ON questions(concept_id, source);

  CREATE TABLE sessions (
    id                  TEXT PRIMARY KEY,
    mode                TEXT NOT NULL,
    started_at          INTEGER NOT NULL,
    ended_at            INTEGER,
    total               INTEGER NOT NULL,
    answered            INTEGER NOT NULL DEFAULT 0,
    plan_json           TEXT NOT NULL,
    greeting            TEXT NOT NULL DEFAULT '',
    current_question_id TEXT,
    followup_depth      INTEGER NOT NULL DEFAULT 0,
    summary_json        TEXT
  );

  CREATE TABLE attempts (
    id             TEXT PRIMARY KEY,
    session_id     TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    question_id    TEXT NOT NULL,
    concept_id     TEXT NOT NULL,
    answer         TEXT NOT NULL,
    eval_json      TEXT,
    result         TEXT,
    score          REAL,
    mastery_before REAL,
    mastery_after  REAL,
    self_graded    INTEGER NOT NULL DEFAULT 0,
    is_follow_up   INTEGER NOT NULL DEFAULT 0,
    pending        INTEGER NOT NULL DEFAULT 0,
    duration_ms    INTEGER,
    created_at     INTEGER NOT NULL
  );
  CREATE INDEX idx_attempts_session ON attempts(session_id);
  CREATE INDEX idx_attempts_concept ON attempts(concept_id, created_at);

  CREATE TABLE misconceptions (
    id          TEXT PRIMARY KEY,
    concept_id  TEXT NOT NULL,
    text        TEXT NOT NULL,
    occurrences INTEGER NOT NULL DEFAULT 1,
    first_seen  INTEGER NOT NULL,
    last_seen   INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
    resolved_at INTEGER
  );
  CREATE INDEX idx_misc_concept ON misconceptions(concept_id, status);

  CREATE TABLE daily_activity (
    day       TEXT PRIMARY KEY,
    questions INTEGER NOT NULL DEFAULT 0,
    correct   INTEGER NOT NULL DEFAULT 0,
    minutes   REAL NOT NULL DEFAULT 0,
    sessions  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE simulations (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    world_json   TEXT NOT NULL,
    started_at   INTEGER NOT NULL,
    ended_at     INTEGER,
    phase        TEXT NOT NULL DEFAULT 'recon',
    status       TEXT NOT NULL DEFAULT 'active',
    graph_json   TEXT NOT NULL DEFAULT '[]',
    loop_json    TEXT NOT NULL DEFAULT '{}',
    objectives_json TEXT NOT NULL DEFAULT '[]',
    debrief_json TEXT
  );

  CREATE TABLE sim_steps (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    sim_id     TEXT NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('user', 'system')),
    content    TEXT NOT NULL,
    meta_json  TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_sim_steps ON sim_steps(sim_id, id);

  CREATE TABLE knowledge (
    id         TEXT PRIMARY KEY,
    concept_id TEXT,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL,
    source_url TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE VIRTUAL TABLE knowledge_fts USING fts5(title, content, concept_id UNINDEXED, content='knowledge', content_rowid='rowid');
  CREATE TRIGGER knowledge_ai AFTER INSERT ON knowledge BEGIN
    INSERT INTO knowledge_fts(rowid, title, content, concept_id) VALUES (new.rowid, new.title, new.content, new.concept_id);
  END;
  CREATE TRIGGER knowledge_ad AFTER DELETE ON knowledge BEGIN
    INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content, concept_id) VALUES ('delete', old.rowid, old.title, old.content, old.concept_id);
  END;
  `,
  /* v2 — small key/value store (persisted AI status) */ `
  CREATE TABLE kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  /* v3 — simulation settings */ `
  ALTER TABLE simulations ADD COLUMN difficulty INTEGER NOT NULL DEFAULT 3;
  ALTER TABLE simulations ADD COLUMN focus TEXT NOT NULL DEFAULT '';
  `,
  /* v4 — calibration, reflection, free recall */ `
  ALTER TABLE attempts ADD COLUMN predicted INTEGER;
  ALTER TABLE sessions ADD COLUMN reflection_json TEXT;
  ALTER TABLE simulations ADD COLUMN self_debrief TEXT;
  CREATE TABLE recalls (
    id           TEXT PRIMARY KEY,
    domain_id    TEXT NOT NULL,
    started_at   INTEGER NOT NULL,
    submitted_at INTEGER,
    text         TEXT NOT NULL DEFAULT '',
    result_json  TEXT,
    self_checked INTEGER NOT NULL DEFAULT 0
  );
  `,
  /* v5 — diagram studio */ `
  CREATE TABLE diagrams (
    id               TEXT PRIMARY KEY,
    title            TEXT NOT NULL,
    subtitle         TEXT NOT NULL DEFAULT '',
    topic            TEXT NOT NULL DEFAULT '',
    prompt           TEXT NOT NULL DEFAULT '',
    spec_json        TEXT NOT NULL,
    model            TEXT NOT NULL DEFAULT '',
    refinements_json TEXT NOT NULL DEFAULT '[]',
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL
  );
  CREATE INDEX idx_diagrams_updated ON diagrams(updated_at DESC);
  `,
  /* v6 — hand-arranged diagram positions (separate from the AI spec) */ `
  ALTER TABLE diagrams ADD COLUMN layout_json TEXT NOT NULL DEFAULT '{}';
  `,
  /* v7 — saved per-diagram chat */ `
  CREATE TABLE diagram_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    diagram_id  TEXT NOT NULL REFERENCES diagrams(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content     TEXT NOT NULL,
    focus_json  TEXT,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX idx_dm_diagram ON diagram_messages(diagram_id, id);
  `,
];
