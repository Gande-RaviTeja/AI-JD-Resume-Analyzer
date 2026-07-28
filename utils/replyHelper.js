/**
 * Helper to strip all emojis from text.
 * @param {string} str 
 * @returns {string}
 */
function removeEmojis(str) {
  if (!str) return '';
  return str
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F800}-\u{1F8FF}\u{1FA00}-\u{1FA6F}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}\u{200D}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Converts standard Markdown syntax (**bold**, *italic*, `code`, mailto links) 
 * into clean, valid Telegram HTML tags (<b>, <i>, <code>, <a>).
 * Safely escapes raw HTML characters (&, <, >) to prevent parse errors.
 * 
 * @param {string} text 
 * @returns {string}
 */
function markdownToTelegramHtml(text) {
  if (!text) return '';

  let html = text;

  // 1. Strip all emojis
  html = html.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F800}-\u{1F8FF}\u{1FA00}-\u{1FA6F}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}\u{200D}\u{FE0F}]/gu, '');

  // 2. Convert mailto links [email](mailto:email) -> raw email address
  html = html.replace(/\[([^\]]+)\]\(mailto:[^)]+\)/gi, '$1');

  // 3. Temporarily extract HTTP links [Text](URL)
  const httpLinks = [];
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gi, (_, linkText, url) => {
    httpLinks.push({ text: linkText, url });
    return `%%%HTTP_LINK_${httpLinks.length - 1}%%%`;
  });

  // 4. Temporarily extract code blocks ```code``` and inline `code`
  const codeBlocks = [];
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(code);
    return `%%%CODE_BLOCK_${codeBlocks.length - 1}%%%`;
  });

  const inlineCodes = [];
  html = html.replace(/`([^`]+)`/g, (_, code) => {
    inlineCodes.push(code);
    return `%%%INLINE_CODE_${inlineCodes.length - 1}%%%`;
  });

  // 5. Escape raw HTML entities in remaining text
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 6. Convert **bold** or __bold__ to <b>bold</b>
  html = html.replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>');
  html = html.replace(/__([\s\S]+?)__/g, '<b>$1</b>');

  // 7. Convert single *italic* or _italic_ to <i>italic</i>
  html = html.replace(/(^|\s)\*([^*]+)\*(\s|$)/g, '$1<i>$2</i>$3');
  html = html.replace(/(^|\s)_([^_]+)_(\s|$)/g, '$1<i>$2</i>$3');

  // 8. Clean up raw list bullets like "* <b>Text</b>" -> "• <b>Text</b>"
  html = html.replace(/^\s*[\*\-]\s+/gm, '• ');

  // 9. Restore HTTP links
  httpLinks.forEach((link, idx) => {
    const safeText = link.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(`%%%HTTP_LINK_${idx}%%%`, `<a href="${link.url}">${safeText}</a>`);
  });

  // 10. Restore code blocks and inline codes
  inlineCodes.forEach((code, idx) => {
    const safeCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(`%%%INLINE_CODE_${idx}%%%`, `<code>${safeCode}</code>`);
  });

  codeBlocks.forEach((code, idx) => {
    const safeCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(`%%%CODE_BLOCK_${idx}%%%`, `<pre><code>${safeCode}</code></pre>`);
  });

  return html;
}

/**
 * Safely sends a formatted message to Telegram using HTML mode with automatic fallback.
 * 
 * @param {object} ctx - Telegraf context
 * @param {string} text - Text to send
 */
async function safeReply(ctx, text) {
  if (!text) return;

  // Clean raw mailto link syntax and strip emojis first
  let cleanText = text
    .replace(/\[([^\]]+)\]\(mailto:[^)]+\)/gi, '$1')
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F800}-\u{1F8FF}\u{1FA00}-\u{1FA6F}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}\u{200D}\u{FE0F}]/gu, '');

  try {
    const htmlText = markdownToTelegramHtml(cleanText);
    return await ctx.replyWithHTML(htmlText);
  } catch (err) {
    console.warn('Telegram HTML parse warning:', err.description || err.message);
    // Send clean plain text directly if HTML parsing fails
    const plainText = cleanText
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      .replace(/^[*\-]\s+/gm, '• ');
    return await ctx.reply(plainText);
  }
}

module.exports = { safeReply, markdownToTelegramHtml, removeEmojis };
