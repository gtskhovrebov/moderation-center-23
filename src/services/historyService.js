const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const supabase = require("../config/supabase");
const config = require("../config/config");
const { updateModeratorCard } = require("./cardService");

function shortError(error) {
  const text = error?.message || String(error || "Неизвестная ошибка");

  if (text.includes("522") || text.includes("Connection timed out")) {
    return "Supabase временно не ответил: Cloudflare 522 / connection timed out. Повторите действие через несколько секунд.";
  }

  return text.length > 300 ? `${text.slice(0, 300)}...` : text;
}

const PAGE_SIZE = 5;

function canViewAll(member) {
  return (
    member.roles.cache.has(config.roles.headModerator) ||
    member.roles.cache.has(config.roles.assistantHeadModerator)
  );
}

function statusIcon(p) {
  if (p.review_status === "wrong") return "❌";
  if (p.review_status === "removed" || p.removed) return "🔄";
  return "✅";
}

async function getPunishments(moderatorId, page = 0) {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  return await supabase
    .from("punishments")
    .select("*", { count: "exact" })
    .eq("moderator_discord_id", moderatorId)
    .order("created_at", { ascending: false })
    .range(from, to);
}

function buildHistoryEmbed(target, punishments, page, total) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const lines = punishments.map((p, index) =>
    [
      `**${page * PAGE_SIZE + index + 1}. ${statusIcon(p)} ${String(p.punishment_type || "unknown").toUpperCase()}**`,
      `👤 Пользователь: ${p.target_name || p.target_discord_id || "не найден"}`,
      `📖 Причина: ${p.reason || "не указана"}`,
      `📎 Доказательства: ${p.proof_count > 0 ? `${p.proof_count} файл(ов)` : "нет"}`,
      `🆔 ID: \`${p.quark_punishment_id}\``,
      `📅 Дата: <t:${Math.floor(new Date(p.created_at).getTime() / 1000)}:f>`,
    ].join("\n")
  );

  return new EmbedBuilder()
    .setTitle(`📜 История наказаний: ${target.username}`)
    .setDescription(lines.length ? lines.join("\n\n") : "История пустая.")
    .setFooter({ text: `Страница ${page + 1}/${totalPages}` })
    .setColor(0x5865f2)
    .setTimestamp();
}

function buildHistoryButtons(targetId, punishments, page, total) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = [];

  const proofButtons = punishments.map((p, index) =>
    new ButtonBuilder()
      .setCustomId(`history_proofs:${p.quark_punishment_id}`)
      .setLabel(`Доки ${page * PAGE_SIZE + index + 1}`)
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
      .setLabel(`Неверно ${page * PAGE_SIZE + index + 1}`)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(p.review_status === "wrong")
  );

  if (wrongButtons.length) {
    rows.push(new ActionRowBuilder().addComponents(wrongButtons));
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`history_prev:${targetId}:${page}`)
        .setLabel("Назад")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 0),

      new ButtonBuilder()
        .setCustomId(`history_next:${targetId}:${page}`)
        .setLabel("Далее")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1),

      new ButtonBuilder()
        .setCustomId("history_close")
        .setLabel("Закрыть")
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return rows;
}

async function sendPunishmentProofs(interaction, quarkPunishmentId) {
  await interaction.deferReply({ ephemeral: true });

  const { data: punishment, error: punishmentError } = await supabase
    .from("punishments")
    .select("*")
    .eq("quark_punishment_id", quarkPunishmentId)
    .maybeSingle();

  if (punishmentError || !punishment) {
    await interaction.editReply({
      content: `❌ Ошибка загрузки доказательств: ${shortError(error)}`,
    });
    return;
  }

  const { data: proofs, error } = await supabase
    .from("punishment_proofs")
    .select("*")
    .eq("punishment_id", punishment.id)
    .eq("is_active", true)
    .order("added_at", { ascending: true });

  if (error) {
    await interaction.editReply({
      content: `❌ Ошибка загрузки доказательств: ${error.message}`,
    });
    return;
  }

  if (!proofs?.length) {
    await interaction.editReply({
      content: "📎 Доказательства не прикреплены.",
    });
    return;
  }

  await interaction.editReply({
    content: `📎 **Доказательства наказания**\nID: \`${punishment.quark_punishment_id}\``,
    files: proofs.slice(0, 10).map((p, index) => ({
      attachment: p.storage_url || p.attachment_url,
      name: p.attachment_name || `proof_${index + 1}`,
    })),
  });
}

async function markPunishmentWrong(interaction, quarkPunishmentId) {
  await interaction.deferReply({ ephemeral: true });

  const { data: punishment, error } = await supabase
    .from("punishments")
    .select("*")
    .eq("quark_punishment_id", quarkPunishmentId)
    .maybeSingle();

  if (error || !punishment) {
    await interaction.editReply({
  content: `❌ Ошибка отметки неверного наказания: ${shortError(updateError)}`,
   });
    return;
  }

  const { error: updateError } = await supabase
    .from("punishments")
    .update({
      review_status: "wrong",
      wrong_by: interaction.user.id,
      wrong_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", punishment.id);

  if (updateError) {
    await interaction.editReply({
      content: `❌ Ошибка отметки неверного наказания: ${updateError.message}`,
    });
    return;
  }
  if (punishment.moderator_discord_id) {
  await updateModeratorCard(interaction.client, punishment.moderator_discord_id);
}

  await interaction.editReply({
    content: `❌ Наказание \`${quarkPunishmentId}\` помечено как неверно выданное.`,
  });
}

async function openHistoryFromModeratorCard(interaction) {
  const [, targetId] = interaction.customId.split(":");

  if (!canViewAll(interaction.member)) {
    await interaction.reply({
      content: "⛔ Нет доступа.",
      ephemeral: true,
    });
    return;
  }

  const target = await interaction.client.users.fetch(targetId).catch(() => null);

  if (!target) {
    await interaction.reply({
      content: "❌ Модератор не найден.",
      ephemeral: true,
    });
    return;
  }

  const { data, error, count } = await getPunishments(targetId, 0);

  if (error) {
    await interaction.reply({
      content: `❌ Ошибка загрузки истории: ${error.message}`,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    embeds: [buildHistoryEmbed(target, data || [], 0, count || 0)],
    components: buildHistoryButtons(targetId, data || [], 0, count || 0),
    ephemeral: true,
  });
}

async function handleHistoryCommand(message) {
  if (!canViewAll(message.member)) {
    await message.reply("⛔ Историю чужих наказаний могут смотреть только старший Discord-модератор и помощник.");
    return;
  }

  const target = message.mentions.users.first();

  if (!target) {
    await message.reply("⚠️ Укажи модератора: `!history @модератор`");
    return;
  }

  const { data, error, count } = await getPunishments(target.id, 0);

  if (error) {
    await message.reply(`❌ Ошибка загрузки истории: ${error.message}`);
    return;
  }

  await message.reply({
    embeds: [buildHistoryEmbed(target, data || [], 0, count || 0)],
    components: buildHistoryButtons(target.id, data || [], 0, count || 0),
  });
}

async function handleHistoryInteraction(interaction) {
  if (interaction.customId.startsWith("moderator_history:")) {
    await openHistoryFromModeratorCard(interaction);
    return;
  }

  if (interaction.customId === "history_close") {
    await interaction.update({
      content: "📜 История закрыта.",
      embeds: [],
      components: [],
    });
    return;
  }

  if (interaction.customId.startsWith("history_proofs:")) {
    const [, quarkPunishmentId] = interaction.customId.split(":");
    await sendPunishmentProofs(interaction, quarkPunishmentId);
    return;
  }

  if (interaction.customId.startsWith("history_wrong:")) {
    const [, quarkPunishmentId] = interaction.customId.split(":");
    await markPunishmentWrong(interaction, quarkPunishmentId);
    return;
  }

  const [action, targetId, rawPage] = interaction.customId.split(":");

  if (!canViewAll(interaction.member)) {
    await interaction.reply({
      content: "⛔ Нет доступа.",
      ephemeral: true,
    });
    return;
  }

  let page = Number(rawPage || 0);

  if (action === "history_open") page = Number(rawPage || 0);
  if (action === "history_next") page += 1;
  if (action === "history_prev") page -= 1;
  if (page < 0) page = 0;

  const target = await interaction.client.users.fetch(targetId).catch(() => null);

  if (!target) {
    await interaction.reply({
      content: "❌ Модератор не найден.",
      ephemeral: true,
    });
    return;
  }

  const { data, error, count } = await getPunishments(targetId, page);

  if (error) {
    await interaction.reply({
      content: `❌ Ошибка загрузки истории: ${error.message}`,
      ephemeral: true,
    });
    return;
  }

  await interaction.update({
    embeds: [buildHistoryEmbed(target, data || [], page, count || 0)],
    components: buildHistoryButtons(targetId, data || [], page, count || 0),
  });
}

module.exports = {
  handleHistoryCommand,
  handleHistoryInteraction,
};