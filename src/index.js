const BotWrapper = require("./wrapper.class");
/**
 * Crear 
 * @param {*} args
 * @returns
 */
const createDashboard = async (chatwootEnvs = {}, botInstance = null) => {
    if (!botInstance) throw new Error('NOT_BOT_INSTANCE')
    return BotWrapper.initialize(botInstance, {
        CHATWOOT_URL: "",
        CHATWOOT_ID: "",
        CHATWOOT_INBOX_ID: "",
        CHATWOOT_API_ACCESS_TOKEN: "",
        ...chatwootEnvs
    });
}

module.exports = { createDashboard }