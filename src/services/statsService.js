const { EmbedBuilder } = require("discord.js");
const supabase = require("../config/supabase");

function accuracy(total, wrong) {
  total = Number(total || 0);
  wrong = Number(wrong || 0);

  if (total <= 0) return 100;

  return Math.max(0, Number((((total - wrong) / total) * 100).toFixed(2)));
}

function gradeByAccuracy(value) {
  const n = Number(value);

  if (n >= 98) return "S";
  if (n >= 95) return "A";
  if (n >= 90) return "B";
  if (n >= 80) return "C";
  if (n >= 70) return "D";
  return "E";
}

async function getRank(discordId) {
  const { data } = await supabase
    .from("moderator_statistics")
    .select("discord_id,total_punishments")
    .order("total_punishments", { ascending: false });

  if (!data?.length) return "—";

  const index = data.findIndex((row) => row.discord_id === discordId);
  return index >= 0 ? `#${index + 1}` : "—";
}

async function getModeratorStats(discordId) {
  return await supabase
    .from("moderator_statistics")
    .select("*")
    .eq("discord_id", discordId)
    .maybeSingle();
}

async function buildStatsEmbed(target) {
  const { data: stats, error } = await getModeratorStats(target.id);

  if (error || !stats) {
    return null;
  }

  const acc24h = accuracy(stats.punishments_24h, stats.wrong_24h);
  const acc7d = accuracy(stats.punishments_7d, stats.wrong_7d);
  const accTotal = accuracy(
  stats.total_punishments,
  stats.wrong_punishments
);

  const rank = await getRank(target.id);
  const grade = gradeByAccuracy(accTotal);

  return new EmbedBuilder()
    .setTitle("📊 Статистика модератора")
    .setDescription(`👮 **${stats.display_name || target.username}**`)
    .addFields(
      {
        name: "⏱️ За сегодня",
        value: [
          `Наказаний: **${stats.punishments_24h || 0}**`,
          `Мутов: **${stats.mutes_24h || 0}**`,
          `Банов: **${stats.bans_24h || 0}**`,
          `Неверных: **${stats.wrong_24h || 0}**`,
          `Мероприятий: **${stats.events_24h || 0}**`,
          `Точность: **${acc24h}%**`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "📅 За неделю",
        value: [
          `Наказаний: **${stats.punishments_7d || 0}**`,
          `Мутов: **${stats.mutes_7d || 0}**`,
          `Банов: **${stats.bans_7d || 0}**`,
          `Неверных: **${stats.wrong_7d || 0}**`,
          `Мероприятий: **${stats.events_7d || 0}**`,
          `Точность: **${acc7d}%**`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "🏆 Всего",
        value: [
          `Наказаний: **${stats.total_punishments || 0}**`,
          `Мутов: **${stats.total_mutes || 0}**`,
          `Банов: **${stats.total_bans || 0}**`,
          `Неверных: **${stats.wrong_punishments || 0}**`,
          `Мероприятий: **${stats.events_total || 0}**`,
          `Точность: **${accTotal}%**`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "⭐ Рейтинг",
        value: [
          `Место по активности: **${rank}**`,
          `Класс качества: **${grade}**`,
          `Доказательств есть: **${stats.with_proofs || 0}**`,
          `Без доказательств: **${stats.without_proofs || 0}**`,
        ].join("\n"),
        inline: false,
      }
    )
    .setColor(0x5865f2)
    .setTimestamp();
}

async function handleStatsCommand(message) {
  const target = message.mentions.users.first() || message.author;

  const embed = await buildStatsEmbed(target);

  if (!embed) {
    await message.reply("❌ Статистика не найдена.");
    return;
  }

  await message.reply({ embeds: [embed] });
}

module.exports = {
  handleStatsCommand,
  buildStatsEmbed,
};