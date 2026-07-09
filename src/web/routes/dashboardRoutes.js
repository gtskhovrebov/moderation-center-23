const express = require("express");
const supabase = require("../../config/supabase");
const { calculateWeeklyReward } = require("../../services/rewardService");

const router = express.Router();

const PERIODS = ["day", "week", "month", "year", "all"];

function toMoscowDate(date) {
  return new Date(new Date(date).toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
}

function getPeriodKey(req) {
  const period = String(req.query.period || "week").toLowerCase();
  return PERIODS.includes(period) ? period : "week";
}

function isInPeriod(date, period) {
  if (!date) return false;
  if (period === "all") return true;

  const input = toMoscowDate(date);
  const now = toMoscowDate(new Date());

  const start = new Date(now);
  const end = new Date(now);

  if (period === "day") {
    start.setHours(0, 0, 0, 0);
    end.setHours(24, 0, 0, 0);
  }

  if (period === "week") {
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;

    start.setDate(now.getDate() - diffToMonday);
    start.setHours(0, 0, 0, 0);

    end.setTime(start.getTime());
    end.setDate(start.getDate() + 7);
  }

  if (period === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    end.setTime(start.getTime());
    end.setMonth(start.getMonth() + 1);
  }

  if (period === "year") {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);

    end.setTime(start.getTime());
    end.setFullYear(start.getFullYear() + 1);
  }

  return input >= start && input < end;
}

function countType(list, type) {
  return list.filter((p) => p.punishment_type === type).length;
}

function countWrong(list) {
  return list.filter((p) => p.review_status === "wrong").length;
}

function countRemoved(list) {
  return list.filter((p) => p.removed || p.review_status === "removed").length;
}

function accuracy(total, wrong) {
  total = Number(total || 0);
  wrong = Number(wrong || 0);
  if (total <= 0) return 100;
  return Math.max(0, Number((((total - wrong) / total) * 100).toFixed(2)));
}

function buildModeratorPeriodStats(moderator, punishments, events, period) {
  const p = punishments.filter(
    (item) => item.moderator_discord_id === moderator.discord_id && isInPeriod(item.created_at, period)
  );

  const e = events.filter(
    (item) => item.moderator_discord_id === moderator.discord_id && isInPeriod(item.created_at, period)
  );

  const wrong = countWrong(p);
  const removed = countRemoved(p);

  const row = {
    discord_id: moderator.discord_id,
    username: moderator.username,
    nickname: moderator.nickname,
    display_name: moderator.display_name,

    total_punishments: p.length,
    total_mutes: countType(p, "mute"),
    total_bans: countType(p, "ban"),
    wrong_punishments: wrong,
    removed_punishments: removed,

    events_total: e.length,

    with_proofs: p.filter((x) => Number(x.proof_count || 0) > 0).length,
    without_proofs: p.filter((x) => Number(x.proof_count || 0) <= 0).length,

    accuracy: accuracy(p.length, wrong),
  };

  return {
    ...row,

    // оставляем старые поля, чтобы rewardService не сломался
    punishments_7d: row.total_punishments,
    mutes_7d: row.total_mutes,
    bans_7d: row.total_bans,
    wrong_7d: row.wrong_punishments,
    removed_7d: row.removed_punishments,
    events_7d: row.events_total,

    punishments_24h: row.total_punishments,
    events_24h: row.events_total,

    reward: calculateWeeklyReward({
      ...row,
      punishments_7d: row.total_punishments,
      mutes_7d: row.total_mutes,
      bans_7d: row.total_bans,
      wrong_7d: row.wrong_punishments,
      removed_7d: row.removed_punishments,
      events_7d: row.events_total,
    }),
  };
}

function buildTotals(moderators) {
  return moderators.reduce(
    (acc, m) => {
      acc.totalPunishments += Number(m.total_punishments || 0);
      acc.mutes += Number(m.total_mutes || 0);
      acc.bans += Number(m.total_bans || 0);
      acc.wrong += Number(m.wrong_punishments || 0);
      acc.removed += Number(m.removed_punishments || 0);
      acc.events += Number(m.events_total || 0);
      acc.reward += Number(m.reward?.finalReward || 0);
      return acc;
    },
    {
      totalPunishments: 0,
      mutes: 0,
      bans: 0,
      wrong: 0,
      removed: 0,
      events: 0,
      reward: 0,
    }
  );
}

router.get("/", (req, res) => {
  res.redirect("/dashboard");
});

router.get("/dashboard", async (req, res) => {
  const period = getPeriodKey(req);

  const [{ data: moderatorsRaw, error: mError }, { data: punishmentsRaw, error: pError }, { data: eventsRaw, error: eError }] =
    await Promise.all([
      supabase.from("moderators").select("*").eq("is_active", true),
      supabase.from("punishments").select("*"),
      supabase.from("moderator_events").select("*"),
    ]);

  if (mError) return res.status(500).send(`Moderators error: ${mError.message}`);
  if (pError) return res.status(500).send(`Punishments error: ${pError.message}`);
  if (eError) return res.status(500).send(`Events error: ${eError.message}`);

  const punishments = punishmentsRaw || [];
  const events = eventsRaw || [];

  const moderators = (moderatorsRaw || [])
    .map((m) => buildModeratorPeriodStats(m, punishments, events, period))
    .sort((a, b) => {
      const aActivity = Number(a.total_punishments || 0) + Number(a.events_total || 0);
      const bActivity = Number(b.total_punishments || 0) + Number(b.events_total || 0);
      return bActivity - aActivity;
    });

  res.render("dashboard", {
    period,
    periods: PERIODS,
    moderators,
    totals: buildTotals(moderators),
    updatedAt: new Date(),
  });
});

router.get("/moderators/:discordId", async (req, res) => {
  const period = getPeriodKey(req);
  const { discordId } = req.params;

  const [{ data: moderator, error: mError }, { data: punishmentsRaw }, { data: eventsRaw }] =
    await Promise.all([
      supabase.from("moderators").select("*").eq("discord_id", discordId).maybeSingle(),
      supabase.from("punishments").select("*").eq("moderator_discord_id", discordId).order("created_at", { ascending: false }),
      supabase.from("moderator_events").select("*").eq("moderator_discord_id", discordId).order("created_at", { ascending: false }),
    ]);

  if (mError || !moderator) return res.status(404).send("Модератор не найден");

  const punishments = punishmentsRaw || [];
  const events = eventsRaw || [];

  const periodStats = buildModeratorPeriodStats(moderator, punishments, events, period);

  res.render("moderator", {
    period,
    periods: PERIODS,
    moderator: periodStats,
    punishments: punishments.filter((p) => isInPeriod(p.created_at, period)).slice(0, 50),
    events: events.filter((e) => isInPeriod(e.created_at, period)).slice(0, 30),
    updatedAt: new Date(),
  });
});

router.get("/rewards", async (req, res) => {
  const period = getPeriodKey(req);

  const [{ data: moderatorsRaw, error: mError }, { data: punishmentsRaw, error: pError }, { data: eventsRaw, error: eError }] =
    await Promise.all([
      supabase.from("moderators").select("*").eq("is_active", true),
      supabase.from("punishments").select("*"),
      supabase.from("moderator_events").select("*"),
    ]);

  if (mError) return res.status(500).send(`Moderators error: ${mError.message}`);
  if (pError) return res.status(500).send(`Punishments error: ${pError.message}`);
  if (eError) return res.status(500).send(`Events error: ${eError.message}`);

  const moderators = (moderatorsRaw || [])
    .map((m) => buildModeratorPeriodStats(m, punishmentsRaw || [], eventsRaw || [], period))
    .sort((a, b) => b.reward.finalReward - a.reward.finalReward);

  res.render("rewards", {
    period,
    periods: PERIODS,
    moderators,
    totalReward: moderators.reduce((sum, m) => sum + Number(m.reward.finalReward || 0), 0),
    updatedAt: new Date(),
  });
});

module.exports = router;