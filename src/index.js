const interactionCreate = require("./events/interactionCreate");
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const config = require("./config/config");
const ready = require("./events/ready");
const guildMemberUpdate = require("./events/guildMemberUpdate");
const messageCreate = require("./events/messageCreate");

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

client.once("ready", () => ready(client));

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