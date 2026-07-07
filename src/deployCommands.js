require("dotenv").config();

const {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("find")
    .setDescription("Найти наказание по нику, Discord ID, упоминанию или ID наказания")
    .addStringOption((option) =>
      option
        .setName("запрос")
        .setDescription("Ник, Discord ID, упоминание, причина или ID наказания")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("mystats")
    .setDescription("Показать вашу личную статистику модератора"),

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Показать статистику модератора")
    .addUserOption((option) =>
      option
        .setName("модератор")
        .setDescription("Модератор, чью статистику нужно посмотреть")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("history")
    .setDescription("Показать историю наказаний модератора")
    .addUserOption((option) =>
      option
        .setName("модератор")
        .setDescription("Модератор, чью историю нужно открыть")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Показать рейтинг модераторов за неделю"),

  new SlashCommandBuilder()
    .setName("events")
    .setDescription("Показать мероприятия модератора")
    .addUserOption((option) =>
      option
        .setName("модератор")
        .setDescription("Модератор")
        .setRequired(false)
    ),
].map((command) => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function deployCommands() {
  try {
    console.log("🔄 Регистрирую slash-команды...");

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log("✅ Slash-команды успешно зарегистрированы.");
  } catch (error) {
    console.error("❌ Ошибка регистрации slash-команд:", error);
  }
}

deployCommands();