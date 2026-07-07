require("dotenv").config();

module.exports = {
  discordToken: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,

  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,

  channels: {
    quark: process.env.QUARK_CHANNEL_ID,
    forum: process.env.FORUM_ID,
    botLogs: process.env.BOT_LOG_CHANNEL,
    punishLink: process.env.PUNISH_LINK_CHANNEL,
    proof: process.env.PROOF_CHANNEL,
    events: process.env.EVENTS_CHANNEL,
    proofStorage: process.env.PROOF_STORAGE_CHANNEL,
  },

  roles: {
    moderator: process.env.MODERATOR_ROLE,
    headModerator: process.env.HEAD_MOD_ROLE,
    assistantHeadModerator: process.env.ASSISTANT_HEAD_MOD_ROLE,
  },
};