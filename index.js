const { Telegraf } = require('telegraf');
const config = require('./config');
const { registerCommands } = require('./handlers/commands');
const { registerMessageHandlers } = require('./handlers/messages');

if (!config.telegramBotToken) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN is not defined in .env file.');
  process.exit(1);
}

const bot = new Telegraf(config.telegramBotToken);

// Register handlers
registerCommands(bot);
registerMessageHandlers(bot);

// Catch errors to prevent bot crash
bot.catch((err, ctx) => {
  console.error(`Telegraf error for ${ctx.updateType}:`, err);
  ctx.replyWithMarkdown('**An unexpected error occurred while processing your request.**').catch(() => {});
});

// HTTP Health Check server for Render Web Service deployment
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Telegram HR Bot is live and running!\n');
}).listen(PORT, () => {
  console.log(`Health check server listening on port ${PORT}`);
});

// Launch bot
bot.launch().then(() => {
  console.log('Telegram HR Resume Screening Bot started successfully.');
}).catch((err) => {
  console.error('Failed to launch Telegram bot:', err);
});

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
