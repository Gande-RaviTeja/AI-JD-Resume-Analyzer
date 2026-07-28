const db = require('../db/database');

/**
 * Formats ranked candidate list for an active JD.
 * @param {number} jdId 
 * @returns {string}
 */
function generateRankingsReport(jdId) {
  const jd = db.getJdById(jdId);
  if (!jd) {
    return 'No active Job Description found.';
  }

  const candidates = db.getRankedCandidates(jdId);
  const jdTitle = jd.title || `JD #${jd.id}`;

  if (!candidates || candidates.length === 0) {
    return `No candidates uploaded yet for ${jdTitle}.\n\nUse /uploadresumes to start adding candidate resumes.`;
  }

  let output = `Candidate Rankings for ${jdTitle}\n----------------------------------------\n\n`;

  candidates.forEach((cand, index) => {
    const rank = index + 1;
    const name = cand.candidate_name || 'Unknown Candidate';
    const score = Math.round(cand.ats_score || 0);

    let missingReqs = [];
    if (cand.missing_skills) {
      try {
        const arr = typeof cand.missing_skills === 'string' ? JSON.parse(cand.missing_skills) : cand.missing_skills;
        if (Array.isArray(arr)) missingReqs = missingReqs.concat(arr);
      } catch (e) {}
    }
    if (missingReqs.length < 2 && cand.missing_nice_to_have) {
      try {
        const arr = typeof cand.missing_nice_to_have === 'string' ? JSON.parse(cand.missing_nice_to_have) : cand.missing_nice_to_have;
        if (Array.isArray(arr)) missingReqs = missingReqs.concat(arr);
      } catch (e) {}
    }

    const missingStr = missingReqs.length > 0 ? missingReqs.join(', ') : 'None (Fully Qualified)';

    output += `${rank}. **${name}**\n`;
    output += `   - ATS Score: ${score}/100\n`;
    if (cand.candidate_email) output += `   - Email: ${cand.candidate_email}\n`;
    if (cand.candidate_phone) output += `   - Phone: ${cand.candidate_phone}\n`;
    output += `   - Missing Skills: ${missingStr}\n\n`;
  });

  return output.trim();
}

module.exports = { generateRankingsReport };
