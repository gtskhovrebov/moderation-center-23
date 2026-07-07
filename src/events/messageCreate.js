const { handleProofMessage } = require("../services/proofService");
const config = require("../config/config");
const { logToChannel } = require("../utils/logger");
const { parseQuarkMessage } = require("../services/quarkParser");
const { savePunishment } = require("../services/punishmentService");
const { handlePunishmentSearchCommand } = require("../services/searchPunishmentService");
const { handleEventMessage } = require("../services/eventService");

module.exports = async function messageCreate(client, message) {

  // 📎 Канал доказательств
  if (message.channel.id === config.channels.proof) {
    await handleProofMessage(client, message);
    return;
  }
 
  // поиск наказаний
  if (message.content.startsWith("!find")) {
  await handlePunishmentSearchCommand(message);
  return;
}

  // 🧩 Канал Quark
  if (message.channel.id !== config.channels.quark) return;

  await logToChannel(
    client,
    `🧪 Сообщение в Quark-аудите поймано.\nАвтор: ${message.author.tag}\nБот: ${message.author.bot}\nEmbeds: ${message.embeds.length}`
  );

  if (!message.author.bot) return;

  const parsed = parseQuarkMessage(message);

  if (!parsed) {
    await logToChannel(
      client,
      `⚠️ Сообщение Quark не распознано как наказание.\nСсылка: ${message.url}`
    );
    return;
  }

  await logToChannel(
    client,
    [
      `🧩 Quark распознан:`,
      `Тип: ${parsed.punishment_type}`,
      `Модератор raw: ${parsed.moderator_raw || "нет"}`,
      `Модератор ID: ${parsed.moderator_discord_id || "не найден"}`,
      `Модератор name: ${parsed.moderator_name || "не найден"}`,
      `Пользователь: ${parsed.target_raw}`,
      `Причина: ${parsed.reason}`,
    ].join("\n")
  );

  await savePunishment(client, parsed);
};