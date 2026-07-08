const interactionCreate = require("./events/interactionCreate");
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const config = require("./config/config");
const ready = require("./events/ready");
const guildMemberUpdate = require("./events/guildMemberUpdate");
const messageCreate = require("./events/messageCreate");
const { refreshAllModeratorCards } = require("./services/cardService");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.GuildMember,
  ],
});

client.once("ready", async () => {
  await ready(client);

  console.log("♻️ Автообновление карточек включено: каждые 60 секунд");

  setInterval(async () => {
    try {
      await refreshAllModeratorCards(client);
    } catch (error) {
      console.error("Auto refresh cards error:", error);
    }
  }, 60 * 1000);
});

client.on("guildMemberUpdate", (oldMember, newMember) =>
  guildMemberUpdate(client, oldMember, newMember)
);

client.on("messageCreate", (message) =>
  messageCreate(client, message)
);

client.on("interactionCreate", (interaction) =>
  interactionCreate(client, interaction)
);

client.login(config.discordToken);