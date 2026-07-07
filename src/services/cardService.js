const {
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const supabase = require("../config/supabase");
const config = require("../config/config");
const { logToChannel } = require("../utils/logger");
const { calculateWeeklyReward } = require("./rewardService");

function buildModeratorCard(member, stats = null) {
  const total = stats?.total_punishments || 0;
  const mutes = stats?.total_mutes || 0;
  const bans = stats?.total_bans || 0;
  const removed = stats?.removed_punishments || 0;
  const wrongTotal = stats?.wrong_punishments || 0;

  const d24Total = stats?.punishments_24h || 0;
  const d24Mutes = stats?.mutes_24h || 0;
  const d24Bans = stats?.bans_24h || 0;
  const d24Removed = stats?.removed_24h || 0;
  const d24Wrong = stats?.wrong_24h || 0;

  const weekTotal = stats?.punishments_7d || 0;
  const weekMutes = stats?.mutes_7d || 0;
  const weekBans = stats?.bans_7d || 0;
  const weekRemoved = stats?.removed_7d || 0;
  const weekWrong = stats?.wrong_7d || 0;

  const withProofs = stats?.with_proofs || 0;
  const withoutProofs = stats?.without_proofs || 0;
  function calcAccuracy(total, wrong) {
  total = Number(total || 0);
  wrong = Number(wrong || 0);

  if (total <= 0) return 100;

  return Math.max(0, Number((((total - wrong) / total) * 100).toFixed(2)));
}

const accuracy = calcAccuracy(total, wrongTotal);
const weekAccuracy = calcAccuracy(weekTotal, weekWrong);
const d24Accuracy = calcAccuracy(d24Total, d24Wrong);

const reward = calculateWeeklyReward(stats || {});

  return new EmbedBuilder()
    .setTitle(`👮 ${member.displayName}`)
    .setDescription([
      `🟢 **Статус:** активен`,
      ``,

      `## 📊 Общая статистика`,
      `> Всего: **${total}**  •  Муты: **${mutes}**  •  Баны: **${bans}**`,
      `> Досрочно снятых: **${removed}**  •  Неверных: **${wrongTotal}**`,
      `> Точность: **${accuracy}%**`,
      ``,

      `## 🗓️ За неделю`,
      `> Всего: **${weekTotal}**  •  Муты: **${weekMutes}**  •  Баны: **${weekBans}**`,
      `> Досрочно снятых: **${weekRemoved}**  •  Неверных: **${weekWrong}**`,
      `> Точность: **${weekAccuracy}%**`,
      ``,

      `## ⏱️ За последние 24 часа`,
      `> Всего: **${d24Total}**  •  Муты: **${d24Mutes}**  •  Баны: **${d24Bans}**`,
      `> Досрочно снятых: **${d24Removed}**  •  Неверных: **${d24Wrong}**`,
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

async function getModeratorStats(discordId) {
  const { data, error } = await supabase
    .from("moderator_statistics")
    .select("*")
    .eq("discord_id", discordId)
    .maybeSingle();

  if (error) {
  console.error("getModeratorStats error:", error);
  return null;
}
}

async function findExistingThread(client, member) {
  const forum = await client.channels.fetch(config.channels.forum);

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
      `❌ Ошибка сохранения модератора **${member.displayName}**: ${error.message}`
    );
    return false;
  }

  return true;
}

async function createModeratorCard(client, member) {
  const forum = await client.channels.fetch(config.channels.forum);

  if (!forum || forum.type !== ChannelType.GuildForum) {
    await logToChannel(client, "❌ Форум карточек модераторов не найден или это не форум.");
    return;
  }

  const { data: existing } = await supabase
    .from("moderators")
    .select("*")
    .eq("discord_id", member.id)
    .maybeSingle();

  const stats = await getModeratorStats(member.id);
  const components = [buildModeratorCardButtons(member.id)];

  if (existing?.forum_thread_id && existing?.forum_message_id) {
    try {
      const thread = await client.channels.fetch(existing.forum_thread_id);
      const msg = await thread.messages.fetch(existing.forum_message_id);

      await msg.edit({
        embeds: [buildModeratorCard(member, stats)],
        components,
      });

      if (thread.archived) await thread.setArchived(false);
      if (thread.name.startsWith("[СНЯТ]")) await thread.setName(member.displayName);

      const saved = await saveModeratorRecord(
        client,
        member,
        existing.forum_thread_id,
        existing.forum_message_id
      );

      if (!saved) return;

      await logToChannel(client, `♻️ Карточка модератора обновлена: **${member.displayName}**`);
      return;
    } catch {
      await logToChannel(
        client,
        `⚠️ Карточка была в базе, но не найдена в Discord. Создаю/ищу новую: **${member.displayName}**`
      );
    }
  }

  const existingThread = await findExistingThread(client, member);

  if (existingThread) {
    if (existingThread.archived) await existingThread.setArchived(false);
    if (existingThread.name.startsWith("[СНЯТ]")) {
      await existingThread.setName(member.displayName);
    }

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

    const saved = await saveModeratorRecord(client, member, existingThread.id, starterMessage.id);
    if (!saved) return;

    await logToChannel(client, `♻️ Найдена и привязана существующая карточка модератора: **${member.displayName}**`);
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

  const saved = await saveModeratorRecord(client, member, thread.id, starterMessage.id);
  if (!saved) return;

  await logToChannel(client, `✅ Создана карточка модератора: **${member.displayName}**`);
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
    await logToChannel(client, `❌ Ошибка снятия модератора **${member.displayName}**: ${error.message}`);
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

  await logToChannel(client, `🔴 Модератор снят: **${member.displayName}**`);
}

async function updateModeratorCard(client, discordId) {
  const { data: moderator } = await supabase
    .from("moderators")
    .select("*")
    .eq("discord_id", discordId)
    .maybeSingle();

  if (!moderator?.forum_thread_id || !moderator?.forum_message_id) return;

  const guild = await client.guilds.fetch(config.guildId);
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return;

  const stats = await getModeratorStats(discordId);

if (!stats) {
  await logToChannel(
    client,
    `⚠️ Статистика для <@${discordId}> не получена. Карточка не обновлена, чтобы не перезаписать её нулями.`
  );
  return;
}

const thread = await client.channels.fetch(moderator.forum_thread_id);
const message = await thread.messages.fetch(moderator.forum_message_id);

await message.edit({
  embeds: [buildModeratorCard(member, stats)],
  components: [buildModeratorCardButtons(discordId)],
});
}

module.exports = {
  createModeratorCard,
  archiveModeratorCard,
  updateModeratorCard,
};