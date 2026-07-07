const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const supabase = require("../config/supabase");
const config = require("../config/config");
const { logToChannel } = require("../utils/logger");

const {
  getPunishmentByQuarkId,
  getActiveSessionByPunishment,
  createProofSession,
  closeProofSession,
  findActiveSessionForMessage,
} = require("./proofSessionService");

function canManageAnyProof(member) {
  return (
    member.roles.cache.has(config.roles.headModerator) ||
    member.roles.cache.has(config.roles.assistantHeadModerator)
  );
}

function canManageProof(member, punishment) {
  if (canManageAnyProof(member)) return true;
  return punishment.moderator_discord_id === member.id;
}

function buildProofCard(punishment) {
  const proofCount = punishment.proof_count || 0;
  const proofStatus = proofCount > 0 ? "✅ Прикреплены" : "❌ Не прикреплены";

  return new EmbedBuilder()
    .setTitle("📎 Доказательства к наказанию")
    .setDescription([
      `🆔 **ID наказания:** \`${punishment.quark_punishment_id}\``,
      `👮 **Модератор:** ${
        punishment.moderator_discord_id
          ? `<@${punishment.moderator_discord_id}>`
          : punishment.moderator_name || "не найден"
      }`,
      `👤 **Пользователь:** ${punishment.target_name || punishment.target_discord_id || "не найден"}`,
      `🔨 **Тип:** ${punishment.punishment_type?.toUpperCase() || "не найден"}`,
      `📖 **Причина:** ${punishment.reason || "не указана"}`,
      ``,
      `📂 **Статус:** ${proofStatus}`,
      `Файлов: **${proofCount}**`,
      `🕒 **Последнее изменение:** ${
        punishment.last_proof_at
          ? `<t:${Math.floor(new Date(punishment.last_proof_at).getTime() / 1000)}:f>`
          : "—"
      }`,
    ].join("\n"))
    .setColor(proofCount > 0 ? 0x2ecc71 : 0xe74c3c)
    .setTimestamp();
}

function buildProofButtons(quarkPunishmentId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`proof_upload:${quarkPunishmentId}`)
      .setLabel("Загрузить")
      .setEmoji("📤")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`proof_add:${quarkPunishmentId}`)
      .setLabel("Добавить")
      .setEmoji("➕")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`proof_replace:${quarkPunishmentId}`)
      .setLabel("Заменить")
      .setEmoji("♻️")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`proof_delete:${quarkPunishmentId}`)
      .setLabel("Удалить")
      .setEmoji("🗑️")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId(`proof_view:${quarkPunishmentId}`)
      .setLabel("Просмотр")
      .setEmoji("👁")
      .setStyle(ButtonStyle.Secondary)
  );
}

async function sendProofRequestCard(client, quarkPunishmentId) {
  const { data: punishment, error } = await getPunishmentByQuarkId(quarkPunishmentId);

  if (error || !punishment) {
    await logToChannel(
      client,
      `❌ Не удалось создать карточку доказательств: наказание ${quarkPunishmentId} не найдено.`
    );
    return;
  }

  const channel = await client.channels.fetch(config.channels.proof).catch(() => null);

  if (!channel) {
    await logToChannel(client, "❌ Канал доказательств не найден.");
    return;
  }

  const moderatorMention = punishment.moderator_discord_id
    ? `<@${punishment.moderator_discord_id}>`
    : punishment.moderator_name || "Модератор";

  const message = await channel.send({
    content: [
      `📎 ${moderatorMention}, прикрепите доказательства к наказанию.`,
      `После загрузки файлы будут сохранены, а сообщение со скриншотами удалится.`,
    ].join("\n"),
    embeds: [buildProofCard(punishment)],
    components: [buildProofButtons(punishment.quark_punishment_id)],
    allowedMentions: {
      users: punishment.moderator_discord_id
        ? [punishment.moderator_discord_id]
        : [],
    },
  });

  const { error: updateError } = await supabase
    .from("punishments")
    .update({
      proof_request_message_id: message.id,
      proof_request_channel_id: channel.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", punishment.id);

  if (updateError) {
    await logToChannel(
      client,
      `⚠️ Карточка доказательств создана, но ID не записался: ${updateError.message}`
    );
  }
}

async function refreshProofCard(client, punishmentId) {
  const { data: punishment, error } = await supabase
    .from("punishments")
    .select("*")
    .eq("id", punishmentId)
    .maybeSingle();

  if (error || !punishment) return;
  if (!punishment.proof_request_channel_id || !punishment.proof_request_message_id) return;

  const channel = await client.channels
    .fetch(punishment.proof_request_channel_id)
    .catch(() => null);

  if (!channel) return;

  const message = await channel.messages
    .fetch(punishment.proof_request_message_id)
    .catch(() => null);

  if (!message) return;

  const moderatorMention = punishment.moderator_discord_id
    ? `<@${punishment.moderator_discord_id}>`
    : punishment.moderator_name || "Модератор";

  await message.edit({
    content: [
      `📎 ${moderatorMention}, прикрепите доказательства к наказанию.`,
      `После загрузки файлы будут сохранены, а сообщение со скриншотами удалится.`,
    ].join("\n"),
    embeds: [buildProofCard(punishment)],
    components: [buildProofButtons(punishment.quark_punishment_id)],
    allowedMentions: {
      users: [],
    },
  });
}

async function startProofSession(interaction, mode) {
  const quarkPunishmentId = interaction.customId.split(":")[1];

  const { data: punishment, error } = await getPunishmentByQuarkId(quarkPunishmentId);

  if (error || !punishment) {
    await interaction.reply({
      content: "❌ Наказание не найдено.",
      ephemeral: true,
    });
    return;
  }

  if (!canManageProof(interaction.member, punishment)) {
    await interaction.reply({
      content: "⛔ Вы можете управлять доказательствами только своих наказаний.",
      ephemeral: true,
    });
    return;
  }

  const { data: activeSession } = await getActiveSessionByPunishment(punishment.id);

  if (activeSession) {
    await interaction.reply({
      content: "⚠️ Для этого наказания уже открыта сессия загрузки доказательств.",
      ephemeral: true,
    });
    return;
  }

  if (mode === "replace") {
    await supabase
      .from("punishment_proofs")
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        deleted_by: interaction.user.id,
      })
      .eq("punishment_id", punishment.id)
      .eq("is_active", true);
  }

  const { error: sessionError } = await createProofSession({
    punishment,
    userId: interaction.user.id,
    mode,
  });

  if (sessionError) {
    await interaction.reply({
      content: `❌ Ошибка создания сессии: ${sessionError.message}`,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: [
      `📎 Сессия загрузки открыта.`,
      ``,
      `Наказание: \`${punishment.quark_punishment_id}\``,
      `Режим: **${mode}**`,
      ``,
      `Отправьте скриншоты/видео в этот канал в течение **5 минут**.`,
    ].join("\n"),
    ephemeral: true,
  });
}

async function handleProofMessage(client, message) {
  if (message.author.bot) return;
  if (message.channel.id !== config.channels.proof) return;
  if (!message.attachments.size) return;

  const { data: session, error: sessionError } =
    await findActiveSessionForMessage(message.author.id);

  if (sessionError || !session) {
    await message.reply(
      "⚠️ У вас нет активной сессии загрузки доказательств. Нажмите кнопку `Загрузить` или `Добавить` в карточке наказания."
    );
    return;
  }

  const storageChannel = await client.channels
    .fetch(config.channels.proofStorage)
    .catch(() => null);

  if (!storageChannel) {
    await message.reply("❌ Канал-хранилище доказательств не найден.");
    return;
  }

  const attachments = [...message.attachments.values()];

  for (const attachment of attachments) {
    const storedMessage = await storageChannel.send({
      content: [
        `📎 Доказательство`,
        `Наказание: \`${session.quark_punishment_id}\``,
        `Автор: <@${message.author.id}>`,
      ].join("\n"),
      files: [
        {
          attachment: attachment.url,
          name: attachment.name || "proof",
        },
      ],
      allowedMentions: { users: [] },
    });

    const storedAttachment = storedMessage.attachments.first();

    const { error } = await supabase.from("punishment_proofs").insert({
      punishment_id: session.punishment_id,
      quark_punishment_id: session.quark_punishment_id,

      attachment_url: attachment.url,
      storage_url: storedAttachment?.url || attachment.url,

      attachment_name: attachment.name || null,
      attachment_type: attachment.contentType || null,

      discord_message_id: message.id,
      discord_channel_id: message.channel.id,

      storage_message_id: storedMessage.id,
      storage_channel_id: storageChannel.id,

      added_by: message.author.id,
      is_active: true,
    });

    if (error) {
      await message.reply(`❌ Ошибка сохранения доказательства: ${error.message}`);
      return;
    }
  }

  const { data: activeProofs } = await supabase
    .from("punishment_proofs")
    .select("id")
    .eq("punishment_id", session.punishment_id)
    .eq("is_active", true);

  const proofCount = activeProofs?.length || 0;

  await supabase
    .from("punishments")
    .update({
      proof_status: proofCount > 0 ? "attached" : "missing",
      proof_count: proofCount,
      last_proof_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", session.punishment_id);

  await closeProofSession(session.id, "closed");
  await refreshProofCard(client, session.punishment_id);

  await message.delete().catch(() => null);

  const confirmMessage = await message.channel.send({
    content: `✅ <@${message.author.id}>, доказательства прикреплены. Файлов добавлено: **${attachments.length}**.`,
    allowedMentions: {
      users: [message.author.id],
    },
  });

  setTimeout(async () => {
    await confirmMessage.delete().catch(() => null);
  }, 5000);
}

async function deleteProofs(interaction) {
  const quarkPunishmentId = interaction.customId.split(":")[1];

  const { data: punishment } = await getPunishmentByQuarkId(quarkPunishmentId);

  if (!punishment) {
    await interaction.reply({
      content: "❌ Наказание не найдено.",
      ephemeral: true,
    });
    return;
  }

  if (!canManageProof(interaction.member, punishment)) {
    await interaction.reply({
      content: "⛔ Вы можете удалять только доказательства своих наказаний.",
      ephemeral: true,
    });
    return;
  }

  await supabase
    .from("punishment_proofs")
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
      deleted_by: interaction.user.id,
    })
    .eq("punishment_id", punishment.id)
    .eq("is_active", true);

  await supabase
    .from("punishments")
    .update({
      proof_status: "missing",
      proof_count: 0,
      last_proof_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", punishment.id);

  await refreshProofCard(interaction.client, punishment.id);

  await interaction.reply({
    content: "🗑️ Доказательства удалены из активных.",
    ephemeral: true,
  });
}

async function viewProofs(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const quarkPunishmentId = interaction.customId.split(":")[1];

  const { data: punishment } = await getPunishmentByQuarkId(quarkPunishmentId);

  if (!punishment) {
    await interaction.editReply({
      content: "❌ Наказание не найдено.",
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

async function handleProofInteraction(interaction) {
  if (interaction.customId.startsWith("proof_upload")) {
    await startProofSession(interaction, "upload");
    return;
  }

  if (interaction.customId.startsWith("proof_add")) {
    await startProofSession(interaction, "add");
    return;
  }

  if (interaction.customId.startsWith("proof_replace")) {
    await startProofSession(interaction, "replace");
    return;
  }

  if (interaction.customId.startsWith("proof_delete")) {
    await deleteProofs(interaction);
    return;
  }

  if (interaction.customId.startsWith("proof_view")) {
    await viewProofs(interaction);
    return;
  }
}

module.exports = {
  sendProofRequestCard,
  refreshProofCard,
  handleProofMessage,
  handleProofInteraction,
};