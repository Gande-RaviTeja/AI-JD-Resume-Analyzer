const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * Extracts raw text from buffer based on file extension or mime type.
 * @param {Buffer} buffer 
 * @param {string} fileNameOrMime 
 * @returns {Promise<string>}
 */
async function parseFileBuffer(buffer, fileNameOrMime = '') {
  const lowerStr = fileNameOrMime.toLowerCase();

  if (lowerStr.endsWith('.pdf') || lowerStr.includes('application/pdf')) {
    const pdfData = await pdfParse(buffer);
    return pdfData.text || '';
  }

  if (
    lowerStr.endsWith('.docx') ||
    lowerStr.endsWith('.doc') ||
    lowerStr.includes('wordprocessingml') ||
    lowerStr.includes('msword')
  ) {
    const docxResult = await mammoth.extractRawText({ buffer });
    return docxResult.value || '';
  }

  // Fallback to text parsing
  return buffer.toString('utf8');
}

module.exports = { parseFileBuffer };
