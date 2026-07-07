const config = require("../config/config");
const { createModeratorCard, archiveModeratorCard } = require("../services/cardService");

module.exports = async function guildMemberUpdate(client, oldMember, newMember) {
  const hadRole = oldMember.roles.cache.has(config.roles.moderator);
  const hasRole = newMember.roles.cache.has(config.roles.moderator);

  // Создаём карточку ТОЛЬКО когда роль реально появилась
  if (!hadRole && hasRole) {
    await createModeratorCard(client, newMember);
    return;
  }

  // Архивируем ТОЛЬКО когда роль реально сняли
  if (hadRole && !hasRole) {
    await archiveModeratorCard(client, newMember);
    return;
  }
};