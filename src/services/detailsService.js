const { EmbedBuilder } = require("discord.js");
const supabase = require("../config/supabase");
const config = require("../config/config");

function canViewDetails(member) {
  return (
    member.roles.cache.has(config.roles.headModerator) ||
    member.roles.cache.has(config.roles.assistantHeadModerator)
  );
}

function accuracy(total, wrong) {
  total = Number(total || 0);
  wrong = Number(wrong || 0);

  if (total <= 0) return 100;

  return Math.max(0, Number((((total - wrong) / total) * 100).toFixed(2)));
}

async function handleDetailsInteraction(interaction) {
  if (!interaction.customId.startsWith("moderator_details:")) return;

  if (!canViewDetails(interaction.member)) {
    await interaction.reply({
      content: "⛔ Нет доступа.",
      ephemeral: true,
    });
    return;
  }

  const [, moderatorId] = interaction.customId.split(":");

  const { data: stats, error } = await supabase
    .from("moderator_statistics")
    .select("*")
    .eq("discord_id", moderatorId)
    .maybeSingle();

  if (error || !stats) {
    await interaction.reply({
      content: "❌ Статистика модератора не найдена.",
      ephemeral: true,
    });
    return;
  }

  const accTotal = accuracy(stats.total_punishments, stats.wrong_punishments);
  const acc7d = accuracy(stats.punishments_7d, stats.wrong_7d);
  const acc24h = accuracy(stats.punishments_24h, stats.wrong_24h);

  const embed = new EmbedBuilder()
    .setTitle(`📊 Подробная статистика: ${stats.display_name || stats.username || moderatorId}`)
    .setDescription([
      `## Общая`,
      `Всего наказаний: **${stats.total_punishments || 0}**`,
      `Мутов: **${stats.total_mutes || 0}**`,
      `Банов: **${stats.total_bans || 0}**`,
      `Досрочно снятых: **${stats.removed_punishments || 0}**`,
      `Неверных: **${stats.wrong_punishments || 0}**`,
      `Точность: **${accTotal}%**`,
      ``,
      `## За неделю`,
      `Всего: **${stats.punishments_7d || 0}**`,
      `Мутов: **${stats.mutes_7d || 0}**`,
      `Банов: **${stats.bans_7d || 0}**`,
      `Досрочно снятых: **${stats.removed_7d || 0}**`,
      `Неверных: **${stats.wrong_7d || 0}**`,
      `Точность: **${acc7d}%**`,
      ``,
      `## За 24 часа`,
      `Всего: **${stats.punishments_24h || 0}**`,
      `Мутов: **${stats.mutes_24h || 0}**`,
      `Банов: **${stats.bans_24h || 0}**`,
      `Досрочно снятых: **${stats.removed_24h || 0}**`,
      `Неверных: **${stats.wrong_24h || 0}**`,
      `Точность: **${acc24h}%**`,
      ``,
      `## Доказательства`,
      `С доказательствами: **${stats.with_proofs || 0}**`,
      `Без доказательств: **${stats.without_proofs || 0}**`,
      ``,
      `## Мероприятия`,
      `За 24 часа: **${stats.events_24h || 0}**`,
      `За неделю: **${stats.events_7d || 0}**`,
      `Всего: **${stats.events_total || 0}**`,
    ].join("\n"))
    .setColor(0x5865f2)
    .setTimestamp();

  await interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
}

module.exports = {
  handleDetailsInteraction,
};