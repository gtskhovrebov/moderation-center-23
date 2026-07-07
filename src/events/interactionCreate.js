const { handleHistoryInteraction } = require("../services/historyService");
const { handleProofInteraction } = require("../services/proofService");
const { handleDetailsInteraction } = require("../services/detailsService");
const {
  searchPunishments,
  buildSearchEmbed,
  buildSearchButtons,
} = require("../services/searchPunishmentService");
const { buildStatsEmbed } = require("../services/statsService");

async function handleSlashCommand(interaction) {
  const command = interaction.commandName;

  if (command === "find") {
    await interaction.deferReply({ ephemeral: true });

    const query = interaction.options.getString("запрос", true);
    const { data, error } = await searchPunishments(query);

    if (error) {
      await interaction.editReply({
        content: `❌ Ошибка поиска: ${error.message}`,
      });
      return;
    }

    await interaction.editReply({
      embeds: [buildSearchEmbed(query, data || [])],
      components: buildSearchButtons(data || []),
    });
    return;
  }

  if (command === "mystats" || command === "stats") {
    await interaction.deferReply({ ephemeral: true });

    const target =
      command === "stats"
        ? interaction.options.getUser("модератор") || interaction.user
        : interaction.user;

    const embed = await buildStatsEmbed(target);

    if (!embed) {
      await interaction.editReply({
        content: "❌ Статистика не найдена.",
      });
      return;
    }

    await interaction.editReply({
      embeds: [embed],
    });
    return;
  }

  if (command === "history") {
    const target = interaction.options.getUser("модератор", true);

    interaction.customId = `moderator_history:${target.id}`;
    await handleHistoryInteraction(interaction);
    return;
  }

  await interaction.reply({
    content: `⚠️ Команда /${command} пока не подключена.`,
    ephemeral: true,
  });
}

module.exports = async function interactionCreate(client, interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
      return;
    }

    if (!interaction.isButton()) return;

    console.log("BUTTON:", interaction.customId);

    if (interaction.customId.startsWith("proof_")) {
      await handleProofInteraction(interaction);
      return;
    }

    if (
      interaction.customId.startsWith("moderator_history") ||
      interaction.customId.startsWith("history_")
    ) {
      await handleHistoryInteraction(interaction);
      return;
    }

    if (interaction.customId.startsWith("moderator_details")) {
      await handleDetailsInteraction(interaction);
      return;
    }

    await interaction.reply({
      content: `⚠️ Кнопка пока не подключена: \`${interaction.customId}\``,
      ephemeral: true,
    });
  } catch (error) {
    console.error("Interaction error:", error);

    if (error.code === 10062 || error.message?.includes("Unknown interaction")) {
      return;
    }

    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({
          content: `❌ Ошибка обработки: ${error.message}`,
          ephemeral: true,
        })
        .catch(() => null);
    } else {
      await interaction
        .editReply({
          content: `❌ Ошибка обработки: ${error.message}`,
        })
        .catch(() => null);
    }
  }
};