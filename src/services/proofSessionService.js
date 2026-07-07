const supabase = require("../config/supabase");

async function getPunishmentByQuarkId(quarkPunishmentId) {
  const { data, error } = await supabase
    .from("punishments")
    .select("*")
    .eq("quark_punishment_id", quarkPunishmentId)
    .maybeSingle();

  return { data, error };
}

async function getActiveSessionByPunishment(punishmentId) {
  const { data, error } = await supabase
    .from("proof_upload_sessions")
    .select("*")
    .eq("punishment_id", punishmentId)
    .eq("status", "active")
    .maybeSingle();

  return { data, error };
}

async function createProofSession({ punishment, userId, mode }) {
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("proof_upload_sessions")
    .insert({
      punishment_id: punishment.id,
      quark_punishment_id: punishment.quark_punishment_id,
      moderator_discord_id: punishment.moderator_discord_id,
      mode,
      status: "active",
      created_by: userId,
      expires_at: expiresAt,
    })
    .select("*")
    .single();

  return { data, error };
}

async function closeProofSession(sessionId, status = "closed") {
  const { error } = await supabase
    .from("proof_upload_sessions")
    .update({
      status,
      closed_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  return { error };
}

async function findActiveSessionForMessage(authorId) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("proof_upload_sessions")
    .select("*")
    .eq("created_by", authorId)
    .eq("status", "active")
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data, error };
}

module.exports = {
  getPunishmentByQuarkId,
  getActiveSessionByPunishment,
  createProofSession,
  closeProofSession,
  findActiveSessionForMessage,
};