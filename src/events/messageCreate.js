const { handleProofMessage } = require("../services/proofService");
const config = require("../config/config");
const { logToChannel } = require("../utils/logger");
const { parseQuarkMessage } = require("../services/quarkParser");
const { savePunishment } = require("../services/punishmentService");
const { handlePunishmentSearchCommand } = require("../services/searchPunishmentService");
const { handleEventMessage } = require("../services/eventService");

module.exports = async function messageCreate(client, message) {
  try {
    if (message.channel.id === config.channels.proof) {
      await handleProofMessage(client, message);
      return;
    }

    if (message.content?.startsWith("!find")) {
      await handlePunishmentSearchCommand(message);
      return;
    }

    if (message.channel.id === config.channels.events) {
      await handleEventMessage(client, message);
      return;
    }

    if (message.channel.id !== config.channels.quark) return;
    if (!message.author.bot) return;

    await logToChannel(
      client,
      [
        `🧪 Сообщение в Quark-аудите поймано.`,
        `Автор: ${message.author.tag}`,
        `Бот: ${message.author.bot}`,
        `Embeds: ${message.embeds.length}`,
      ].join("\n")
    );

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
        `Модератор Discord ID: ${parsed.moderator_discord_id || "не найден"}`,
        `Модератор external: ${parsed.moderator_external_id || "не найден"}`,
        `Модератор name: ${parsed.moderator_name || "не найден"}`,
        `Пользователь: ${parsed.target_raw}`,
        `Причина: ${parsed.reason}`,
      ].join("\n")
    );

    await savePunishment(client, parsed);
  } catch (error) {
    await logToChannel(
      client,
      `❌ Критическая ошибка messageCreate: ${error.stack || error.message}`
    ).catch(() => null);

    console.error("messageCreate error:", error);
  }
};