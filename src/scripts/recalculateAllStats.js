require("dotenv").config();

const supabase = require("../config/supabase");
const { recalculateModeratorStatistics } = require("../services/statisticsRecalculateService");

async function main() {
  const { data, error } = await supabase
    .from("punishments")
    .select("moderator_discord_id")
    .not("moderator_discord_id", "is", null);

  if (error) throw error;

  const ids = [...new Set(data.map(x => x.moderator_discord_id).filter(Boolean))];

  console.log(`Найдено модераторов для пересчёта: ${ids.length}`);

  for (const id of ids) {
    console.log(`Пересчёт: ${id}`);
    await recalculateModeratorStatistics(id);
  }

  console.log("Готово.");
  process.exit(0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});