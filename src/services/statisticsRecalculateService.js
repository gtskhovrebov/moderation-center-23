const supabase = require("../config/supabase");

function isInRange(date, hours) {
  if (!date) return false;
  return new Date(date).getTime() >= Date.now() - hours * 60 * 60 * 1000;
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

  const p24 = list.filter((p) => isInRange(p.created_at, 24));
  const p7d = list.filter((p) => isInRange(p.created_at, 24 * 7));

  const countType = (arr, type) =>
    arr.filter((p) => p.punishment_type === type).length;

  const countWrong = (arr) =>
    arr.filter((p) => p.review_status === "wrong").length;

  const countRemoved = (arr) =>
    arr.filter((p) => p.removed || p.review_status === "removed").length;

  const withProofs = list.filter((p) => Number(p.proof_count || 0) > 0).length;
  const withoutProofs = list.filter((p) => Number(p.proof_count || 0) <= 0).length;

  const totalPunishments = list.length;
  const wrongPunishments = countWrong(list);

  const { data: moderator } = await supabase
    .from("moderators")
    .select("*")
    .eq("discord_id", discordId)
    .maybeSingle();

  await supabase.from("moderator_statistics").upsert(
    {
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

      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "discord_id",
    }
  );
}

module.exports = {
  recalculateModeratorStatistics,
};