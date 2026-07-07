const config = require("../config/config");

async function logToChannel(client, text) {
  try {
    const channel = await client.channels.fetch(config.channels.botLogs);
    if (!channel) return console.log("Канал логов не найден");

    await channel.send(text);
  } catch (error) {
    console.error("Ошибка отправки лога:", error.message);
  }
}

module.exports = {
  logToChannel,
};