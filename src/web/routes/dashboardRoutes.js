const express = require("express");
const supabase = require("../../config/supabase");
const { calculateWeeklyReward } = require("../../services/rewardService");

const router = express.Router();

function addReward(row) {
  return {
    ...row,
    reward: calculateWeeklyReward(row),
  };
}

router.get("/", (req, res) => {
  res.redirect("/dashboard");
});

router.get("/dashboard", async (req, res) => {
  const { data: stats, error } = await supabase
    .from("moderator_statistics")
    .select("*")
    .order("punishments_7d", { ascending: false });

  if (error) return res.status(500).send(`Supabase error: ${error.message}`);

  const moderators = (stats || []).map(addReward);

  const totals = moderators.reduce(
    (acc, m) => {
      acc.totalPunishments += Number(m.total_punishments || 0);
      acc.weekPunishments += Number(m.punishments_7d || 0);
      acc.dayPunishments += Number(m.punishments_24h || 0);
      acc.wrong += Number(m.wrong_punishments || 0);
      acc.events += Number(m.events_7d || 0);
      acc.reward += Number(m.reward.finalReward || 0);
      return acc;
    },
    {
      totalPunishments: 0,
      weekPunishments: 0,
      dayPunishments: 0,
      wrong: 0,
      events: 0,
      reward: 0,
    }
  );

  res.render("dashboard", {
    moderators,
    totals,
    updatedAt: new Date(),
  });
});

router.get("/moderators/:discordId", async (req, res) => {
  const { discordId } = req.params;

  const { data: stats, error } = await supabase
    .from("moderator_statistics")
    .select("*")
    .eq("discord_id", discordId)
    .maybeSingle();

  if (error || !stats) return res.status(404).send("Модератор не найден");

  const { data: punishments } = await supabase
    .from("punishments")
    .select("*")
    .eq("moderator_discord_id", discordId)
    .order("created_at", { ascending: false })
    .limit(25);

  const { data: events } = await supabase
    .from("moderator_events")
    .select("*")
    .eq("moderator_discord_id", discordId)
    .order("created_at", { ascending: false })
    .limit(15);

  res.render("moderator", {
    moderator: addReward(stats),
    punishments: punishments || [],
    events: events || [],
    updatedAt: new Date(),
  });
});

router.get("/rewards", async (req, res) => {
  const { data: stats, error } = await supabase
    .from("moderator_statistics")
    .select("*")
    .order("punishments_7d", { ascending: false });

  if (error) return res.status(500).send(`Supabase error: ${error.message}`);

  const moderators = (stats || []).map(addReward);

  res.render("rewards", {
    moderators,
    totalReward: moderators.reduce((sum, m) => sum + m.reward.finalReward, 0),
    updatedAt: new Date(),
  });
});

module.exports = router;