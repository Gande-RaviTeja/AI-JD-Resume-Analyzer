const db = require('../db/database');
const { generateRankingsReport } = require('../services/ranker');
const { safeReply } = require('../utils/replyHelper');

function registerCommands(bot) {
  // /start command
  bot.command('start', (ctx) => {
    const text = `**Welcome to the HR Candidate Screening Assistant**
----------------------------------------

**Quick Workflow**:
1. /newjd - Paste or upload a Job Description
2. /uploadresumes - Upload candidate resumes (PDF/DOCX)
3. **Ask Questions** - Ask any free-text questions about candidate scores, skills, or contacts!
4. /rank - View ranked ATS match scores

**All Commands**:
- /newjd - Create a new Job Description
- /uploadresumes - Switch to resume upload mode
- /listjds - View all loaded JDs
- /switchjd <n> - Switch active JD by number
- /rank - View candidate rankings
- /reset - Reset session state`;

    return safeReply(ctx, text);
  });

  // /newjd command
  bot.command('newjd', (ctx) => {
    const chatId = ctx.chat.id;
    db.setSessionMode(chatId, 'AWAITING_JD');

    return safeReply(ctx, '**Please paste the Job Description text or upload a JD document (PDF or DOCX).**');
  });

  // /uploadresumes command
  bot.command('uploadresumes', (ctx) => {
    const chatId = ctx.chat.id;
    const session = db.getSession(chatId);

    if (!session || !session.active_jd_id) {
      return safeReply(ctx, '**No active JD set. Please use /newjd to create a JD or /switchjd to select an existing one.**');
    }

    const jd = db.getJdById(session.active_jd_id);
    const jdTitle = jd ? (jd.title || `JD #${jd.id}`) : `JD #${session.active_jd_id}`;

    db.setSessionMode(chatId, 'COLLECTING_RESUMES');

    return safeReply(ctx, `**Resume collection mode active for ${jdTitle}**\n\nSend PDF or DOCX resume files to evaluate candidates.`);
  });

  // /listjds command
  bot.command('listjds', (ctx) => {
    const chatId = ctx.chat.id;
    const jds = db.listJds(chatId);
    const session = db.getSession(chatId);

    if (!jds || jds.length === 0) {
      return safeReply(ctx, '**No Job Descriptions loaded yet. Use /newjd to add your first JD.**');
    }

    let message = '**Loaded Job Descriptions**\n----------------------------------------\n\n';
    let activeIndex = null;

    jds.forEach((jd, idx) => {
      const indexNum = idx + 1;
      const title = jd.title || `JD #${jd.id}`;
      const count = jd.candidate_count || 0;
      const isActive = session.active_jd_id === jd.id;

      if (isActive) activeIndex = indexNum;

      message += `${indexNum}. **${title}** (Candidates: **${count}**)${isActive ? ' [**Active**]' : ''}\n`;
    });

    if (activeIndex) {
      message += `\n**Current Active JD**: #${activeIndex}`;
    } else {
      message += `\nUse /switchjd <n> to select an active JD.`;
    }

    return safeReply(ctx, message);
  });

  // /switchjd command
  bot.command('switchjd', (ctx) => {
    const chatId = ctx.chat.id;
    const args = ctx.message.text.trim().split(/\s+/);
    const targetIdx = parseInt(args[1], 10);

    const jds = db.listJds(chatId);
    if (!jds || jds.length === 0) {
      return safeReply(ctx, '**No Job Descriptions found. Use /newjd to create one.**');
    }

    if (isNaN(targetIdx) || targetIdx < 1 || targetIdx > jds.length) {
      return safeReply(ctx, `**Invalid index. Please specify a number between 1 and ${jds.length}. Example: /switchjd 1**`);
    }

    const selectedJd = jds[targetIdx - 1];
    db.setActiveJd(chatId, selectedJd.id);

    const title = selectedJd.title || `JD #${selectedJd.id}`;
    return safeReply(ctx, `**Active JD switched to #${targetIdx}: ${title}**`);
  });

  // /rank command
  bot.command('rank', (ctx) => {
    const chatId = ctx.chat.id;
    const session = db.getSession(chatId);

    if (!session || !session.active_jd_id) {
      return safeReply(ctx, '**No active JD selected. Use /listjds or /newjd to set an active JD.**');
    }

    const report = generateRankingsReport(session.active_jd_id);
    return safeReply(ctx, report);
  });

  // /reset command
  bot.command('reset', (ctx) => {
    const chatId = ctx.chat.id;
    db.resetSession(chatId);
    return safeReply(ctx, '**Session state reset successfully.**');
  });
}

module.exports = { registerCommands };
