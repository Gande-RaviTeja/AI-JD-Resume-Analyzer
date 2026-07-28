const Groq = require('groq-sdk');
const config = require('../config');

let groqInstance = null;

function getGroqClient() {
  if (!groqInstance) {
    if (!config.groqApiKey) {
      throw new Error("GROQ_API_KEY is not set in environment variables.");
    }
    groqInstance = new Groq({ apiKey: config.groqApiKey });
  }
  return groqInstance;
}

const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768',
  'gemma2-9b-it'
];

/**
 * Creates Groq chat completion with automatic model fallback across 4 Groq models.
 */
async function createGroqCompletion(messages, options = {}) {
  const groq = getGroqClient();
  let lastErr = null;

  for (const model of GROQ_MODELS) {
    try {
      const completion = await groq.chat.completions.create({
        messages,
        model,
        temperature: options.temperature !== undefined ? options.temperature : 0.2,
        ...(options.response_format ? { response_format: options.response_format } : {})
      });

      const content = completion.choices[0]?.message?.content;
      if (content && content.trim().length > 0) {
        return content;
      }
    } catch (err) {
      lastErr = err;
      console.warn(`Groq Model (${model}) Notice: ${err.message}. Trying next Groq model...`);
    }
  }

  throw lastErr || new Error('All Groq models failed.');
}

module.exports = { getGroqClient, createGroqCompletion };
