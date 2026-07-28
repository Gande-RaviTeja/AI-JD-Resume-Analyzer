/**
 * Fast, robust ATS Scorer & Gap Analyzer.
 * Computes deterministic skill & experience match without API rate-limit bottlenecks.
 */

function normalize(str) {
  if (!str) return '';
  return String(str).toLowerCase().replace(/[^a-z0-9\s#+.]/g, ' ').trim();
}

function tokenize(str) {
  return normalize(str).split(/\s+/).filter(Boolean);
}

function skillMatches(reqSkill, candSkills, candText) {
  const normReq = normalize(reqSkill);
  if (!normReq) return false;

  // Check direct skill list
  for (const cs of candSkills) {
    const normCs = normalize(cs);
    if (normCs === normReq || normCs.includes(normReq) || normReq.includes(normCs)) {
      return true;
    }
  }

  // Check in overall candidate text
  const normText = normalize(candText);
  if (normText.includes(normReq)) {
    return true;
  }

  return false;
}

async function computeAtsScore(jdJson, candidateJson) {
  try {
    const jd = typeof jdJson === 'string' ? JSON.parse(jdJson) : (jdJson || {});
    const cand = typeof candidateJson === 'string' ? JSON.parse(candidateJson) : (candidateJson || {});

    const reqSkills = Array.isArray(jd.required_skills) ? jd.required_skills : [];
    const niceSkills = Array.isArray(jd.nice_to_have_skills) ? jd.nice_to_have_skills : [];
    const candSkills = Array.isArray(cand.skills) ? cand.skills : [];
    
    const candExpText = (cand.experience || []).map(e => `${e.role || ''} ${e.company || ''}`).join(' ');
    const candProjText = Array.isArray(cand.projects) ? cand.projects.join(' ') : '';
    const candCertText = Array.isArray(cand.certifications) ? cand.certifications.join(' ') : '';
    const candText = `${cand.name || ''} ${candSkills.join(' ')} ${candExpText} ${JSON.stringify(cand.education || '')} ${candProjText} ${candCertText}`;

    const matchedRequired = [];
    const missingRequired = [];

    for (const rSkill of reqSkills) {
      if (skillMatches(rSkill, candSkills, candText)) {
        matchedRequired.push(rSkill);
      } else {
        missingRequired.push(rSkill);
      }
    }

    const matchedNice = [];
    const missingNice = [];

    for (const nSkill of niceSkills) {
      if (skillMatches(nSkill, candSkills, candText)) {
        matchedNice.push(nSkill);
      } else {
        missingNice.push(nSkill);
      }
    }

    const minExp = Number(jd.min_experience_years) || 0;
    const candExp = Number(cand.total_experience_years) || 0;
    const expGap = Math.max(0, minExp - candExp);

    // Scoring Math (Max 100)
    // 1. Skill match score (up to 70 pts)
    let skillScore = 70;
    if (reqSkills.length > 0) {
      skillScore = (matchedRequired.length / reqSkills.length) * 70;
    }

    // 2. Experience score (up to 20 pts)
    let expScore = 20;
    if (minExp > 0) {
      if (candExp >= minExp) {
        expScore = 20;
      } else {
        expScore = Math.max(0, 20 - (expGap * 5));
      }
    }

    // 3. Nice to have skills bonus (up to 10 pts)
    let niceBonus = 0;
    if (niceSkills.length > 0) {
      niceBonus = (matchedNice.length / niceSkills.length) * 10;
    } else {
      niceBonus = 5;
    }

    let totalScore = Math.round(skillScore + expScore + niceBonus);
    
    // Penalize heavily if 0 required skills matched on a specific JD with required skills
    if (reqSkills.length > 2 && matchedRequired.length === 0) {
      totalScore = Math.min(totalScore, 15);
    }

    totalScore = Math.min(100, Math.max(5, totalScore));

    const jdTitle = jd.title || 'Job Description';
    let summary = '';
    if (totalScore >= 75) {
      summary = `Strong match for ${jdTitle}. Matched key skills: ${matchedRequired.slice(0, 3).join(', ') || 'General qualifications'}.`;
    } else if (totalScore >= 45) {
      summary = `Moderate match for ${jdTitle}. Missing key skills: ${missingRequired.slice(0, 2).join(', ') || 'Experience'}.`;
    } else {
      summary = `Low match for ${jdTitle}. Missing core requirements: ${missingRequired.slice(0, 2).join(', ') || 'Required skills'}.`;
    }

    return {
      ats_score: totalScore,
      matched_required_skills: matchedRequired,
      missing_required_skills: missingRequired,
      missing_nice_to_have_skills: missingNice,
      experience_gap_years: expGap,
      summary
    };
  } catch (err) {
    console.error('Error in computeAtsScore:', err);
    return {
      ats_score: 10,
      matched_required_skills: [],
      missing_required_skills: [],
      missing_nice_to_have_skills: [],
      experience_gap_years: 0,
      summary: 'Evaluation completed with fallback values.'
    };
  }
}

module.exports = { computeAtsScore };
