const {
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  escapeMarkdown,
} = require("discord.js");

const supabase = require("../config/supabase");
const config = require("../config/config");
const { logToChannel } = require("../utils/logger");
const { calculateWeeklyReward } = require("./rewardService");

function safeText(value) {
  return escapeMarkdown(String(value || "не найден"));
}

function isInRange(date, hours) {
  if (!date) return false;
  return new Date(date).getTime() >= Date.now() - hours * 60 * 60 * 1000;
}

function countType(list, type) {
  return list.filter((p) => p.punishment_type === type).length;
}

function countRemoved(list) {
  return list.filter((p) => p.removed || p.review_status === "removed").length;
}

function countWrong(list) {
  return list.filter((p) => p.review_status === "wrong").length;
}

function calcAccuracy(total, wrong) {
  total = Number(total || 0);
  wrong = Number(wrong || 0);

  if (total <= 0) return 100;

  return Math.max(0, Number((((total - wrong) / total) * 100).toFixed(2)));
}

async function getModeratorStats(discordId) {
  const { data: punishments, error: punishmentsError } = await supabase
    .from("punishments")
    .select("*")
    .eq("moderator_discord_id", discordId);

  if (punishmentsError) {
    throw new Error(`Ошибка загрузки punishments: ${punishmentsError.message}`);
  }

  const { data: events, error: eventsError } = await supabase
    .from("moderator_events")
    .select("*")
    .eq("moderator_discord_id", discordId);

  if (eventsError) {
    throw new Error(`Ошибка загрузки moderator_events: ${eventsError.message}`);
  }

  const pList = punishments || [];
  const eList = events || [];

  const p24 = pList.filter((p) => isInRange(p.created_at, 24));
  const p7d = pList.filter((p) => isInRange(p.created_at, 24 * 7));

  const e24 = eList.filter((e) => isInRange(e.created_at, 24));
  const e7d = eList.filter((e) => isInRange(e.created_at, 24 * 7));

  const totalPunishments = pList.length;
  const wrongPunishments = countWrong(pList);

  return {
    discord_id: discordId,

    total_punishments: totalPunishments,
    total_mutes: countType(pList, "mute"),
    total_bans: countType(pList, "ban"),
    removed_punishments: countRemoved(pList),
    wrong_punishments: wrongPunishments,

    punishments_24h: p24.length,
    mutes_24h: countType(p24, "mute"),
    bans_24h: countType(p24, "ban"),
    removed_24h: countRemoved(p24),
    wrong_24h: countWrong(p24),

    punishments_7d: p7d.length,
    mutes_7d: countType(p7d, "mute"),
    bans_7d: countType(p7d, "ban"),
    removed_7d: countRemoved(p7d),
    wrong_7d: countWrong(p7d),

    events_total: eList.length,
    events_24h: e24.length,
    events_7d: e7d.length,

    with_proofs: pList.filter((p) => Number(p.proof_count || 0) > 0).length,
    without_proofs: pList.filter((p) => Number(p.proof_count || 0) <= 0).length,

    accuracy: calcAccuracy(totalPunishments, wrongPunishments),
  };
}

function buildModeratorCard(member, stats = {}) {
  const total = stats.total_punishments || 0;
  const mutes = stats.total_mutes || 0;
  const bans = stats.total_bans || 0;
  const removed = stats.removed_punishments || 0;
  const wrongTotal = stats.wrong_punishments || 0;

  const d24Total = stats.punishments_24h || 0;
  const d24Mutes = stats.mutes_24h || 0;
  const d24Bans = stats.bans_24h || 0;
  const d24Removed = stats.removed_24h || 0;
  const d24Wrong = stats.wrong_24h || 0;

  const weekTotal = stats.punishments_7d || 0;
  const weekMutes = stats.mutes_7d || 0;
  const weekBans = stats.bans_7d || 0;
  const weekRemoved = stats.removed_7d || 0;
  const weekWrong = stats.wrong_7d || 0;

  const eventsTotal = stats.events_total || 0;
  const events24h = stats.events_24h || 0;
  const events7d = stats.events_7d || 0;

  const withProofs = stats.with_proofs || 0;
  const withoutProofs = stats.without_proofs || 0;

  const accuracy = calcAccuracy(total, wrongTotal);
  const weekAccuracy = calcAccuracy(weekTotal, weekWrong);
  const d24Accuracy = calcAccuracy(d24Total, d24Wrong);

  const reward = calculateWeeklyReward(stats);

  return new EmbedBuilder()
    .setTitle(`👮 ${safeText(member.displayName)}`)
    .setDescription([
      `🟢 **Статус:** активен`,
      ``,

      `## 📊 Общая статистика`,
      `> Всего: **${total}**  •  Муты: **${mutes}**  •  Баны: **${bans}**`,
      `> Досрочно снятых: **${removed}**  •  Неверных: **${wrongTotal}**`,
      `> Мероприятий: **${eventsTotal}**`,
      `> Точность: **${accuracy}%**`,
      ``,

      `## 🗓️ За неделю`,
      `> Всего: **${weekTotal}**  •  Муты: **${weekMutes}**  •  Баны: **${weekBans}**`,
      `> Досрочно снятых: **${weekRemoved}**  •  Неверных: **${weekWrong}**`,
      `> Мероприятий: **${events7d}**`,
      `> Точность: **${weekAccuracy}%**`,
      ``,

      `## ⏱️ За последние 24 часа`,
      `> Всего: **${d24Total}**  •  Муты: **${d24Mutes}**  •  Баны: **${d24Bans}**`,
      `> Досрочно снятых: **${d24Removed}**  •  Неверных: **${d24Wrong}**`,
      `> Мероприятий: **${events24h}**`,
      `> Точность: **${d24Accuracy}%**`,
      ``,

      `## 📎 Доказательства`,
      `> С доказательствами: **${withProofs}**`,
      `> Без доказательств: **${withoutProofs}**`,
      ``,

      `## 🎁 Донат недели`,
      `> Рекомендация: **${reward.finalReward} GC**`,
      `> Активность: **+${reward.activityBonus}**  •  Качество: **+${reward.qualityBonus}**`,
      `> Доказательства: **+${reward.proofBonus}**  •  Мероприятия: **+${reward.eventBonus}**`,
      `> Штрафы: ошибки **-${reward.wrongPenalty}**, снятые **-${reward.removedPenalty}**, без доков **-${reward.missingProofPenalty}**`,
      ``,

      `🕒 **Обновлено:** <t:${Math.floor(Date.now() / 1000)}:f>`,
    ].join("\n"))
    .setColor(0x5865f2)
    .setTimestamp();
}

function buildModeratorCardButtons(discordId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`moderator_history:${discordId}:0`)
      .setLabel("История")
      .setEmoji("📜")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`moderator_details:${discordId}`)
      .setLabel("Подробно")
      .setEmoji("📊")
      .setStyle(ButtonStyle.Secondary)
  );
}

async function findExistingThread(client, member) {
  const forum = await client.channels.fetch(config.channels.forum).catch(() => null);

  if (!forum || forum.type !== ChannelType.GuildForum) return null;

  const activeThreads = await forum.threads.fetchActive();
  const activeMatch = activeThreads.threads.find(
    (thread) =>
      thread.name === member.displayName ||
      thread.name === `[СНЯТ] ${member.displayName}`
  );

  if (activeMatch) return activeMatch;

  const archivedThreads = await forum.threads.fetchArchived({ limit: 100 });
  const archivedMatch = archivedThreads.threads.find(
    (thread) =>
      thread.name === member.displayName ||
      thread.name === `[СНЯТ] ${member.displayName}`
  );

  return archivedMatch || null;
}

async function saveModeratorRecord(client, member, threadId, messageId) {
  const { error } = await supabase.from("moderators").upsert(
    {
      discord_id: member.id,
      username: member.user.username,
      nickname: member.user.username,
      display_name: member.displayName,
      status: "active",
      is_active: true,
      role: "discord_moderator",
      forum_thread_id: threadId,
      forum_message_id: messageId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "discord_id" }
  );

  if (error) {
    await logToChannel(
      client,
      `❌ Ошибка сохранения модератора **${safeText(member.displayName)}**: ${error.message}`
    );
    return false;
  }

  return true;
}

async function createModeratorCard(client, member) {
  const forum = await client.channels.fetch(config.channels.forum).catch(() => null);

  if (!forum || forum.type !== ChannelType.GuildForum) {
    await logToChannel(client, "❌ Форум карточек модераторов не найден или это не форум.");
    return;
  }

  const stats = await getModeratorStats(member.id);
  const components = [buildModeratorCardButtons(member.id)];

  const { data: existing } = await supabase
    .from("moderators")
    .select("*")
    .eq("discord_id", member.id)
    .maybeSingle();

  if (existing?.forum_thread_id && existing?.forum_message_id) {
    try {
      const thread = await client.channels.fetch(existing.forum_thread_id);
      const msg = await thread.messages.fetch(existing.forum_message_id);

      if (thread.archived) await thread.setArchived(false);
      if (thread.name.startsWith("[СНЯТ]")) await thread.setName(member.displayName);

      await msg.edit({
        embeds: [buildModeratorCard(member, stats)],
        components,
      });

      await saveModeratorRecord(client, member, existing.forum_thread_id, existing.forum_message_id);

      await logToChannel(client, `♻️ Карточка модератора обновлена: **${safeText(member.displayName)}**`);
      return;
    } catch (error) {
      await logToChannel(
        client,
        `⚠️ Карточка была в базе, но не найдена в Discord. Создаю/ищу новую: **${safeText(member.displayName)}**`
      );
    }
  }

  const existingThread = await findExistingThread(client, member);

  if (existingThread) {
    if (existingThread.archived) await existingThread.setArchived(false);
    if (existingThread.name.startsWith("[СНЯТ]")) await existingThread.setName(member.displayName);

    let starterMessage = await existingThread.fetchStarterMessage().catch(() => null);

    if (starterMessage) {
      await starterMessage.edit({
        embeds: [buildModeratorCard(member, stats)],
        components,
      });
    } else {
      starterMessage = await existingThread.send({
        embeds: [buildModeratorCard(member, stats)],
        components,
      });
    }

    await saveModeratorRecord(client, member, existingThread.id, starterMessage.id);
    await logToChannel(client, `♻️ Найдена и привязана существующая карточка модератора: **${safeText(member.displayName)}**`);
    return;
  }

  const thread = await forum.threads.create({
    name: member.displayName,
    message: {
      embeds: [buildModeratorCard(member, stats)],
      components,
    },
  });

  const starterMessage = await thread.fetchStarterMessage();

  await saveModeratorRecord(client, member, thread.id, starterMessage.id);

  await logToChannel(client, `✅ Создана карточка модератора: **${safeText(member.displayName)}**`);
}

async function archiveModeratorCard(client, member) {
  const { data: moderator } = await supabase
    .from("moderators")
    .select("*")
    .eq("discord_id", member.id)
    .maybeSingle();

  const { error } = await supabase
    .from("moderators")
    .update({
      status: "removed",
      is_active: false,
      removed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("discord_id", member.id);

  if (error) {
    await logToChannel(client, `❌ Ошибка снятия модератора **${safeText(member.displayName)}**: ${error.message}`);
    return;
  }

  if (moderator?.forum_thread_id) {
    try {
      const thread = await client.channels.fetch(moderator.forum_thread_id);
      await thread.setName(`[СНЯТ] ${member.displayName}`);
      await thread.setArchived(true);
    } catch (error) {
      await logToChannel(client, `⚠️ Не смог архивировать карточку ${member.displayName}: ${error.message}`);
    }
  }

  await logToChannel(client, `🔴 Модератор снят: **${safeText(member.displayName)}**`);
}

async function updateModeratorCard(client, discordId) {
  try {
    const guild = await client.guilds.fetch(config.guildId);
    const member = await guild.members.fetch(discordId).catch(() => null);

    if (!member) {
      await logToChannel(client, `⚠️ Карточка не обновлена: участник <@${discordId}> не найден на сервере.`);
      return;
    }

    const { data: moderator, error } = await supabase
      .from("moderators")
      .select("*")
      .eq("discord_id", discordId)
      .maybeSingle();

    if (error) {
      await logToChannel(client, `❌ Ошибка поиска карточки <@${discordId}>: ${error.message}`);
      return;
    }

    if (!moderator?.forum_thread_id || !moderator?.forum_message_id) {
    await logToChannel(
        client,
        `⚠️ Карточка для ${member.displayName} отсутствует. Обновление пропущено.`
    );
    return;
}

    const stats = await getModeratorStats(discordId);

    const thread = await client.channels.fetch(moderator.forum_thread_id).catch(() => null);

    if (!thread) {
      await logToChannel(client, `⚠️ Тред карточки <@${discordId}> не найден. Создаю новую карточку.`);
      await createModeratorCard(client, member);
      return;
    }

    if (thread.archived) {
      await thread.setArchived(false).catch(() => null);
    }

    const message = await thread.messages.fetch(moderator.forum_message_id).catch(() => null);

    if (!message) {
      await logToChannel(client, `⚠️ Сообщение карточки <@${discordId}> не найдено. Создаю новую карточку.`);
      await createModeratorCard(client, member);
      return;
    }

    await message.edit({
      embeds: [buildModeratorCard(member, stats)],
      components: [buildModeratorCardButtons(discordId)],
    });

    await supabase
      .from("moderators")
      .update({
        username: member.user.username,
        nickname: member.user.username,
        display_name: member.displayName,
        updated_at: new Date().toISOString(),
      })
      .eq("discord_id", discordId);

    await logToChannel(client, `✅ Карточка обновлена: **${safeText(member.displayName)}**`);
  } catch (error) {
    await logToChannel(
      client,
      `❌ Критическая ошибка обновления карточки <@${discordId}>: ${error.message}`
    );
  }
}
async function refreshAllModeratorCards(client) {
  const { data: moderators, error } = await supabase
    .from("moderators")
    .select("*")
    .eq("is_active", true);

  if (error) {
    await logToChannel(client, `❌ Ошибка массового обновления карточек: ${error.message}`);
    return;
  }

  for (const moderator of moderators || []) {
    if (!moderator.discord_id) continue;
    await updateModeratorCard(client, moderator.discord_id);
  }

  await logToChannel(client, `♻️ Массовое обновление карточек завершено: ${moderators?.length || 0}`);
}
module.exports = {
  createModeratorCard,
  archiveModeratorCard,
  updateModeratorCard,
  refreshAllModeratorCards,
};