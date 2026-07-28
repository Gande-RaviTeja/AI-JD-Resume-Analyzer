const { createGroqCompletion } = require('./groqClient');
const { getGeminiModel } = require('./geminiClient');
const db = require('../db/database');

const MASTER_SYSTEM_PROMPT = `You are an intelligent, executive HR AI Assistant embedded in a Telegram bot.

Formatting Guidelines for Telegram (CRITICAL):
1. DO NOT USE ANY EMOJIS. Emojis are strictly forbidden. Use plain text, bullet dashes (-), and bold text for headers.
2. Format candidate lists and search results cleanly into structured blocks with clear line breaks.
3. Structure candidate details line-by-line using standard text labels:
   1. Candidate Name
      - Email: abhaykoka2004@gmail.com
      - Phone: +91 9121798394
      - Education: B.Tech (AI & DS) at KL University, Hyderabad (2022 - 2026)
      - Work Experience: Intern at NIT Karnataka
      - ATS Score: 69/100
      - Missing Skills: Next.js, Node.js

Education Start & End Date Rules (CRITICAL):
- When asked for starting year / start date of B.Tech or degree for candidates:
  - Extract the STARTING YEAR (the first year/left-side date mentioned in the education record or raw text, e.g. 2021, 2022) for EVERY SINGLE CANDIDATE.
  - NEVER say "Not specified" if a year is present in the dataset context or candidate raw text.
- When asked for end year / completion date of B.Tech or degree for candidates:
  - Extract the END YEAR (the right-side date, e.g. 2025, 2026).
  - If the right-side date is "CURRENT", "Present", or ongoing, state the starting year and CURRENT/Present (e.g., 2021 - CURRENT).

4. DO NOT output markdown link syntax like [email@domain.com](mailto:email@domain.com) or [text](url). Always output plain clean email addresses (e.g., abhaykoka2004@gmail.com).
5. DO NOT double-nest bullets like "* **Name**:". Use clean numbered lists (1., 2.) or bullet dashes (-).
6. Keep responses clear, professional, structured, and concise.`;

function cleanUpAiResponse(text) {
  if (!text) return '';
  let cleaned = text;
  // Strip all emojis
  cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F800}-\u{1F8FF}\u{1FA00}-\u{1FA6F}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}\u{200D}\u{FE0F}]/gu, '');
  // Replace raw mailto markdown links like [email](mailto:email) with plain email address
  cleaned = cleaned.replace(/\[([^\]]+)\]\(mailto:[^)]+\)/gi, '$1');
  // Clean double nested bullet markers like "* **Name**" into cleaner bullet
  cleaned = cleaned.replace(/^[\*\-]\s+\*\*(.+?)\*\*/gm, '- **$1**');
  return cleaned.trim();
}

function buildLocalFallbackAnswer(allJds, candidateMap, allScores, userMessage) {
  const queryLower = (userMessage || '').toLowerCase();
  const candidateList = Object.values(candidateMap);

  // 1. Starting year / Start date OR End year / End date queries
  const isStartQuery = (queryLower.includes('start') || queryLower.includes('beginning') || queryLower.includes('first')) && (queryLower.includes('year') || queryLower.includes('date'));
  const isEndQuery = (queryLower.includes('end') || queryLower.includes('completion') || queryLower.includes('passing') || queryLower.includes('graduat')) && (queryLower.includes('year') || queryLower.includes('date'));

  if (isStartQuery || isEndQuery) {
    const titleHeader = isStartQuery ? 'Starting Years of B.Tech / Education for Each Candidate' : 'End Years / Completion Dates of B.Tech / Education for Each Candidate';
    let output = `${titleHeader}\n----------------------------------------\n\n`;

    candidateList.forEach((c, idx) => {
      const eduText = (c.education && c.education.length > 0) ? c.education.join(' ') : c.raw_text || '';
      const rangeMatch = eduText.match(/(20\d\d)\s*[\-–\s]+\s*(20\d\d|CURRENT|Present|Expected [a-zA-Z]+ 20\d\d)/i);
      
      let dateDisplay = 'Not specified';
      if (rangeMatch) {
        const startYear = rangeMatch[1];
        const endVal = rangeMatch[2];
        if (isStartQuery) {
          dateDisplay = `${startYear} (${startYear} - ${endVal})`;
        } else {
          if (/CURRENT|Present/i.test(endVal)) {
            dateDisplay = `${startYear} - CURRENT (Ongoing)`;
          } else {
            dateDisplay = `${endVal} (Started ${startYear})`;
          }
        }
      } else {
        const yearMatch = eduText.match(/(20\d\d)/);
        if (yearMatch) dateDisplay = yearMatch[1];
      }

      output += `${idx + 1}. **${c.name}**: ${dateDisplay}\n`;
    });

    return output.trim();
  }

  // 2. Contact / Email / Phone queries
  if (queryLower.includes('email') || queryLower.includes('mail') || queryLower.includes('contact') || queryLower.includes('phone') || queryLower.includes('number')) {
    let output = `Candidate Contact Directory\n----------------------------------------\n\n`;
    if (candidateList.length === 0) {
      return 'No candidate contact details available.';
    }
    candidateList.forEach((c, idx) => {
      output += `${idx + 1}. **${c.name}**\n`;
      output += `   - Email: ${c.email || 'Not provided'}\n`;
      output += `   - Phone: ${c.phone || 'Not provided'}\n\n`;
    });
    return output.trim();
  }

  // 3. Specific candidate profile query by name (e.g. Kapil Dev Abburi, Roopa, etc.)
  const matchedCandByName = candidateList.find(c => {
    const nameLower = (c.name || '').toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    return queryWords.some(qw => nameLower.includes(qw));
  });

  if (matchedCandByName) {
    let output = `Candidate Profile: ${matchedCandByName.name}\n----------------------------------------\n\n`;
    output += `- Email: ${matchedCandByName.email}\n`;
    output += `- Phone: ${matchedCandByName.phone}\n`;
    if (matchedCandByName.education && matchedCandByName.education.length > 0) {
      output += `- Education: ${matchedCandByName.education.join('; ')}\n`;
    }
    if (matchedCandByName.all_skills && matchedCandByName.all_skills.length > 0) {
      output += `- Skills: ${matchedCandByName.all_skills.join(', ')}\n`;
    }
    if (matchedCandByName.projects && matchedCandByName.projects.length > 0) {
      output += `- Projects: ${matchedCandByName.projects.join('; ')}\n`;
    }
    if (matchedCandByName.certifications && matchedCandByName.certifications.length > 0) {
      output += `- Certifications: ${matchedCandByName.certifications.join('; ')}\n`;
    }
    output += `- Best Fit Role: ${matchedCandByName.best_fit_jd}\n\n`;
    output += `Evaluated ATS Scores:\n`;
    matchedCandByName.scores_per_jd.forEach(s => {
      const missingStr = s.missing_skills.length > 0 ? s.missing_skills.join(', ') : 'None (Fully Qualified)';
      output += `- **${s.jd_title}**: ${s.score}/100 (Missing: ${missingStr})\n`;
    });
    return output.trim();
  }

  // 4. Keyword / College / Skill / Project search (e.g. "kl university", "ece", "c++", "atm machine")
  const searchKeywords = queryLower.split(/\s+/).filter(w => w.length > 2 && !['what', 'who', 'where', 'which', 'show', 'list', 'find', 'get', 'tell', 'about', 'candidates', 'candidate', 'profile', 'detail', 'details'].includes(w));
  if (searchKeywords.length > 0) {
    const matchedSearch = candidateList.filter(c => {
      const fullSearchText = `${c.name} ${c.email} ${c.phone} ${(c.education||[]).join(' ')} ${(c.all_skills||[]).join(' ')} ${(c.projects||[]).join(' ')} ${(c.certifications||[]).join(' ')} ${c.raw_text||''}`.toLowerCase();
      return searchKeywords.some(kw => fullSearchText.includes(kw));
    });

    if (matchedSearch.length > 0) {
      let output = `Candidate Search Results\n----------------------------------------\n\n`;
      matchedSearch.forEach((c, idx) => {
        output += `${idx + 1}. **${c.name}**\n`;
        output += `   - Education: ${(c.education || []).join('; ') || 'N/A'}\n`;
        output += `   - Skills: ${(c.all_skills || []).slice(0, 6).join(', ') || 'N/A'}\n`;
        output += `   - Best Fit: ${c.best_fit_jd}\n`;
        output += `   - Email: ${c.email} | Phone: ${c.phone}\n\n`;
      });
      return output.trim();
    }
  }

  // 4. Missing / Lacking Skills queries
  if (queryLower.includes('missing') || queryLower.includes('lacking') || queryLower.includes('gap') || queryLower.includes('need') || queryLower.includes('lack')) {
    let output = `Candidate Skill Gap Analysis\n----------------------------------------\n\n`;
    allJds.forEach(j => {
      const jdTitle = j.title || `JD #${j.id}`;
      output += `Position: ${jdTitle}\n----------------------------------------\n`;

      const scoresForJd = allScores.filter(s => s.jd_id === j.id);
      scoresForJd.forEach(s => {
        const cand = candidateMap[s.resume_id];
        if (cand) {
          let missing = [];
          try { missing = typeof s.missing_skills === 'string' ? JSON.parse(s.missing_skills) : (s.missing_skills || []); } catch(e){}
          const missingStr = missing.length > 0 ? missing.join(', ') : 'None (Fully Qualified)';
          output += `- **${cand.name}**: Missing ${missingStr}\n`;
        }
      });
      output += `\n`;
    });
    return output.trim();
  }

  // 5. Best-Fit Rankings per JD (lists ALL candidates)
  let output = `Candidate Evaluation & Best-Fit Rankings\n\n`;

  let relevantJds = allJds;
  if (queryLower.includes('software') || queryLower.includes('developer') || queryLower.includes('frontend') || queryLower.includes('full stack')) {
    const matched = allJds.filter(j => (j.title || '').toLowerCase().includes('developer') || (j.title || '').toLowerCase().includes('frontend') || (j.title || '').toLowerCase().includes('software'));
    if (matched.length > 0) relevantJds = matched;
  } else if (queryLower.includes('hardware') || queryLower.includes('drone') || queryLower.includes('embedded') || queryLower.includes('enginner') || queryLower.includes('engineer')) {
    const matched = allJds.filter(j => (j.title || '').toLowerCase().includes('hardware') || (j.title || '').toLowerCase().includes('drone') || (j.title || '').toLowerCase().includes('embedded'));
    if (matched.length > 0) relevantJds = matched;
  }

  relevantJds.forEach(j => {
    const jdTitle = j.title || `JD #${j.id}`;
    output += `Position: ${jdTitle}\n----------------------------------------\n`;

    const candList = [];
    allScores.forEach(s => {
      if (s.jd_id === j.id) {
        const cand = candidateMap[s.resume_id];
        if (cand) {
          let missing = [];
          try { missing = typeof s.missing_skills === 'string' ? JSON.parse(s.missing_skills) : (s.missing_skills || []); } catch(e){}

          candList.push({
            name: cand.name,
            email: cand.email,
            phone: cand.phone,
            education: cand.education,
            score: Math.round(s.ats_score || 0),
            summary: s.summary,
            bestFit: cand.best_fit_jd,
            missingSkills: missing,
            matchedSkills: Array.isArray(s.matched_skills) ? s.matched_skills : (typeof s.matched_skills === 'string' ? JSON.parse(s.matched_skills || '[]') : [])
          });
        }
      }
    });

    candList.sort((a, b) => b.score - a.score);

    if (candList.length === 0) {
      output += `- No candidate resumes evaluated yet for this role.\n\n`;
    } else {
      candList.forEach((c, idx) => {
        const missingStr = c.missingSkills.length > 0 ? c.missingSkills.join(', ') : 'None (Fully Qualified)';
        const eduStr = (c.education && c.education.length > 0) ? c.education[0] : 'N/A';
        output += `${idx + 1}. **${c.name}**\n`;
        output += `   - ATS Score: ${c.score}/100\n`;
        output += `   - Education: ${eduStr}\n`;
        output += `   - Email: ${c.email || 'Not provided'}\n`;
        output += `   - Phone: ${c.phone || 'Not provided'}\n`;
        output += `   - Missing Skills: ${missingStr}\n\n`;
      });
    }
  });

  return output.trim();
}

/**
 * Handles free-text queries from HR using Groq multi-model fallback, Gemini AI fallback, and local engine fallback.
 * Can answer ANY general query like ChatGPT/OpenAI in addition to HR screening dataset queries.
 * @param {string} chatId 
 * @param {string} userMessage 
 * @returns {Promise<string>}
 */
async function handleQuery(chatId, userMessage) {
  const session = db.getSession(chatId);
  const activeJdId = session ? session.active_jd_id : null;

  const allJds = db.listJds(chatId) || [];
  const allResumes = db.getAllResumesByChat(chatId) || [];
  const allScores = db.getScoresByChat(chatId) || [];

  const candidateMap = {};
  allResumes.forEach(r => {
    let candJson = null;
    if (r.structured_json) {
      try { candJson = JSON.parse(r.structured_json); } catch (e) {}
    }

    candidateMap[r.id] = {
      id: r.id,
      name: r.candidate_name || candJson?.name || 'Unknown Candidate',
      email: r.candidate_email || candJson?.email || 'Not provided',
      phone: r.candidate_phone || candJson?.phone || 'Not provided',
      all_skills: candJson?.skills || [],
      education: candJson?.education || [],
      experience: candJson?.experience || [],
      projects: candJson?.projects || [],
      certifications: candJson?.certifications || [],
      raw_text: r.raw_text || '',
      scores_per_jd: []
    };
  });

  allScores.forEach(s => {
    if (candidateMap[s.resume_id]) {
      const jd = allJds.find(j => j.id === s.jd_id);
      const jdTitle = jd ? (jd.title || `JD #${jd.id}`) : `JD #${s.jd_id}`;

      let missing = [];
      try { missing = typeof s.missing_skills === 'string' ? JSON.parse(s.missing_skills) : (s.missing_skills || []); } catch(e){}

      candidateMap[s.resume_id].scores_per_jd.push({
        jd_id: s.jd_id,
        jd_title: jdTitle,
        score: Math.round(s.ats_score || 0),
        missing_skills: missing
      });
    }
  });

  Object.values(candidateMap).forEach(cand => {
    let bestJd = null;
    let maxScore = -1;
    cand.scores_per_jd.forEach(s => {
      if (s.score > maxScore) {
        maxScore = s.score;
        bestJd = s.jd_title;
      }
    });
    cand.best_fit_jd = bestJd ? `${bestJd} (${Math.round(maxScore)}/100)` : 'N/A';
  });

  // Build comprehensive text block including education, projects, certifications & full profiles
  const jdListText = allJds.length > 0 ? allJds.map(j => `- JD #${j.id}: ${j.title}`).join('\n') : 'None';
  
  const candListText = Object.values(candidateMap).length > 0 ? Object.values(candidateMap).map(c => {
    const scoresStr = c.scores_per_jd.map(s => `${s.jd_title}: ATS Score ${s.score}/100 (Missing: ${s.missing_skills.join(', ') || 'None'})`).join(' | ');
    const eduStr = (c.education && c.education.length > 0) ? c.education.join('; ') : 'Not specified';
    const projStr = (c.projects && c.projects.length > 0) ? c.projects.join('; ') : 'None listed';
    const certStr = (c.certifications && c.certifications.length > 0) ? c.certifications.join('; ') : 'None listed';
    const expStr = (c.experience && c.experience.length > 0) ? c.experience.map(e => `${e.role || 'Role'} at ${e.company || 'Company'}`).join('; ') : 'No prior company experience listed';

    return `• Candidate Full Profile: ${c.name}
  - Email: ${c.email} | Phone: ${c.phone}
  - Education/Degree/College/CGPA: ${eduStr}
  - Technical & Soft Skills: ${c.all_skills.join(', ') || 'General'}
  - Projects: ${projStr}
  - Certifications/Achievements: ${certStr}
  - Work/Internship Experience: ${expStr}
  - Job Match Scores & Skill Gaps: [${scoresStr}]
  - Best Fit Job: ${c.best_fit_jd}`;
  }).join('\n\n') : 'None';

  const contextDataStr = `LOADED JOB DESCRIPTIONS:
${jdListText}

CANDIDATE SCORES, MISSING SKILLS & FULL PROFILES:
${candListText}`;

  // 1. Try Groq Multi-Model Fallback
  try {
    const messages = [
      { role: 'system', content: MASTER_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `DATASET CONTEXT:\n${contextDataStr}\n\nUSER QUERY:\n${userMessage}`
      }
    ];

    const reply = await createGroqCompletion(messages, { temperature: 0.3 });
    if (reply && reply.trim().length > 0) {
      return cleanUpAiResponse(reply);
    }
  } catch (groqErr) {
    console.warn(`Groq All Models Notice (${groqErr.message}). Switching to Gemini AI...`);
  }

  // 2. Try Gemini 2.0 Flash if all Groq models fail
  try {
    const geminiModel = getGeminiModel('gemini-2.0-flash');
    const fullPrompt = `${MASTER_SYSTEM_PROMPT}\n\nDATASET CONTEXT:\n${contextDataStr}\n\nUSER QUERY:\n${userMessage}`;
    const result = await geminiModel.generateContent(fullPrompt);
    const geminiReply = await result.response.text();

    if (geminiReply && geminiReply.trim().length > 0) {
      return cleanUpAiResponse(geminiReply);
    }
  } catch (geminiErr) {
    console.warn(`Gemini Query Notice (${geminiErr.message}). Falling back to local response builder...`);
  }

  // 3. Fallback response builder if both AI services fail
  return buildLocalFallbackAnswer(allJds, candidateMap, allScores, userMessage);
}

module.exports = { handleQuery };
