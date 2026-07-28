const { getGeminiModel } = require('./geminiClient');
const { createGroqCompletion } = require('./groqClient');

function extractNameFromFilename(fileName) {
  if (!fileName) return null;
  let base = fileName.replace(/\.[a-zA-Z0-9]+$/, '').trim();
  // Strip initial numeric IDs like "2310040080_"
  base = base.replace(/^\d+[\s_-]*/, '');
  // Strip common generic words
  base = base.replace(/[\s_-]*(resume|cv|profile|my|bio|document|file)[\s_-]*/gi, ' ').trim();
  base = base.replace(/[^a-zA-Z\s.]/g, ' ').replace(/\s+/g, ' ').trim();

  if (base.length >= 3 && !/^(summary|profile|objective|resume|cv|document|file)$/i.test(base)) {
    return base.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }
  return null;
}

function extractNameFromText(resumeText) {
  if (!resumeText) return null;
  const lines = resumeText.split('\n').map(l => l.trim()).filter(Boolean);

  const blacklistedWords = [
    'summary', 'profile', 'objective', 'resume', 'curriculum', 'cv', 'contact',
    'education', 'experience', 'skills', 'projects', 'email', 'phone', 'address',
    'linkedin', 'github', 'hyderabad', 'bangalore', 'mumbai', 'delhi', 'chennai',
    'road', 'nagar', 'street', 'india', 'telangana', 'andhra', 'developer', 'engineer'
  ];

  for (let i = 0; i < Math.min(12, lines.length); i++) {
    const line = lines[i];
    if (/\d|:|@|http|www|\.com/i.test(line)) continue;
    if (line.length < 3 || line.length > 35) continue;

    const lower = line.toLowerCase();
    if (blacklistedWords.some(w => lower.includes(w))) continue;

    if (/^[a-zA-Z\s.]+$/.test(line)) {
      return line.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }
  }

  return null;
}

function isInvalidName(name) {
  if (!name || name.trim().length < 3) return true;
  const lower = name.toLowerCase().trim();
  const badNames = ['summary', 'profile', 'objective', 'resume', 'curriculum vitae', 'cv', 'contact', 'linkedin', 'github', 'unknown candidate', 'unknown'];
  if (badNames.includes(lower)) return true;
  if (/nagar|street|road|address|hyderabad|bangalore|delhi|mumbai|telangana/i.test(lower)) return true;
  return false;
}

function resolveCandidateName(parsedName, fileName, resumeText) {
  if (!isInvalidName(parsedName)) {
    return parsedName.trim();
  }

  const nameFromFn = extractNameFromFilename(fileName);
  if (nameFromFn) return nameFromFn;

  const nameFromTxt = extractNameFromText(resumeText);
  if (nameFromTxt) return nameFromTxt;

  return fileName ? fileName.replace(/\.[a-zA-Z0-9]+$/, '') : 'Candidate';
}

function fallbackAnalyzeResume(resumeText, fileName = '') {
  const name = resolveCandidateName(null, fileName, resumeText);

  const emailMatch = resumeText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0] : null;

  const phoneMatch = resumeText.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  const phone = phoneMatch ? phoneMatch[0] : null;

  const skillKeywords = [
    'React.js', 'React', 'Next.js', 'JavaScript', 'Node.js', 'Express.js', 'MongoDB',
    'REST APIs', 'Git', 'HTML', 'CSS', 'Python', 'Java', 'C++', 'SQL', 'AWS', 'Docker',
    'PCB Design', 'Embedded Systems', 'Arduino', 'STM32', 'ESP32', 'Oscilloscope',
    'Multimeter', 'UART', 'SPI', 'I2C', 'Drones', 'UAV', 'Analog Electronics',
    'Altium', 'KiCad', 'EasyEDA', 'Circuit Debugging', 'C', 'Microcontrollers'
  ];

  const lowerText = resumeText.toLowerCase();
  const foundSkills = [];
  skillKeywords.forEach(sk => {
    if (lowerText.includes(sk.toLowerCase())) {
      foundSkills.push(sk);
    }
  });

  let expYears = 0;
  const expMatch = lowerText.match(/(\d+)\+?\s*(years|yrs)\s*(of)?\s*experience/);
  if (expMatch) {
    expYears = parseInt(expMatch[1], 10);
  }

  return {
    name: name,
    email: email,
    phone: phone,
    total_experience_years: expYears,
    skills: foundSkills,
    education: [],
    experience: []
  };
}

/**
 * Parses raw resume text into structured candidate JSON using Gemini with automatic Groq & local fallback.
 * @param {string} resumeText 
 * @param {string} fileName 
 * @returns {Promise<object>}
 */
async function analyzeResume(resumeText, fileName = '') {
  const prompt = `Extract structured candidate data from this resume text. Return strict JSON only, no commentary, with this shape:
{
  "name": string,
  "email": string,
  "phone": string,
  "total_experience_years": number,
  "skills": string[],
  "education": string[],
  "experience": [{ "company": string, "role": string, "years": number }],
  "projects": string[],
  "certifications": string[]
}
If a field cannot be found, use null or an empty array. Do not fabricate data. Include degrees, college names, CGPA, and specific project names accurately.
Resume text:
${resumeText}`;

  let candidateData = null;

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

    candidateData = JSON.parse(cleanedJsonStr);
  } catch (geminiErr) {
    console.warn(`Gemini Resume analysis notice (${geminiErr.message}). Trying Groq multi-model fallback...`);
  }

  // Fallback to Groq Multi-Model
  if (!candidateData) {
    try {
      const groqText = await createGroqCompletion(
        [{ role: 'user', content: prompt }],
        { temperature: 0.2, response_format: { type: 'json_object' } }
      );
      candidateData = JSON.parse(groqText);
    } catch (groqErr) {
      console.warn('Groq Resume Analysis Notice, using local parser fallback:', groqErr.message);
      candidateData = fallbackAnalyzeResume(resumeText, fileName);
    }
  }

  // Ensure candidate name is clean and valid
  candidateData.name = resolveCandidateName(candidateData.name, fileName, resumeText);

  return candidateData;
}

module.exports = { analyzeResume, fallbackAnalyzeResume, resolveCandidateName };
