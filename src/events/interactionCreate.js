const { EmbedBuilder, escapeMarkdown } = require("discord.js");

const { handleHistoryInteraction } = require("../services/historyService");
const { handleProofInteraction } = require("../services/proofService");
const { handleDetailsInteraction } = require("../services/detailsService");
const supabase = require("../config/supabase");

const {
  searchPunishments,
  buildSearchEmbed,
  buildSearchButtons,
} = require("../services/searchPunishmentService");

const { buildStatsEmbed } = require("../services/statsService");

function safe(value) {
  return escapeMarkdown(String(value || "не найден"));
}

function isTodayMoscow(date) {
  if (!date) return false;

  const input = new Date(date);

  const nowMoscow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" })
  );

  const inputMoscow = new Date(
    input.toLocaleString("en-US", { timeZone: "Europe/Moscow" })
  );

  return (
    inputMoscow.getFullYear() === nowMoscow.getFullYear() &&
    inputMoscow.getMonth() === nowMoscow.getMonth() &&
    inputMoscow.getDate() === nowMoscow.getDate()
  );
}

function isInRange(date, hours) {
  if (!date) return false;
  return new Date(date).getTime() >= Date.now() - hours * 60 * 60 * 1000;
}

function countType(list, type) {
  return list.filter((p) => p.punishment_type === type).length;
}

function countWrong(list) {
  return list.filter((p) => p.review_status === "wrong").length;
}

function accuracy(total, wrong) {
  if (!total) return 100;
  return Math.max(0, Math.round(((total - wrong) / total) * 100));
}

async function getFreshStats(discordId) {
  const { data: punishments, error: pError } = await supabase
    .from("punishments")
    .select("*")
    .eq("moderator_discord_id", discordId);

  if (pError) throw pError;

  const { data: events, error: eError } = await supabase
    .from("moderator_events")
    .select("*")
    .eq("moderator_discord_id", discordId);

  if (eError) throw eError;

  const pList = punishments || [];
  const eList = events || [];

  const p24 = pList.filter((p) => isTodayMoscow(p.created_at));
  const p7 = pList.filter((p) => isInRange(p.created_at, 24 * 7));

  const e24 = eList.filter((e) => isTodayMoscow(e.created_at));
  const e7 = eList.filter((e) => isInRange(e.created_at, 24 * 7));

  return {
    total: pList.length,
    totalMutes: countType(pList, "mute"),
    totalBans: countType(pList, "ban"),
    totalWrong: countWrong(pList),

    day: p24.length,
    dayMutes: countType(p24, "mute"),
    dayBans: countType(p24, "ban"),
    dayWrong: countWrong(p24),

    week: p7.length,
    weekMutes: countType(p7, "mute"),
    weekBans: countType(p7, "ban"),
    weekWrong: countWrong(p7),

    eventsTotal: eList.length,
    events24: e24.length,
    events7: e7.length,

    withProofs: pList.filter((p) => Number(p.proof_count || 0) > 0).length,
    withoutProofs: pList.filter((p) => Number(p.proof_count || 0) <= 0).length,
  };
}

async function buildFreshStatsEmbed(user) {
  const stats = await getFreshStats(user.id);

  return new EmbedBuilder()
    .setTitle("📊 Статистика модератора")
    .setDescription([
      `👮 **${safe(user.displayName || user.username)}**`,
      ``,
      `## ⏱️ За сегодня`,
      `Наказаний: **${stats.day}**`,
      `Мутов: **${stats.dayMutes}**`,
      `Банов: **${stats.dayBans}**`,
      `Неверных: **${stats.dayWrong}**`,
      `Мероприятий: **${stats.events24}**`,
      `Точность: **${accuracy(stats.day, stats.dayWrong)}%**`,
      ``,
      `## 🗓️ За неделю`,
      `Наказаний: **${stats.week}**`,
      `Мутов: **${stats.weekMutes}**`,
      `Банов: **${stats.weekBans}**`,
      `Неверных: **${stats.weekWrong}**`,
      `Мероприятий: **${stats.events7}**`,
      `Точность: **${accuracy(stats.week, stats.weekWrong)}%**`,
      ``,
      `## 🏆 Всего`,
      `Наказаний: **${stats.total}**`,
      `Мутов: **${stats.totalMutes}**`,
      `Банов: **${stats.totalBans}**`,
      `Неверных: **${stats.totalWrong}**`,
      `Мероприятий: **${stats.eventsTotal}**`,
      `Точность: **${accuracy(stats.total, stats.totalWrong)}%**`,
      ``,
      `## 📎 Доказательства`,
      `С доказательствами: **${stats.withProofs}**`,
      `Без доказательств: **${stats.withoutProofs}**`,
    ].join("\n"))
    .setColor(0x5865f2)
    .setTimestamp();
}

async function buildLeaderboardEmbed() {
  const { data: moderators, error } = await supabase
    .from("moderators")
    .select("*")
    .eq("is_active", true);

  if (error) throw error;

  const rows = [];

  for (const moderator of moderators || []) {
    const stats = await getFreshStats(moderator.discord_id);

    rows.push({
      name: moderator.display_name || moderator.username || moderator.discord_id,
      activity: stats.week + stats.events7,
      punishments: stats.week,
      events: stats.events7,
      accuracy: accuracy(stats.week, stats.weekWrong),
    });
  }

  rows.sort((a, b) => b.activity - a.activity);

  return new EmbedBuilder()
    .setTitle("🏆 Рейтинг модераторов за неделю")
    .setDescription(
      rows.length
        ? rows
            .slice(0, 15)
            .map((m, i) =>
              `**${i + 1}. ${safe(m.name)}** — активность: **${m.activity}** | наказаний: **${m.punishments}** | мероприятий: **${m.events}** | точность: **${m.accuracy}%**`
            )
            .join("\n")
        : "Данных пока нет."
    )
    .setColor(0xf1c40f)
    .setTimestamp();
}

async function buildEventsEmbed(user) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
  .from("moderator_events")
  .select("*")
  .eq("moderator_discord_id", user.id)
  .gte("created_at", weekAgo)
  .order("created_at", { ascending: false })
  .limit(10);

  if (error) throw error;

  return new EmbedBuilder()
    .setTitle("🎉 Мероприятия модератора за неделю")
    .setDescription([
      `👮 **${safe(user.displayName || user.username)}**`,
      ``,
      data?.length
        ? data
            .map((e, i) => {
              const title = e.title || e.event_title || e.content || "Мероприятие";
              const time = e.created_at
                ? `<t:${Math.floor(new Date(e.created_at).getTime() / 1000)}:f>`
                : "дата не найдена";

              const url = e.event_message_url || e.event_url || e.url || null;

return [
  `**${i + 1}.** ${safe(title).slice(0, 160)}`,
  `${time}`,
  url ? `🔗 [Перейти к мероприятию](${url})` : `🔗 Ссылка не найдена`,
].join("\n");
            })
            .join("\n\n")
        : "Мероприятий пока нет.",
    ].join("\n"))
    .setColor(0x2ecc71)
    .setTimestamp();
}

async function handleSlashCommand(interaction) {
  const command = interaction.commandName;

  if (command === "find") {
    await interaction.deferReply({ ephemeral: true });

    const query = interaction.options.getString("запрос", true);
    const { data, error } = await searchPunishments(query);

    if (error) {
      await interaction.editReply({ content: `❌ Ошибка поиска: ${error.message}` });
      return;
    }

    await interaction.editReply({
      embeds: [buildSearchEmbed(query, data || [])],
      components: buildSearchButtons(data || []),
    });
    return;
  }

  if (command === "mystats" || command === "stats") {
    await interaction.deferReply({ ephemeral: true });

    const target =
      command === "stats"
        ? interaction.options.getUser("модератор") || interaction.user
        : interaction.user;

    const embed = await buildFreshStatsEmbed(target);

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (command === "history") {
    const target = interaction.options.getUser("модератор", true);

    interaction.customId = `moderator_history:${target.id}`;
    await handleHistoryInteraction(interaction);
    return;
  }

  if (command === "leaderboard") {
    await interaction.deferReply({ ephemeral: true });

    const embed = await buildLeaderboardEmbed();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (command === "events") {
    await interaction.deferReply({ ephemeral: true });

    const target = interaction.options.getUser("модератор") || interaction.user;
    const embed = await buildEventsEmbed(target);

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  await interaction.reply({
    content: `⚠️ Команда /${command} пока не подключена.`,
    ephemeral: true,
  });
}

module.exports = async function interactionCreate(client, interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
      return;
    }

    if (!interaction.isButton()) return;

    console.log("BUTTON:", interaction.customId);

    if (interaction.customId.startsWith("proof_")) {
      await handleProofInteraction(interaction);
      return;
    }

    if (
      interaction.customId.startsWith("moderator_history") ||
      interaction.customId.startsWith("history_")
    ) {
      await handleHistoryInteraction(interaction);
      return;
    }

    if (interaction.customId.startsWith("moderator_details")) {
      await handleDetailsInteraction(interaction);
      return;
    }

    await interaction.reply({
      content: `⚠️ Кнопка пока не подключена: \`${interaction.customId}\``,
      ephemeral: true,
    });
  } catch (error) {
    console.error("Interaction error:", error);

    if (error.code === 10062 || error.message?.includes("Unknown interaction")) {
      return;
    }

    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({
          content: `❌ Ошибка обработки: ${error.message}`,
          ephemeral: true,
        })
        .catch(() => null);
    } else {
      await interaction
        .editReply({
          content: `❌ Ошибка обработки: ${error.message}`,
        })
        .catch(() => null);
    }
  }
};