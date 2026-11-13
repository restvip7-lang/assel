// Open once after deploy: points the Telegram bot at this site's webhook and sets the command menu.
import { tg, webhookSecret } from '../lib/tg.js';

export default async function handler(req, res) {
  try {
    const url = `https://${req.headers["x-forwarded-host"] || req.headers.host}/api/telegram/`;
    await tg('setWebhook', { url, secret_token: webhookSecret(), allowed_updates: ['message', 'callback_query'] });
    await tg('setMyCommands', { commands: [
      { command: 'list', description: 'Все объекты' },
      { command: 'price', description: 'Новая цена: /price 12 145000' },
      { command: 'sold', description: 'Продано: /sold 12' },
      { command: 'balance', description: 'Остаток на счёте Claude: /balance или /balance 20' },
      { command: 'cancel', description: 'Удалить черновик' },
      { command: 'help', description: 'Как пользоваться' },
    ] });
    const me = await tg('getMe');
    res.status(200).send(`Бот @${me.username} подключён к ${url}. Напишите ему /start.`);
  } catch (e) {
    res.status(500).send('Ошибка: ' + e.message);
  }
}
