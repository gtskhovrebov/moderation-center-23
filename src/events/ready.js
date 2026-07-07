const { logToChannel } = require("../utils/logger");

module.exports = async function ready(client) {
  console.log(`✅ Бот запущен как ${client.user.tag}`);

  await logToChannel(
    client,
    `🟢 **Moderation Center запущен**\nБот: ${client.user.tag}`
  );
};