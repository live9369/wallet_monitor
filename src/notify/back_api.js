const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');
dotenv.config();

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, {polling: true});


bot.onText(/\/echo (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const resp = match[1]; // the captured "whatever"
  console.log(msg);
  bot.sendMessage(chatId, resp);
});

bot.onText(/\/chatid/, (msg) => {
  const chatId = msg.chat.id;
  let message_thread_id = null;
  if (msg.message_thread_id) {
    message_thread_id = msg.message_thread_id;
  }

  if (message_thread_id) {
    bot.sendMessage(chatId, `chatId: ${chatId}\nmessage_thread_id: ${message_thread_id}`, {
      reply_to_message_id: message_thread_id
    });
  } else {
    bot.sendMessage(chatId, `chatId: ${chatId}`);
  }
});

console.log('🚀 Twitter 监控机器人已启动！');