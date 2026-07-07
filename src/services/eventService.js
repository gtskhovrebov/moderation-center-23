const supabase = require("../config/supabase");
const config = require("../config/config");
const { updateModeratorCard } = require("./cardService");
const { logToChannel } = require("../utils/logger");

function shouldIgnoreEventMessage(message) {
  const text = message.content.toLowerCase();

  return (
    message.author.bot ||
    text.includes("победитель мероприятия") ||
    text.includes("победитель:")
  );
}

async function handleEventMessage(client, message) {
  if (message.channel.id !== config.channels.events) return;
  if (shouldIgnoreEventMessage(message)) return;

  const mentionedUser = message.mentions.users.first();

  const moderatorDiscordId = mentionedUser?.id || message.author.id;
  const moderatorName = mentionedUser?.username || message.author.username;

  const { error } = await supabase.from("moderator_events").upsert(
    {
      moderator_discord_id: moderatorDiscordId,
      moderator_name: moderatorName,

      event_title: message.content.slice(0, 120) || "Мероприятие",
      event_description: message.content || null,

      event_message_id: message.id,
      event_channel_id: message.channel.id,
      event_url: message.url,

      created_by: message.author.id,
      created_at: new Date().toISOString(),
    },
    {
      onConflict: "event_message_id",
    }
  );

  if (error) {
    await logToChannel(client, `❌ Ошибка записи мероприятия: ${error.message}`);
    return;
  }

  await updateModeratorCard(client, moderatorDiscordId);

  await logToChannel(
    client,
    `🎉 Мероприятие засчитано: <@${moderatorDiscordId}>`
  );
}

module.exports = {
  handleEventMessage,
};