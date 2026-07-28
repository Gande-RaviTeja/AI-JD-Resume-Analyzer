CREATE TABLE IF NOT EXISTS sessions (
    chat_id TEXT PRIMARY KEY,
    active_jd_id INTEGER,
    mode TEXT DEFAULT 'IDLE',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    title TEXT,
    raw_text TEXT,
    structured_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS resumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    jd_id INTEGER NOT NULL,
    file_name TEXT,
    candidate_name TEXT,
    candidate_email TEXT,
    candidate_phone TEXT,
    raw_text TEXT,
    structured_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (jd_id) REFERENCES jds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resume_id INTEGER NOT NULL,
    jd_id INTEGER NOT NULL,
    ats_score REAL,
    matched_skills TEXT,
    missing_skills TEXT,
    missing_nice_to_have TEXT,
    experience_gap REAL,
    summary TEXT,
    structured_score_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE,
    FOREIGN KEY (jd_id) REFERENCES jds(id) ON DELETE CASCADE
);
