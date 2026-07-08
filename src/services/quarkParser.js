function getEmbedField(embed, fieldName) {
  const field = embed.fields?.find((f) =>
    f.name.toLowerCase().includes(fieldName.toLowerCase())
  );

  return field?.value || null;
}

function extractMentionId(text) {
  if (!text) return null;
  const match = String(text).match(/<@!?(\d+)>/);
  return match ? match[1] : null;
}

function cleanDiscordText(text) {
  if (!text) return "";

  return String(text)
    .replace(/<@!?(\d+)>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanModeratorName(text) {
  return cleanDiscordText(text).replace(/\(\s*\)$/g, "").trim();
}

function isDiscordId(value) {
  return /^\d{15,25}$/.test(String(value || ""));
}

function extractModeratorFromBotReason(reason) {
  if (!reason) return null;

  const patterns = [
    /(?:Мьют|Бан):\s*(.+?)\s*\(ID:\s*([^)]+)\):\s*(.+)/i,
    /^(.+?)\s*\(ID:\s*([^)]+)\):\s*(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = String(reason).match(pattern);

    if (match) {
      const id = String(match[2]).trim();

      return {
        moderator_name: cleanModeratorName(match[1]),
        moderator_discord_id: isDiscordId(id) ? id : null,
        moderator_external_id: isDiscordId(id) ? null : id,
        clean_reason: match[3].trim(),
      };
    }
  }

  return null;
}

function extractRule(reason) {
  if (!reason) return null;
  const cleaned = cleanDiscordText(reason);
  const ruleMatch = cleaned.match(/\b\d{1,3}([.,]\d{1,3}){0,3}\b/);
  return ruleMatch ? ruleMatch[0].replace(",", ".") : null;
}

function extractDuration(text) {
  if (!text) return null;

  const cleaned = cleanDiscordText(text);

  const durationMatch = cleaned.match(
    /\b\d+\s?(s|sec|сек|секунд|m|min|мин|минут|h|hr|час|часов|d|day|д|дн|дней|w|week|нед|недель|mo|мес|месяц)\b/i
  );

  return durationMatch ? durationMatch[0] : null;
}

function extractExpiresAt(reason) {
  if (!reason) return null;

  const match = String(reason).match(
    /до\s+(\d{1,2})\s+([а-яё]+)\s+(\d{4})\s+г\.,\s+(\d{1,2}):(\d{2}):(\d{2})\s+UTC/i
  );

  if (!match) return null;

  const months = {
    января: 0,
    февраля: 1,
    марта: 2,
    апреля: 3,
    мая: 4,
    июня: 5,
    июля: 6,
    августа: 7,
    сентября: 8,
    октября: 9,
    ноября: 10,
    декабря: 11,
  };

  const [, day, monthName, year, hour, minute, second] = match;
  const month = months[monthName.toLowerCase()];

  if (month === undefined) return null;

  return new Date(
    Date.UTC(
      Number(year),
      month,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    )
  ).toISOString();
}

function isAutomaticExpiration(reason, title) {
  const text = `${reason || ""} ${title || ""}`.toLowerCase();

  return (
    text.includes("срок действия") ||
    text.includes("истёк") ||
    text.includes("истек") ||
    text.includes("expired")
  );
}

function isBotModeratorRaw(text) {
  const cleaned = cleanDiscordText(text).toLowerCase();

  return (
    cleaned.includes("juniperbot") ||
    cleaned.includes("quark") ||
    cleaned.includes("#6999")
  );
}

function parseQuarkMessage(message) {
  const embed = message.embeds?.[0];
  if (!embed) return null;

  const title = embed.title || embed.author?.name || embed.description || "";
  const normalizedTitle = title.toLowerCase();

  const userRaw = getEmbedField(embed, "Пользователь");
  const moderatorRaw = getEmbedField(embed, "Модератор");
  const reasonRaw = getEmbedField(embed, "Причина");

  if (!userRaw) return null;

  const rawReason = cleanDiscordText(reasonRaw || "");
  const botReasonModerator = extractModeratorFromBotReason(rawReason);
  const reason = botReasonModerator?.clean_reason || rawReason;

  const isUnmute =
    normalizedTitle.includes("тайм-аут снят") ||
    normalizedTitle.includes("размут") ||
    normalizedTitle.includes("unmute");

  const isUnban =
    normalizedTitle.includes("разбан") ||
    normalizedTitle.includes("unban");

  if ((isUnmute || isUnban) && isAutomaticExpiration(rawReason, title)) {
    return null;
  }

  const isTimeout =
    normalizedTitle.includes("тайм-аут") ||
    normalizedTitle.includes("timeout") ||
    normalizedTitle.includes("мут") ||
    normalizedTitle.includes("mute");

  const isBan =
    normalizedTitle.includes("бан") ||
    normalizedTitle.includes("ban");

  if (!isTimeout && !isBan && !isUnmute && !isUnban) return null;

  let actionType = "punishment";
  let punishmentType = "unknown";

  if (isUnmute) {
    actionType = "removal";
    punishmentType = "unmute";
  } else if (isUnban) {
    actionType = "removal";
    punishmentType = "unban";
  } else if (isTimeout) {
    punishmentType = "mute";
  } else if (isBan) {
    punishmentType = "ban";
  }

  const moderatorIdFromRaw = isBotModeratorRaw(moderatorRaw)
    ? null
    : extractMentionId(moderatorRaw);

  return {
    action_type: actionType,
    quark_message_id: message.id,
    quark_punishment_id: message.id,
    punishment_type: punishmentType,

    target_raw: userRaw,
    target_discord_id: extractMentionId(userRaw),
    target_name: cleanDiscordText(userRaw),

    moderator_raw: moderatorRaw,

    // Главное: сначала берём реального модератора из причины.
    moderator_discord_id:
      botReasonModerator?.moderator_discord_id ||
      moderatorIdFromRaw ||
      null,

    moderator_external_id:
      botReasonModerator?.moderator_external_id ||
      null,

    moderator_name:
      botReasonModerator?.moderator_name ||
      (!isBotModeratorRaw(moderatorRaw) ? cleanModeratorName(moderatorRaw) : null),

    reason,
    rule_point: extractRule(reason),
    duration: extractDuration(rawReason || title || ""),
    expires_at: extractExpiresAt(rawReason),
    proof_url: message.url,
  };
}

module.exports = {
  parseQuarkMessage,
};