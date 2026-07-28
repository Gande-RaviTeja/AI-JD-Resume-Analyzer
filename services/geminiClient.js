const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config');

let genAIInstance = null;

function getGeminiModel(modelName = 'gemini-2.0-flash') {
  if (!genAIInstance) {
    if (!config.geminiApiKey) {
      throw new Error("GEMINI_API_KEY is not set in environment variables.");
    }
    genAIInstance = new GoogleGenerativeAI(config.geminiApiKey);
  }
  return genAIInstance.getGenerativeModel({ model: modelName });
}

module.exports = { getGeminiModel };
