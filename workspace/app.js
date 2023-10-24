const {
    createBot,
    createProvider,
    createFlow,
    addKeyword,
  } = require("@bot-whatsapp/bot");
  const MetaProvider = require("@bot-whatsapp/provider/meta");
  const MockAdapter = require("@bot-whatsapp/database/mock");
const { createDashboard } = require("../src");
  
const  flowPrincipal = addKeyword('hola').addAnswer('buenas!')
  
  const main = async () => {
    const adapterDB = new MockAdapter();
    const adapterFlow = createFlow([flowPrincipal]);
  
    const adapterProvider = createProvider(MetaProvider, {
      jwtToken: "",
      numberId: "",
      verifyToken: "",
      version: "",
    });
  
    const BotCreate = await createBot({
      flow: adapterFlow,
      provider: adapterProvider,
      database: adapterDB,
    });
  
    createDashboard({
        CHATWOOT_URL: "",
        CHATWOOT_ID: "",
        CHATWOOT_INBOX_ID: "",
        CHATWOOT_API_ACCESS_TOKEN: "",
      }, BotCreate)

  };
  
  main();