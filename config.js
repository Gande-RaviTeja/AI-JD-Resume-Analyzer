require('dotenv').config();

const config = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  groqApiKey: process.env.GROQ_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  dbFilePath: process.env.DB_FILE_PATH || './bot_data.db'
};

function validateConfig() {
  const missing = [];
  if (!config.telegramBotToken) missing.push('TELEGRAM_BOT_TOKEN');
  if (!config.groqApiKey) missing.push('GROQ_API_KEY');
  if (!config.geminiApiKey) missing.push('GEMINI_API_KEY');

  if (missing.length > 0) {
    console.warn(`WARNING: Missing environment variables in .env: ${missing.join(', ')}`);
  }
}

validateConfig();

module.exports = config;
