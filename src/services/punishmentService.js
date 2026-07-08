const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");

const { sendProofRequestCard } = require("./proofService");
const { updateModeratorCard } = require("./cardService");
const supabase = require("../config/supabase");
const config = require("../config/config");
const { logToChannel } = require("../utils/logger");
const { recalculateModeratorStatistics } = require("./statisticsRecalculateService");

function getOriginalPunishmentType(removalType) {
  if (removalType === "unmute") return "mute";
  if (removalType === "unban") return "ban";
  return null;
}

async function sendLinkRequiredCard(client, parsed) {
  const channel = await client.channels.fetch(config.channels.punishLink).catch(() => null);

  if (!channel) {
    await logToChannel(client, "❌ Канал привязки наказаний не найден.");
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("⚠️ Требуется привязка наказания")
    .setDescription([
      `🆔 **ID наказания:**`,
      `\`${parsed.quark_punishment_id}\``,
      ``,
      `👤 **Пользователь:**`,
      `${parsed.target_raw || "не найден"}`,
      ``,
      `🔨 **Тип:**`,
      `${parsed.punishment_type}`,
      ``,
      `📖 **Причина:**`,
      `${parsed.reason || "не указана"}`,
      ``,
      `🔗 **Ссылка на Quark:**`,
      `${parsed.proof_url}`,
      ``,
      `⏳ **Самопривязка доступна:** 10 минут`,
    ].join("\n"))
    .setColor(0xf1c40f)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`link_self:${parsed.quark_punishment_id}`)
      .setLabel("Привязать к себе")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`show_link_command:${parsed.quark_punishment_id}`)
      .setLabel("Показать команду")
      .setStyle(ButtonStyle.Secondary)
  );

  await channel.send({
    embeds: [embed],
    components: [row],
  });
}

async function handleRemoval(client, parsed) {
  const originalType = getOriginalPunishmentType(parsed.punishment_type);

  if (!originalType || !parsed.target_discord_id) {
    await logToChannel(client, "⚠️ Снятие не обработано: не найден пользователь или тип.");
    return;
  }

  const { data: punishment, error: findError } = await supabase
    .from("punishments")
    .select("*")
    .eq("target_discord_id", parsed.target_discord_id)
    .eq("punishment_type", originalType)
    .eq("removed", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) {
    await logToChannel(client, `❌ Ошибка поиска наказания для снятия: ${findError.message}`);
    return;
  }

  if (!punishment) {
    await logToChannel(client, `⚠️ Активное наказание для снятия не найдено: ${parsed.target_raw}`);
    return;
  }

  if (punishment.expires_at) {
    const now = Date.now();
    const expiresAt = new Date(punishment.expires_at).getTime();

    if (now >= expiresAt) {
      await logToChannel(
        client,
        `ℹ️ Снятие проигнорировано как истёкшее по сроку: **${originalType}** | пользователь: ${parsed.target_raw}`
      );
      return;
    }
  }

  const { error } = await supabase
    .from("punishments")
    .update({
      removed: true,
      removed_by:
        parsed.moderator_discord_id ||
        parsed.moderator_name ||
        parsed.moderator_raw ||
        null,
      removed_at: new Date().toISOString(),
      removal_reason: parsed.reason || null,
      removal_source: parsed.proof_url || null,
      review_status: "removed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", punishment.id);

  if (error) {
    await logToChannel(client, `❌ Ошибка записи снятия наказания: ${error.message}`);
    return;
  }

  if (punishment.moderator_discord_id) {
    await recalculateModeratorStatistics(punishment.moderator_discord_id);
    await updateModeratorCard(client, punishment.moderator_discord_id);
  }

  await logToChannel(
    client,
    `🔄 Наказание досрочно снято: **${originalType}** | пользователь: ${parsed.target_raw}`
  );
}

async function savePunishment(client, parsed) {
  if (parsed.action_type === "removal") {
    await handleRemoval(client, parsed);
    return;
  }

  const realModeratorDetected = Boolean(parsed?.moderator_discord_id);

  const { error } = await supabase.from("punishments").upsert(
    {
      quark_message_id: parsed.quark_message_id,
      quark_punishment_id: parsed.quark_punishment_id,

      moderator_discord_id: realModeratorDetected ? parsed.moderator_discord_id : null,
      moderator_name: parsed.moderator_name || parsed.moderator_raw || null,

      target_discord_id: parsed.target_discord_id || null,
      target_name: parsed.target_raw || null,

      punishment_type: parsed.punishment_type,
      duration: parsed.duration || null,
      expires_at: parsed.expires_at || null,

      rule_point: parsed.rule_point || null,
      reason: parsed.reason || null,
      proof_url: parsed.proof_url || null,

      review_status: "correct",
      linked: realModeratorDetected,
      link_required: !realModeratorDetected,

      linked_by: realModeratorDetected ? "system" : null,
      linked_at: realModeratorDetected ? new Date().toISOString() : null,

      removed: false,
      removed_by: null,
      removed_at: null,

      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "quark_punishment_id",
    }
  );

  if (error) {
    await logToChannel(client, `❌ Ошибка записи наказания: ${error.message}`);
    return;
  }

  if (!realModeratorDetected) {
    await sendLinkRequiredCard(client, parsed);

    await logToChannel(
      client,
      `⚠️ Наказание требует привязки: **${parsed.punishment_type}** | пользователь: ${parsed.target_raw || "не найден"}`
    );
    return;
  }

  await recalculateModeratorStatistics(parsed.moderator_discord_id);
  await updateModeratorCard(client, parsed.moderator_discord_id);
  await sendProofRequestCard(client, parsed.quark_punishment_id);

  await logToChannel(
    client,
    `✅ Наказание записано: **${parsed.punishment_type}** | модератор: <@${parsed.moderator_discord_id}> | причина: **${parsed.reason || "не указана"}**`
  );
}

module.exports = {
  savePunishment,
};