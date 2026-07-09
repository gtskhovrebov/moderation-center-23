const supabase = require("../config/supabase");

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

function isThisWeekMoscow(date) {
  if (!date) return false;

  const nowMoscow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" })
  );

  const day = nowMoscow.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;

  const monday = new Date(nowMoscow);
  monday.setDate(nowMoscow.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);

  const inputMoscow = new Date(
    new Date(date).toLocaleString("en-US", { timeZone: "Europe/Moscow" })
  );

  return inputMoscow >= monday && inputMoscow < nextMonday;
}

function accuracy(total, wrong) {
  total = Number(total || 0);
  wrong = Number(wrong || 0);
  if (total <= 0) return 100;
  return Number((((total - wrong) / total) * 100).toFixed(2));
}

async function recalculateModeratorStatistics(discordId) {
  if (!discordId) return;

  const { data: punishments, error } = await supabase
    .from("punishments")
    .select("*")
    .eq("moderator_discord_id", discordId);

  if (error) throw error;

  const list = punishments || [];

  const p24 = list.filter((p) => isTodayMoscow(p.created_at));
  const p7d = list.filter((p) => isThisWeekMoscow(p.created_at));

  const countType = (arr, type) =>
    arr.filter((p) => p.punishment_type === type).length;

  const countWrong = (arr) =>
    arr.filter((p) => p.review_status === "wrong").length;

  const countRemoved = (arr) =>
    arr.filter((p) => p.removed || p.review_status === "removed").length;

  const withProofs = list.filter((p) => Number(p.proof_count || 0) > 0).length;
  const withoutProofs = list.filter((p) => Number(p.proof_count || 0) <= 0).length;

  const { data: moderator } = await supabase
    .from("moderators")
    .select("*")
    .eq("discord_id", discordId)
    .maybeSingle();

  const totalPunishments = list.length;
  const wrongPunishments = countWrong(list);

  const payload = {
    discord_id: discordId,

    username: moderator?.username || null,
    display_name: moderator?.display_name || moderator?.nickname || null,

    total_punishments: totalPunishments,
    total_mutes: countType(list, "mute"),
    total_bans: countType(list, "ban"),

    wrong_punishments: wrongPunishments,
    removed_punishments: countRemoved(list),

    punishments_24h: p24.length,
    mutes_24h: countType(p24, "mute"),
    bans_24h: countType(p24, "ban"),
    wrong_24h: countWrong(p24),
    removed_24h: countRemoved(p24),

    punishments_7d: p7d.length,
    mutes_7d: countType(p7d, "mute"),
    bans_7d: countType(p7d, "ban"),
    wrong_7d: countWrong(p7d),
    removed_7d: countRemoved(p7d),

    with_proofs: withProofs,
    without_proofs: withoutProofs,

    accuracy: accuracy(totalPunishments, wrongPunishments),
  };

  const { error: upsertError } = await supabase
    .from("moderator_statistics")
    .upsert(payload, { onConflict: "discord_id" });

  if (upsertError) throw upsertError;

  return payload;
}

module.exports = {
  recalculateModeratorStatistics,
};