const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const supabase = require("../config/supabase");
const config = require("../config/config");

const SEARCH_LIMIT = 5;

function canSearchPunishments(member) {
  return (
    member.roles.cache.has(config.roles.headModerator) ||
    member.roles.cache.has(config.roles.assistantHeadModerator)
  );
}

function extractDiscordId(text) {
  if (!text) return null;
  const match = text.match(/<@!?(\d+)>|(\d{15,25})/);
  return match ? match[1] || match[2] : null;
}

function statusIcon(p) {
  if (p.review_status === "wrong") return "❌";
  if (p.review_status === "removed" || p.removed) return "🔄";
  return "✅";
}

async function searchPunishments(query) {
  const clean = query.trim();
  const discordId = extractDiscordId(clean);

  let request = supabase
    .from("punishments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(SEARCH_LIMIT);

  if (discordId) {
    request = request.or(
      `moderator_discord_id.eq.${discordId},target_discord_id.eq.${discordId},quark_punishment_id.eq.${discordId}`
    );
  } else {
    request = request.or(
      [
        `moderator_name.ilike.%${clean}%`,
        `target_name.ilike.%${clean}%`,
        `reason.ilike.%${clean}%`,
        `quark_punishment_id.ilike.%${clean}%`,
      ].join(",")
    );
  }

  return await request;
}

function buildSearchEmbed(query, punishments) {
  const lines = punishments.map((p, index) =>
    [
      `**${index + 1}. ${statusIcon(p)} ${String(p.punishment_type || "unknown").toUpperCase()}**`,
      `👮 Модератор: ${p.moderator_name || p.moderator_discord_id || "не найден"}`,
      `👤 Пользователь: ${p.target_name || p.target_discord_id || "не найден"}`,
      `📖 Причина: ${p.reason || "не указана"}`,
      `📎 Доказательства: ${p.proof_count > 0 ? `${p.proof_count} файл(ов)` : "нет"}`,
      `🆔 ID: \`${p.quark_punishment_id}\``,
      `📅 Дата: <t:${Math.floor(new Date(p.created_at).getTime() / 1000)}:f>`,
    ].join("\n")
  );

  return new EmbedBuilder()
    .setTitle("🔎 Поиск наказаний")
    .setDescription(
      lines.length
        ? [`Запрос: \`${query}\``, "", ...lines].join("\n\n")
        : `По запросу \`${query}\` ничего не найдено.`
    )
    .setColor(0x5865f2)
    .setTimestamp();
}

function buildSearchButtons(punishments) {
  const rows = [];

  const proofButtons = punishments.map((p, index) =>
    new ButtonBuilder()
      .setCustomId(`history_proofs:${p.quark_punishment_id}`)
      .setLabel(`Доки ${index + 1}`)
      .setEmoji("👁")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!p.proof_count || p.proof_count <= 0)
  );

  if (proofButtons.length) {
    rows.push(new ActionRowBuilder().addComponents(proofButtons));
  }

  const wrongButtons = punishments.map((p, index) =>
    new ButtonBuilder()
      .setCustomId(`history_wrong:${p.quark_punishment_id}`)
      .setLabel(`Неверно ${index + 1}`)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(p.review_status === "wrong")
  );

  if (wrongButtons.length) {
    rows.push(new ActionRowBuilder().addComponents(wrongButtons));
  }

  return rows;
}

async function handlePunishmentSearchCommand(message) {
  if (!canSearchPunishments(message.member)) {
    await message.reply("⛔ Поиск наказаний доступен только старшему Discord-модератору и помощнику.");
    return;
  }

  const query = message.content.replace(/^!find\s*/i, "").trim();

  if (!query) {
    await message.reply([
      "⚠️ Укажи запрос.",
      "",
      "Примеры:",
      "`!find @модератор`",
      "`!find @пользователь`",
      "`!find geo_lincoln`",
      "`!find kotov951`",
      "`!find ID_наказания`",
    ].join("\n"));
    return;
  }

  const { data, error } = await searchPunishments(query);

  if (error) {
    await message.reply(`❌ Ошибка поиска: ${error.message}`);
    return;
  }

  await message.reply({
    embeds: [buildSearchEmbed(query, data || [])],
    components: buildSearchButtons(data || []),
  });
}

module.exports = {
  handlePunishmentSearchCommand,
  searchPunishments,
  buildSearchEmbed,
  buildSearchButtons,
};