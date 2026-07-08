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
      discord_message_id: message.id,

      moderator_discord_id: moderatorDiscordId,
      moderator_name: moderatorName,

      event_channel_id: message.channel.id,
      event_message_url: message.url,

      title: message.content.slice(0, 120) || "Мероприятие",
      content: message.content || null,
      event_description: message.content || null,

      event_date: new Date().toISOString(),
      created_at: new Date().toISOString(),
      created_by: message.author.id,
    },
    {
      onConflict: "discord_message_id",
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