const express = require("express");
const supabase = require("../../config/supabase");

const {
  PERIODS,
  PERIOD_LABELS,
  getPeriodRange,
  buildAnalytics,
  buildModeratorStats,
  isInRange,
  formatMinutes,
} = require("../utils/analytics");

const router = express.Router();

function getPeriod(req) {
  const value = String(req.query.period || "week").toLowerCase();
  return PERIODS.includes(value) ? value : "week";
}

function getRange(req) {
  const period = getPeriod(req);

  return getPeriodRange(period, {
    date: req.query.date,
    from: req.query.from,
    to: req.query.to,
  });
}

function getPeriodTitle(period, range) {
  const titles = {
    day: "Сегодня",
    yesterday: "Вчера",
    week: "Текущая неделя",
    previous_week: "Прошлая неделя",
    month: "Текущий месяц",
    previous_month: "Прошлый месяц",
    year: "Текущий год",
    all: "За всё время",
    custom: range?.title || "Выбранный диапазон",
  };

  return titles[period] || range?.title || "Текущая неделя";
}

async function loadAllData() {
  const [
    { data: moderators, error: moderatorsError },
    { data: punishments, error: punishmentsError },
    { data: events, error: eventsError },
  ] = await Promise.all([
    supabase
      .from("moderators")
      .select("*")
      .eq("is_active", true),

    supabase
      .from("punishments")
      .select("*")
      .order("created_at", { ascending: true }),

    supabase
      .from("moderator_events")
      .select("*")
      .order("created_at", { ascending: true }),
  ]);

  if (moderatorsError) throw moderatorsError;
  if (punishmentsError) throw punishmentsError;
  if (eventsError) throw eventsError;

  return {
    moderators: moderators || [],
    punishments: punishments || [],
    events: events || [],
  };
}

router.get("/", (req, res) => {
  res.redirect("/dashboard");
});

router.get("/dashboard", async (req, res) => {
  try {
    const period = getPeriod(req);
    const range = getRange(req);
    const data = await loadAllData();

    const analytics = buildAnalytics({
      ...data,
      range,
    });

    res.render("dashboard", {
      period,
      periods: PERIODS,
      periodLabels: PERIOD_LABELS,
      range,
      ...analytics,
      formatMinutes,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error("Dashboard error:", error);

    res
      .status(500)
      .send(`Ошибка загрузки панели: ${error.message}`);
  }
});

router.get("/moderators/:discordId", async (req, res) => {
  try {
    const period = getPeriod(req);
    const range = getRange(req);
    const { discordId } = req.params;

    const [
      { data: moderator, error: moderatorError },
      { data: punishments, error: punishmentsError },
      { data: events, error: eventsError },
    ] = await Promise.all([
      supabase
        .from("moderators")
        .select("*")
        .eq("discord_id", discordId)
        .maybeSingle(),

      supabase
        .from("punishments")
        .select("*")
        .eq("moderator_discord_id", discordId)
        .order("created_at", { ascending: false }),

      supabase
        .from("moderator_events")
        .select("*")
        .eq("moderator_discord_id", discordId)
        .order("created_at", { ascending: false }),
    ]);

    if (moderatorError || !moderator) {
      return res.status(404).send("Модератор не найден");
    }

    if (punishmentsError) throw punishmentsError;
    if (eventsError) throw eventsError;

    const filteredPunishments = (punishments || []).filter((item) =>
      isInRange(item.created_at, range.start, range.end)
    );

    const filteredEvents = (events || []).filter((item) =>
      isInRange(item.created_at, range.start, range.end)
    );

    const moderatorStats = buildModeratorStats(
      moderator,
      filteredPunishments,
      filteredEvents
    );

    res.render("moderator", {
      period,
      periods: PERIODS,
      periodLabels: PERIOD_LABELS,
      range,
      moderator: moderatorStats,
      punishments: filteredPunishments.slice(0, 100),
      events: filteredEvents.slice(0, 50),
      formatMinutes,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error("Moderator page error:", error);

    res
      .status(500)
      .send(`Ошибка загрузки модератора: ${error.message}`);
  }
});

router.get("/rewards", async (req, res) => {
  try {
    const period = getPeriod(req);
    const range = getRange(req);
    const data = await loadAllData();

    const analytics = buildAnalytics({
      ...data,
      range,
    });

    const moderators = analytics.moderators
      .slice()
      .sort(
        (a, b) =>
          Number(b.reward?.finalReward || 0) -
          Number(a.reward?.finalReward || 0)
      );

    res.render("rewards", {
      period,
      periods: PERIODS,
      periodLabels: PERIOD_LABELS,
      periodTitle: getPeriodTitle(period, range),
      range,
      moderators,
      totalReward: moderators.reduce(
        (sum, moderator) =>
          sum + Number(moderator.reward?.finalReward || 0),
        0
      ),
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error("Rewards page error:", error);

    res
      .status(500)
      .send(`Ошибка загрузки выплат: ${error.message}`);
  }
});

module.exports = router;
