const { getGeminiModel } = require('./geminiClient');
const { createGroqCompletion } = require('./groqClient');

function fallbackAnalyzeJd(jdText) {
  const lines = jdText.split('\n').map(l => l.trim()).filter(Boolean);
  let title = lines[0] || 'Job Description';
  if (title.length > 60) {
    title = title.substring(0, 57) + '...';
  }
  title = title.replace(/^(jd|job description|title|role)[:\s]*/i, '').trim();

  const commonSkills = [
    'React.js', 'React', 'Next.js', 'JavaScript', 'Node.js', 'Express.js', 'MongoDB',
    'REST APIs', 'Git', 'HTML', 'CSS', 'Python', 'Java', 'C++', 'SQL', 'AWS', 'Docker',
    'PCB Design', 'Embedded Systems', 'Arduino', 'STM32', 'ESP32', 'Oscilloscope',
    'Multimeter', 'UART', 'SPI', 'I2C', 'Drones', 'UAV', 'Analog Electronics'
  ];

  const lowerText = jdText.toLowerCase();
  const matchedSkills = [];
  commonSkills.forEach(s => {
    if (lowerText.includes(s.toLowerCase())) {
      matchedSkills.push(s);
    }
  });

  return {
    title: title || 'Job Description',
    required_skills: matchedSkills.length > 0 ? matchedSkills : ['Relevant Qualifications'],
    nice_to_have_skills: [],
    min_experience_years: 0,
    education: '',
    key_responsibilities: []
  };
}

/**
 * Parses raw JD text into structured JSON using Gemini with automatic Groq & local fallback.
 * @param {string} jdText 
 * @returns {Promise<object>}
 */
async function analyzeJd(jdText) {
  const prompt = `Extract structured hiring requirements from this job description. Return strict JSON only, no commentary, with this shape:
{
  "title": string,
  "required_skills": string[],
  "nice_to_have_skills": string[],
  "min_experience_years": number,
  "education": string,
  "key_responsibilities": string[]
}
Job description:
${jdText}`;

  // Try Gemini first
  try {
    const model = getGeminiModel('gemini-2.0-flash');
    const result = await model.generateContent(prompt);
    const responseText = await result.response.text();

    const cleanedJsonStr = responseText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    return JSON.parse(cleanedJsonStr);
  } catch (geminiErr) {
    console.warn(`Gemini JD analysis notice (${geminiErr.message}). Trying Groq multi-model fallback...`);
  }

  // Fallback to Groq Multi-Model
  try {
    const groqText = await createGroqCompletion(
      [{ role: 'user', content: prompt }],
      { temperature: 0.2, response_format: { type: 'json_object' } }
    );
    return JSON.parse(groqText);
  } catch (groqErr) {
    console.warn('Groq JD Analysis Notice, using robust local parser fallback:', groqErr.message);
    return fallbackAnalyzeJd(jdText);
  }
}

module.exports = { analyzeJd, fallbackAnalyzeJd };
