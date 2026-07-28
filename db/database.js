const fs = require('fs');
const path = require('path');
const config = require('../config');

let db = null;
let useFallback = false;

const dbPath = path.resolve(process.cwd(), config.dbFilePath);

try {
  const Database = require('better-sqlite3');
  db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);
  console.log('✔ Connected to SQLite via better-sqlite3.');
} catch (err) {
  console.warn('⚠️ better-sqlite3 native binary not available on this platform/Node version. Using file-backed fallback storage engine.');
  useFallback = true;
}

// Fallback JSON-file database implementation if native SQLite binding fails
const fallbackPath = path.resolve(process.cwd(), './bot_data.json');
function loadFallbackData() {
  if (!fs.existsSync(fallbackPath)) {
    const initial = { sessions: {}, jds: [], resumes: [], scores: [], nextJdId: 1, nextResumeId: 1, nextScoreId: 1 };
    fs.writeFileSync(fallbackPath, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
  } catch (e) {
    return { sessions: {}, jds: [], resumes: [], scores: [], nextJdId: 1, nextResumeId: 1, nextScoreId: 1 };
  }
}

function saveFallbackData(data) {
  fs.writeFileSync(fallbackPath, JSON.stringify(data, null, 2));
}

// SQLite Prepared Statements (if better-sqlite3 works)
let sqliteOps = null;
if (!useFallback) {
  sqliteOps = {
    getSession: db.prepare(`SELECT * FROM sessions WHERE chat_id = ?`),
    upsertSession: db.prepare(`
      INSERT INTO sessions (chat_id, active_jd_id, mode, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(chat_id) DO UPDATE SET
        active_jd_id = COALESCE(excluded.active_jd_id, sessions.active_jd_id),
        mode = COALESCE(excluded.mode, sessions.mode),
        updated_at = CURRENT_TIMESTAMP
    `),
    deleteJdsByChat: db.prepare(`DELETE FROM jds WHERE chat_id = ?`),
    deleteResumesByChat: db.prepare(`DELETE FROM resumes WHERE chat_id = ?`),
    resetSession: db.prepare(`DELETE FROM sessions WHERE chat_id = ?`),

    createJd: db.prepare(`
      INSERT INTO jds (chat_id, title, raw_text, structured_json)
      VALUES (?, ?, ?, ?)
    `),
    getJdById: db.prepare(`SELECT * FROM jds WHERE id = ?`),
    listJdsByChat: db.prepare(`
      SELECT j.*, COUNT(r.id) AS candidate_count
      FROM jds j
      LEFT JOIN resumes r ON r.jd_id = j.id
      WHERE j.chat_id = ?
      GROUP BY j.id
      ORDER BY j.id ASC
    `),

    createResume: db.prepare(`
      INSERT INTO resumes (chat_id, jd_id, file_name, candidate_name, candidate_email, candidate_phone, raw_text, structured_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getResumesByJd: db.prepare(`SELECT * FROM resumes WHERE jd_id = ?`),

    saveScore: db.prepare(`
      INSERT INTO scores (resume_id, jd_id, ats_score, matched_skills, missing_skills, missing_nice_to_have, experience_gap, summary, structured_score_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getRankedCandidates: db.prepare(`
      SELECT 
        r.id AS resume_id,
        r.candidate_name,
        r.candidate_email,
        r.candidate_phone,
        r.file_name,
        r.structured_json AS candidate_json,
        s.ats_score,
        s.matched_skills,
        s.missing_skills,
        s.missing_nice_to_have,
        s.experience_gap,
        s.summary
      FROM resumes r
      LEFT JOIN scores s ON s.resume_id = r.id AND s.jd_id = r.jd_id
      WHERE r.jd_id = ?
      ORDER BY COALESCE(s.ats_score, 0) DESC, r.id ASC
    `),
    getAllResumesByChat: db.prepare(`SELECT * FROM resumes WHERE chat_id = ?`),
    getScoresByChat: db.prepare(`
      SELECT 
        s.*,
        r.candidate_name,
        r.file_name,
        r.chat_id
      FROM scores s
      JOIN resumes r ON r.id = s.resume_id
      WHERE r.chat_id = ?
    `)
  };
}

module.exports = {
  db,
  isFallback: useFallback,

  // Sessions
  getSession(chatId) {
    const cid = String(chatId);
    if (!useFallback) {
      const s = sqliteOps.getSession.get(cid);
      return s || { chat_id: cid, active_jd_id: null, mode: 'IDLE' };
    } else {
      const data = loadFallbackData();
      return data.sessions[cid] || { chat_id: cid, active_jd_id: null, mode: 'IDLE' };
    }
  },

  setSessionMode(chatId, mode) {
    this.updateSession(chatId, { mode });
  },

  setActiveJd(chatId, jdId) {
    this.updateSession(chatId, { activeJdId: jdId });
  },

  updateSession(chatId, { activeJdId, mode }) {
    const cid = String(chatId);
    if (!useFallback) {
      sqliteOps.upsertSession.run(cid, activeJdId !== undefined ? activeJdId : null, mode || null);
    } else {
      const data = loadFallbackData();
      const current = data.sessions[cid] || { chat_id: cid, active_jd_id: null, mode: 'IDLE' };
      data.sessions[cid] = {
        chat_id: cid,
        active_jd_id: activeJdId !== undefined ? activeJdId : current.active_jd_id,
        mode: mode || current.mode,
        updated_at: new Date().toISOString()
      };
      saveFallbackData(data);
    }
  },

  resetSession(chatId) {
    const cid = String(chatId);
    if (!useFallback) {
      sqliteOps.deleteResumesByChat.run(cid);
      sqliteOps.deleteJdsByChat.run(cid);
      sqliteOps.resetSession.run(cid);
    } else {
      const data = loadFallbackData();
      delete data.sessions[cid];
      const chatJds = new Set(data.jds.filter(j => String(j.chat_id) === cid).map(j => j.id));
      data.jds = data.jds.filter(j => String(j.chat_id) !== cid);
      data.resumes = data.resumes.filter(r => String(r.chat_id) !== cid);
      data.scores = data.scores.filter(s => !chatJds.has(s.jd_id));
      saveFallbackData(data);
    }
  },

  // JDs
  createJd(chatId, title, rawText, structuredJson) {
    const cid = String(chatId);
    const sJson = typeof structuredJson === 'object' ? JSON.stringify(structuredJson) : structuredJson;

    if (!useFallback) {
      const res = sqliteOps.createJd.run(cid, title, rawText, sJson);
      return res.lastInsertRowid;
    } else {
      const data = loadFallbackData();
      const newJd = {
        id: data.nextJdId++,
        chat_id: cid,
        title,
        raw_text: rawText,
        structured_json: sJson,
        created_at: new Date().toISOString()
      };
      data.jds.push(newJd);
      saveFallbackData(data);
      return newJd.id;
    }
  },

  getJdById(jdId) {
    const id = Number(jdId);
    if (!useFallback) {
      return sqliteOps.getJdById.get(id);
    } else {
      const data = loadFallbackData();
      return data.jds.find(j => j.id === id) || null;
    }
  },

  listJds(chatId) {
    const cid = String(chatId);
    if (!useFallback) {
      return sqliteOps.listJdsByChat.all(cid);
    } else {
      const data = loadFallbackData();
      const chatJds = data.jds.filter(j => String(j.chat_id) === cid);
      return chatJds.map(j => {
        const candidateCount = data.resumes.filter(r => r.jd_id === j.id).length;
        return { ...j, candidate_count: candidateCount };
      });
    }
  },

  // Resumes
  createResume(chatId, jdId, fileName, candidateName, candidateEmail, candidatePhone, rawText, structuredJson) {
    const cid = String(chatId);
    const jid = Number(jdId);
    const sJson = typeof structuredJson === 'object' ? JSON.stringify(structuredJson) : structuredJson;

    if (!useFallback) {
      const res = sqliteOps.createResume.run(
        cid,
        jid,
        fileName || 'Resume',
        candidateName || 'Unknown Candidate',
        candidateEmail || null,
        candidatePhone || null,
        rawText,
        sJson
      );
      return res.lastInsertRowid;
    } else {
      const data = loadFallbackData();
      const newResume = {
        id: data.nextResumeId++,
        chat_id: cid,
        jd_id: jid,
        file_name: fileName || 'Resume',
        candidate_name: candidateName || 'Unknown Candidate',
        candidate_email: candidateEmail || null,
        candidate_phone: candidatePhone || null,
        raw_text: rawText,
        structured_json: sJson,
        created_at: new Date().toISOString()
      };
      data.resumes.push(newResume);
      saveFallbackData(data);
      return newResume.id;
    }
  },

  getResumesByJd(jdId) {
    const jid = Number(jdId);
    if (!useFallback) {
      return sqliteOps.getResumesByJd.all(jid);
    } else {
      const data = loadFallbackData();
      return data.resumes.filter(r => r.jd_id === jid);
    }
  },

  // Scores
  saveScore(resumeId, jdId, scoreObj) {
    const rid = Number(resumeId);
    const jid = Number(jdId);
    const {
      ats_score,
      matched_required_skills,
      missing_required_skills,
      missing_nice_to_have_skills,
      experience_gap_years,
      summary
    } = scoreObj;

    const matchedStr = JSON.stringify(matched_required_skills || []);
    const missingReqStr = JSON.stringify(missing_required_skills || []);
    const missingNiceStr = JSON.stringify(missing_nice_to_have_skills || []);
    const scoreJsonStr = JSON.stringify(scoreObj);

    if (!useFallback) {
      return sqliteOps.saveScore.run(
        rid,
        jid,
        ats_score || 0,
        matchedStr,
        missingReqStr,
        missingNiceStr,
        experience_gap_years || 0,
        summary || '',
        scoreJsonStr
      );
    } else {
      const data = loadFallbackData();
      const newScore = {
        id: data.nextScoreId++,
        resume_id: rid,
        jd_id: jid,
        ats_score: ats_score || 0,
        matched_skills: matchedStr,
        missing_skills: missingReqStr,
        missing_nice_to_have: missingNiceStr,
        experience_gap: experience_gap_years || 0,
        summary: summary || '',
        structured_score_json: scoreJsonStr,
        created_at: new Date().toISOString()
      };
      data.scores.push(newScore);
      saveFallbackData(data);
      return newScore.id;
    }
  },

  getRankedCandidates(jdId) {
    const jid = Number(jdId);
    if (!useFallback) {
      return sqliteOps.getRankedCandidates.all(jid);
    } else {
      const data = loadFallbackData();
      const resumes = data.resumes.filter(r => r.jd_id === jid);
      const ranked = resumes.map(r => {
        const scoreEntry = data.scores.find(s => s.resume_id === r.id && s.jd_id === jid);
        return {
          resume_id: r.id,
          candidate_name: r.candidate_name,
          candidate_email: r.candidate_email,
          candidate_phone: r.candidate_phone,
          file_name: r.file_name,
          candidate_json: r.structured_json,
          ats_score: scoreEntry ? scoreEntry.ats_score : 0,
          matched_skills: scoreEntry ? scoreEntry.matched_skills : '[]',
          missing_skills: scoreEntry ? scoreEntry.missing_skills : '[]',
          missing_nice_to_have: scoreEntry ? scoreEntry.missing_nice_to_have : '[]',
          experience_gap: scoreEntry ? scoreEntry.experience_gap : 0,
          summary: scoreEntry ? scoreEntry.summary : ''
        };
      });

      ranked.sort((a, b) => (b.ats_score || 0) - (a.ats_score || 0));
      return ranked;
    }
  },

  getAllResumesByChat(chatId) {
    const cid = String(chatId);
    if (!useFallback) {
      return sqliteOps.getAllResumesByChat.all(cid);
    } else {
      const data = loadFallbackData();
      return data.resumes.filter(r => String(r.chat_id) === cid);
    }
  },

  getScoresByChat(chatId) {
    const cid = String(chatId);
    if (!useFallback) {
      return sqliteOps.getScoresByChat.all(cid);
    } else {
      const data = loadFallbackData();
      const chatResumes = data.resumes.filter(r => String(r.chat_id) === cid);
      const resumeIds = new Set(chatResumes.map(r => r.id));
      return data.scores.filter(s => resumeIds.has(s.resume_id)).map(s => {
        const r = chatResumes.find(res => res.id === s.resume_id);
        return { ...s, candidate_name: r ? r.candidate_name : 'Unknown Candidate', file_name: r ? r.file_name : '' };
      });
    }
  }
};
