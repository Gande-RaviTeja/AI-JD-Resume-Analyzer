const axios = require('axios');
const db = require('../db/database');
const { parseFileBuffer } = require('../services/fileParser');
const { analyzeJd } = require('../services/jdAnalyzer');
const { analyzeResume } = require('../services/resumeAnalyzer');
const { computeAtsScore } = require('../services/scorer');
const { handleQuery } = require('../services/queryRouter');
const { safeReply } = require('../utils/replyHelper');

/**
 * Downloads document file buffer from Telegram.
 */
async function downloadTelegramFile(ctx, fileId) {
  const fileLink = await ctx.telegram.getFileLink(fileId);
  const url = typeof fileLink === 'string' ? fileLink : fileLink.href || fileLink.toString();
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(response.data);
}

/**
 * Helper to detect if a document is likely a Job Description.
 */
function isJdDocument(fileName, text, sessionMode) {
  if (sessionMode === 'AWAITING_JD') return true;
  const fn = (fileName || '').toLowerCase();
  if (fn.includes('job description') || fn.includes('job_description') || fn.includes('jd')) {
    return true;
  }
  return false;
}

/**
 * Helper to detect if a text message is an HR question rather than a pasted resume.
 */
function isHrQuery(text) {
  const trimmed = text.trim();
  if (trimmed.length < 150) return true;
  if (/\?$/.test(trimmed)) return true;
  const queryPattern = /^(what|who|where|how|which|show|list|find|get|can|is|are|tell|give|i want|email|phone|contact|experience|rank)\b/i;
  if (queryPattern.test(trimmed)) return true;

  return false;
}

function registerMessageHandlers(bot) {
  // Handle documents (PDF / DOCX / TXT resumes or JDs)
  bot.on('document', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = db.getSession(chatId);
    const doc = ctx.message.document;

    try {
      await safeReply(ctx, '**Processing uploaded document...**');

      const fileBuffer = await downloadTelegramFile(ctx, doc.file_id);
      const rawText = await parseFileBuffer(fileBuffer, doc.file_name || '');

      if (!rawText || rawText.trim().length === 0) {
        return safeReply(ctx, '**Could not extract text from the document. Please ensure it is a valid PDF, DOCX, or TXT file.**');
      }

      if (isJdDocument(doc.file_name, rawText, session.mode)) {
        return await processJdUpload(ctx, chatId, rawText);
      } else {
        // Resume upload
        let activeJdId = session.active_jd_id;
        if (!activeJdId) {
          const allJds = db.listJds(chatId);
          if (allJds && allJds.length > 0) {
            activeJdId = allJds[allJds.length - 1].id;
            db.setActiveJd(chatId, activeJdId);
          } else {
            return safeReply(ctx, '**No active Job Description found. Please create a JD first with /newjd.**');
          }
        }
        return await processResumeUpload(ctx, chatId, activeJdId, doc.file_name, rawText);
      }
    } catch (err) {
      console.error('Error processing document message:', err);
      return safeReply(ctx, '**An error occurred while processing the document. Please try again.**');
    }
  });

  // Handle text messages
  bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;

    const chatId = ctx.chat.id;
    const session = db.getSession(chatId);

    try {
      if (session.mode === 'AWAITING_JD') {
        await safeReply(ctx, '**Analyzing Job Description...**');
        return await processJdUpload(ctx, chatId, text);
      }

      if (session.mode === 'COLLECTING_RESUMES') {
        if (!isHrQuery(text)) {
          if (!session.active_jd_id) {
            return safeReply(ctx, '**No active JD set. Please create a JD first with /newjd.**');
          }
          await safeReply(ctx, '**Analyzing pasted resume text...**');
          return await processResumeUpload(ctx, chatId, session.active_jd_id, 'Pasted Resume Text', text);
        }
      }

      // Free-text HR query
      await safeReply(ctx, '**Thinking...**');
      const answer = await handleQuery(chatId, text);
      return await safeReply(ctx, answer);

    } catch (err) {
      console.error('Error processing text message:', err);
      return safeReply(ctx, '**An error occurred while processing your request.**');
    }
  });
}

/**
 * Helper to process JD text and save to DB
 */
async function processJdUpload(ctx, chatId, rawText) {
  const structuredJd = await analyzeJd(rawText);
  const jdId = db.createJd(chatId, structuredJd.title || 'Untitled JD', rawText, structuredJd);

  db.updateSession(chatId, { activeJdId: jdId });

  // Score any existing resumes against this new JD
  const existingResumes = db.getAllResumesByChat(chatId);
  for (const resume of existingResumes) {
    let candJson = {};
    if (resume.structured_json) {
      try { candJson = JSON.parse(resume.structured_json); } catch (e) {}
    }
    try {
      const scoreObj = await computeAtsScore(structuredJd, candJson);
      db.saveScore(resume.id, jdId, scoreObj);
    } catch (e) {
      console.error('Error scoring existing resume against new JD:', e);
    }
  }

  const title = structuredJd.title || `JD #${jdId}`;
  const reqSkills = (structuredJd.required_skills || []).join(', ') || 'None specified';
  const minExp = structuredJd.min_experience_years !== undefined ? structuredJd.min_experience_years : 'N/A';

  const reply = `**Job Description Saved Successfully**
----------------------------------------
- Title: **${title}**
- Required Skills: ${reqSkills}
- Minimum Experience: **${minExp}** years

Use /uploadresumes to upload candidate resumes, or /newjd to add another position.`;

  return safeReply(ctx, reply);
}

/**
 * Helper to process Candidate Resume and compute score against all active JDs
 */
async function processResumeUpload(ctx, chatId, jdId, fileName, rawText) {
  const jd = db.getJdById(jdId);
  if (!jd) {
    return safeReply(ctx, '**Active Job Description not found in database.**');
  }

  const candidateJson = await analyzeResume(rawText, fileName);

  const resumeId = db.createResume(
    chatId,
    jdId,
    fileName,
    candidateJson.name || 'Unknown Candidate',
    candidateJson.email || null,
    candidateJson.phone || null,
    rawText,
    candidateJson
  );

  const allJds = db.listJds(chatId);
  let bestFitTitle = 'N/A';
  let highestScore = -1;
  let bestSummary = 'Resume analyzed.';

  for (const itemJd of allJds) {
    let itemJdJson = {};
    if (itemJd.structured_json) {
      try { itemJdJson = JSON.parse(itemJd.structured_json); } catch (e) {}
    }
    try {
      const scoreObj = await computeAtsScore(itemJdJson, candidateJson);
      db.saveScore(resumeId, itemJd.id, scoreObj);

      const scoreVal = Math.round(scoreObj.ats_score || 0);
      const title = itemJd.title || `JD #${itemJd.id}`;

      if (scoreVal > highestScore) {
        highestScore = scoreVal;
        bestFitTitle = title;
        bestSummary = scoreObj.summary || `Evaluated for ${title}.`;
      }
    } catch (e) {
      console.error(`Error scoring resume ${resumeId} against JD ${itemJd.id}:`, e);
    }
  }

  const candName = candidateJson.name || 'Unknown Candidate';

  const reply = `**Resume Evaluation Complete**
----------------------------------------
- Candidate: **${candName}**
- Best Fit Role: **${bestFitTitle}**
- ATS Score: ${highestScore}/100
- Email: ${candidateJson.email || 'Not provided'}
- Phone: ${candidateJson.phone || 'Not provided'}
- Summary: ${bestSummary}`;

  return safeReply(ctx, reply);
}

module.exports = { registerMessageHandlers, isHrQuery };
