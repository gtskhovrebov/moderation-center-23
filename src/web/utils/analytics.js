const { calculateWeeklyReward } = require("../../services/rewardService");

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

const PERIODS = [
  "day",
  "yesterday",
  "week",
  "previous_week",
  "month",
  "previous_month",
  "year",
  "all",
  "custom",
];

const PERIOD_LABELS = {
  day: "Сегодня",
  yesterday: "Вчера",
  week: "Текущая неделя",
  previous_week: "Прошлая неделя",
  month: "Текущий месяц",
  previous_month: "Прошлый месяц",
  year: "Текущий год",
  all: "Всё время",
  custom: "Произвольный период",
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function getMoscowParts(date = new Date()) {
  const shifted = new Date(new Date(date).getTime() + MOSCOW_OFFSET_MS);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    weekday: shifted.getUTCDay(),
  };
}

function moscowDateToUtc(year, month, day, hour = 0, minute = 0, second = 0) {
  return new Date(
    Date.UTC(year, month - 1, day, hour - 3, minute, second, 0)
  );
}

function addCalendarDays(year, month, day, amount) {
  const value = new Date(Date.UTC(year, month - 1, day + amount));

  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

function addCalendarMonths(year, month, amount) {
  const value = new Date(Date.UTC(year, month - 1 + amount, 1));

  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: 1,
  };
}

function parseDateInput(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const test = new Date(Date.UTC(year, month - 1, day));

  if (
    test.getUTCFullYear() !== year ||
    test.getUTCMonth() + 1 !== month ||
    test.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function formatDateInput(date) {
  const parts = getMoscowParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function formatRuDate(date) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatPeriodTitle(period, start, end) {
  if (period === "all") return "За всё время";

  const inclusiveEnd = new Date(end.getTime() - 1);

  if (
    formatDateInput(start) === formatDateInput(inclusiveEnd)
  ) {
    return formatRuDate(start);
  }

  return `${formatRuDate(start)} — ${formatRuDate(inclusiveEnd)}`;
}

function getPeriodRange(period, options = {}) {
  const now = new Date();
  const current = getMoscowParts(now);

  const selectedDate =
    parseDateInput(options.date) || {
      year: current.year,
      month: current.month,
      day: current.day,
    };

  let start;
  let end;
  let previousStart;
  let previousEnd;

  if (period === "all") {
    return {
      period,
      start: null,
      end: null,
      previousStart: null,
      previousEnd: null,
      title: "За всё время",
      dateValue: formatDateInput(now),
      fromValue: "",
      toValue: "",
    };
  }

  if (period === "custom") {
    const from = parseDateInput(options.from);
    const to = parseDateInput(options.to);

    if (!from || !to) {
      return getPeriodRange("week", options);
    }

    const normalizedFrom = moscowDateToUtc(from.year, from.month, from.day);
    const nextTo = addCalendarDays(to.year, to.month, to.day, 1);
    const normalizedEnd = moscowDateToUtc(
      nextTo.year,
      nextTo.month,
      nextTo.day
    );

    if (normalizedFrom >= normalizedEnd) {
      return getPeriodRange("week", options);
    }

    const duration = normalizedEnd.getTime() - normalizedFrom.getTime();

    start = normalizedFrom;
    end = normalizedEnd;
    previousEnd = new Date(start);
    previousStart = new Date(start.getTime() - duration);

    return {
      period,
      start,
      end,
      previousStart,
      previousEnd,
      title: formatPeriodTitle(period, start, end),
      dateValue: formatDateInput(start),
      fromValue: options.from,
      toValue: options.to,
    };
  }

  if (period === "day" || period === "yesterday") {
    const offset = period === "yesterday" ? -1 : 0;
    const target = addCalendarDays(
      selectedDate.year,
      selectedDate.month,
      selectedDate.day,
      offset
    );
    const next = addCalendarDays(target.year, target.month, target.day, 1);
    const previous = addCalendarDays(
      target.year,
      target.month,
      target.day,
      -1
    );

    start = moscowDateToUtc(target.year, target.month, target.day);
    end = moscowDateToUtc(next.year, next.month, next.day);
    previousStart = moscowDateToUtc(
      previous.year,
      previous.month,
      previous.day
    );
    previousEnd = new Date(start);
  }

  if (period === "week" || period === "previous_week") {
    const selectedUtc = moscowDateToUtc(
      selectedDate.year,
      selectedDate.month,
      selectedDate.day
    );

    const weekday = getMoscowParts(selectedUtc).weekday;
    const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
    const additionalOffset = period === "previous_week" ? -7 : 0;

    const monday = addCalendarDays(
      selectedDate.year,
      selectedDate.month,
      selectedDate.day,
      -daysFromMonday + additionalOffset
    );

    const nextMonday = addCalendarDays(
      monday.year,
      monday.month,
      monday.day,
      7
    );

    const previousMonday = addCalendarDays(
      monday.year,
      monday.month,
      monday.day,
      -7
    );

    start = moscowDateToUtc(monday.year, monday.month, monday.day);
    end = moscowDateToUtc(
      nextMonday.year,
      nextMonday.month,
      nextMonday.day
    );
    previousStart = moscowDateToUtc(
      previousMonday.year,
      previousMonday.month,
      previousMonday.day
    );
    previousEnd = new Date(start);
  }

  if (period === "month" || period === "previous_month") {
    const monthOffset = period === "previous_month" ? -1 : 0;

    const targetMonth = addCalendarMonths(
      selectedDate.year,
      selectedDate.month,
      monthOffset
    );

    const nextMonth = addCalendarMonths(
      targetMonth.year,
      targetMonth.month,
      1
    );

    const previousMonth = addCalendarMonths(
      targetMonth.year,
      targetMonth.month,
      -1
    );

    start = moscowDateToUtc(targetMonth.year, targetMonth.month, 1);
    end = moscowDateToUtc(nextMonth.year, nextMonth.month, 1);
    previousStart = moscowDateToUtc(
      previousMonth.year,
      previousMonth.month,
      1
    );
    previousEnd = new Date(start);
  }

  if (period === "year") {
    start = moscowDateToUtc(selectedDate.year, 1, 1);
    end = moscowDateToUtc(selectedDate.year + 1, 1, 1);
    previousStart = moscowDateToUtc(selectedDate.year - 1, 1, 1);
    previousEnd = new Date(start);
  }

  return {
    period,
    start,
    end,
    previousStart,
    previousEnd,
    title: formatPeriodTitle(period, start, end),
    dateValue: `${selectedDate.year}-${pad(selectedDate.month)}-${pad(
      selectedDate.day
    )}`,
    fromValue: "",
    toValue: "",
  };
}

function isInRange(value, start, end) {
  if (!value) return false;
  if (!start && !end) return true;

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) return false;
  if (start && timestamp < start.getTime()) return false;
  if (end && timestamp >= end.getTime()) return false;

  return true;
}

function normalizeType(value) {
  return String(value || "").toLowerCase().trim();
}

function isMute(item) {
  return normalizeType(item.punishment_type) === "mute";
}

function isBan(item) {
  return normalizeType(item.punishment_type) === "ban";
}

function isWrong(item) {
  return item.review_status === "wrong";
}

function isRemoved(item) {
  return Boolean(item.removed) || item.review_status === "removed";
}

function hasProof(item) {
  return Number(item.proof_count || 0) > 0;
}

function accuracy(total, wrong) {
  total = Number(total || 0);
  wrong = Number(wrong || 0);

  if (total <= 0) return 100;

  return Math.max(
    0,
    Number((((total - wrong) / total) * 100).toFixed(2))
  );
}

function parseDurationMinutes(value) {
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  const raw = String(value).toLowerCase().trim();

  if (
    raw.includes("permanent") ||
    raw.includes("навсегда") ||
    raw.includes("пожизн")
  ) {
    return 0;
  }

  if (/^\d+(\.\d+)?$/.test(raw)) {
    return Math.max(0, Number(raw));
  }

  let minutes = 0;

  const units = [
    {
      regex: /(\d+(?:[.,]\d+)?)\s*(?:год|года|лет|year|years|y)\b/g,
      multiplier: 525600,
    },
    {
      regex: /(\d+(?:[.,]\d+)?)\s*(?:месяц|месяца|месяцев|month|months|mo)\b/g,
      multiplier: 43800,
    },
    {
      regex: /(\d+(?:[.,]\d+)?)\s*(?:недел|недели|недель|week|weeks|w)\b/g,
      multiplier: 10080,
    },
    {
      regex: /(\d+(?:[.,]\d+)?)\s*(?:день|дня|дней|day|days|d)\b/g,
      multiplier: 1440,
    },
    {
      regex: /(\d+(?:[.,]\d+)?)\s*(?:час|часа|часов|hour|hours|h)\b/g,
      multiplier: 60,
    },
    {
      regex: /(\d+(?:[.,]\d+)?)\s*(?:мин|минута|минуты|минут|minute|minutes|m)\b/g,
      multiplier: 1,
    },
  ];

  for (const unit of units) {
    let match;

    while ((match = unit.regex.exec(raw)) !== null) {
      minutes += Number(match[1].replace(",", ".")) * unit.multiplier;
    }
  }

  return Math.max(0, Math.round(minutes));
}

function isPermanentBan(item) {
  if (!isBan(item)) return false;

  const duration = String(item.duration || "").toLowerCase();

  return (
    duration.includes("permanent") ||
    duration.includes("навсегда") ||
    duration.includes("пожизн")
  );
}

function buildSummary(punishments, events) {
  const total = punishments.length;
  const mutes = punishments.filter(isMute);
  const bans = punishments.filter(isBan);
  const temporaryBans = bans.filter((item) => !isPermanentBan(item));
  const permanentBans = bans.filter(isPermanentBan);

  const wrong = punishments.filter(isWrong).length;
  const removed = punishments.filter(isRemoved).length;
  const withProofs = punishments.filter(hasProof).length;
  const withoutProofs = total - withProofs;

  const muteMinutes = mutes.reduce(
    (sum, item) => sum + parseDurationMinutes(item.duration),
    0
  );

  const banMinutes = temporaryBans.reduce(
    (sum, item) => sum + parseDurationMinutes(item.duration),
    0
  );

  return {
    totalPunishments: total,
    mutes: mutes.length,
    bans: bans.length,
    temporaryBans: temporaryBans.length,
    permanentBans: permanentBans.length,
    wrong,
    removed,
    withProofs,
    withoutProofs,
    events: events.length,
    accuracy: accuracy(total, wrong),
    muteMinutes,
    banMinutes,
    averageMuteMinutes: mutes.length
      ? Math.round(muteMinutes / mutes.length)
      : 0,
    averageBanMinutes: temporaryBans.length
      ? Math.round(banMinutes / temporaryBans.length)
      : 0,
  };
}

function percentChange(current, previous) {
  current = Number(current || 0);
  previous = Number(previous || 0);

  if (previous === 0) {
    if (current === 0) return 0;
    return null;
  }

  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function buildComparison(current, previous) {
  return {
    totalPunishments: percentChange(
      current.totalPunishments,
      previous.totalPunishments
    ),
    mutes: percentChange(current.mutes, previous.mutes),
    bans: percentChange(current.bans, previous.bans),
    wrong: percentChange(current.wrong, previous.wrong),
    removed: percentChange(current.removed, previous.removed),
    events: percentChange(current.events, previous.events),
    accuracyDifference: Number(
      (current.accuracy - previous.accuracy).toFixed(2)
    ),
  };
}

function getDateKey(value) {
  const parts = getMoscowParts(value);

  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function getDateLabel(value) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
  }).format(value);
}

function enumerateDates(start, end) {
  if (!start || !end) return [];

  const result = [];
  let cursor = new Date(start);

  while (cursor < end && result.length < 370) {
    result.push({
      key: getDateKey(cursor),
      label: getDateLabel(cursor),
    });

    const parts = getMoscowParts(cursor);
    const next = addCalendarDays(parts.year, parts.month, parts.day, 1);

    cursor = moscowDateToUtc(next.year, next.month, next.day);
  }

  return result;
}

function buildTimeline(punishments, events, range) {
  if (!range.start || !range.end) {
    const keys = new Set();

    punishments.forEach((item) => keys.add(getDateKey(item.created_at)));
    events.forEach((item) => keys.add(getDateKey(item.created_at)));

    return [...keys]
      .sort()
      .slice(-60)
      .map((key) => {
        const [year, month, day] = key.split("-").map(Number);
        const date = moscowDateToUtc(year, month, day);

        return {
          key,
          label: getDateLabel(date),
          punishments: punishments.filter(
            (item) => getDateKey(item.created_at) === key
          ).length,
          mutes: punishments.filter(
            (item) =>
              getDateKey(item.created_at) === key && isMute(item)
          ).length,
          bans: punishments.filter(
            (item) =>
              getDateKey(item.created_at) === key && isBan(item)
          ).length,
          events: events.filter(
            (item) => getDateKey(item.created_at) === key
          ).length,
        };
      });
  }

  return enumerateDates(range.start, range.end).map((date) => ({
    ...date,
    punishments: punishments.filter(
      (item) => getDateKey(item.created_at) === date.key
    ).length,
    mutes: punishments.filter(
      (item) =>
        getDateKey(item.created_at) === date.key && isMute(item)
    ).length,
    bans: punishments.filter(
      (item) =>
        getDateKey(item.created_at) === date.key && isBan(item)
    ).length,
    events: events.filter(
      (item) => getDateKey(item.created_at) === date.key
    ).length,
  }));
}

function buildHourly(punishments) {
  const result = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${pad(hour)}:00`,
    total: 0,
    mutes: 0,
    bans: 0,
  }));

  for (const item of punishments) {
    const hour = getMoscowParts(item.created_at).hour;

    result[hour].total += 1;

    if (isMute(item)) result[hour].mutes += 1;
    if (isBan(item)) result[hour].bans += 1;
  }

  return result;
}

function buildWeekdays(punishments, events) {
  const names = [
    "Воскресенье",
    "Понедельник",
    "Вторник",
    "Среда",
    "Четверг",
    "Пятница",
    "Суббота",
  ];

  const order = [1, 2, 3, 4, 5, 6, 0];

  return order.map((weekday) => ({
    weekday,
    label: names[weekday],
    punishments: punishments.filter(
      (item) => getMoscowParts(item.created_at).weekday === weekday
    ).length,
    events: events.filter(
      (item) => getMoscowParts(item.created_at).weekday === weekday
    ).length,
  }));
}

function buildModeratorStats(moderator, punishments, events) {
  const moderatorPunishments = punishments.filter(
    (item) =>
      String(item.moderator_discord_id) === String(moderator.discord_id)
  );

  const moderatorEvents = events.filter(
    (item) =>
      String(item.moderator_discord_id) === String(moderator.discord_id)
  );

  const summary = buildSummary(moderatorPunishments, moderatorEvents);

  const rewardInput = {
    punishments_7d: summary.totalPunishments,
    mutes_7d: summary.mutes,
    bans_7d: summary.bans,
    wrong_7d: summary.wrong,
    removed_7d: summary.removed,
    events_7d: summary.events,
    with_proofs: summary.withProofs,
    without_proofs: summary.withoutProofs,
    accuracy: summary.accuracy,
  };

  return {
    discord_id: moderator.discord_id,
    username: moderator.username,
    nickname: moderator.nickname,
    display_name: moderator.display_name,

    ...summary,

    activity: summary.totalPunishments + summary.events,

    punishments_7d: summary.totalPunishments,
    mutes_7d: summary.mutes,
    bans_7d: summary.bans,
    wrong_7d: summary.wrong,
    removed_7d: summary.removed,
    events_7d: summary.events,

    punishments_24h: summary.totalPunishments,
    events_24h: summary.events,

    total_punishments: summary.totalPunishments,
    total_mutes: summary.mutes,
    total_bans: summary.bans,
    wrong_punishments: summary.wrong,
    removed_punishments: summary.removed,
    events_total: summary.events,

    reward: calculateWeeklyReward(rewardInput),
  };
}

function buildAnalytics({
  moderators,
  punishments,
  events,
  range,
}) {
  const currentPunishments = punishments.filter((item) =>
    isInRange(item.created_at, range.start, range.end)
  );

  const currentEvents = events.filter((item) =>
    isInRange(item.created_at, range.start, range.end)
  );

  const previousPunishments =
    range.previousStart && range.previousEnd
      ? punishments.filter((item) =>
          isInRange(
            item.created_at,
            range.previousStart,
            range.previousEnd
          )
        )
      : [];

  const previousEvents =
    range.previousStart && range.previousEnd
      ? events.filter((item) =>
          isInRange(
            item.created_at,
            range.previousStart,
            range.previousEnd
          )
        )
      : [];

  const currentSummary = buildSummary(
    currentPunishments,
    currentEvents
  );

  const previousSummary = buildSummary(
    previousPunishments,
    previousEvents
  );

  const moderatorRows = (moderators || [])
    .map((moderator) =>
      buildModeratorStats(
        moderator,
        currentPunishments,
        currentEvents
      )
    )
    .sort(
      (a, b) =>
        b.activity - a.activity ||
        b.totalPunishments - a.totalPunishments
    );

  const activeModerators = moderatorRows.filter(
    (row) => row.activity > 0
  );

  currentSummary.activeModerators = activeModerators.length;
  currentSummary.averagePunishmentsPerActiveModerator =
    activeModerators.length
      ? Number(
          (
            currentSummary.totalPunishments /
            activeModerators.length
          ).toFixed(2)
        )
      : 0;

  currentSummary.averageEventsPerActiveModerator =
    activeModerators.length
      ? Number(
          (
            currentSummary.events /
            activeModerators.length
          ).toFixed(2)
        )
      : 0;

  return {
    summary: currentSummary,
    previousSummary,
    comparison: buildComparison(
      currentSummary,
      previousSummary
    ),
    moderators: moderatorRows,
    timeline: buildTimeline(
      currentPunishments,
      currentEvents,
      range
    ),
    hourly: buildHourly(currentPunishments),
    weekdays: buildWeekdays(
      currentPunishments,
      currentEvents
    ),
    punishments: currentPunishments,
    events: currentEvents,
  };
}

function formatMinutes(totalMinutes) {
  totalMinutes = Math.max(0, Math.round(Number(totalMinutes || 0)));

  const years = Math.floor(totalMinutes / 525600);
  const days = Math.floor((totalMinutes % 525600) / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const result = [];

  if (years) result.push(`${years} г.`);
  if (days) result.push(`${days} д.`);
  if (hours) result.push(`${hours} ч.`);
  if (minutes || !result.length) result.push(`${minutes} мин.`);

  return result.join(" ");
}

module.exports = {
  PERIODS,
  PERIOD_LABELS,
  getPeriodRange,
  isInRange,
  buildAnalytics,
  buildModeratorStats,
  formatMinutes,
  formatDateInput,
};
