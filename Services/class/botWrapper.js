const Queue = require("queue-promise");
const ChatwootClient = require("./chatwoot");

class BotWrapper {
  static botInstance = null;
  static queue = new Queue({
    concurrent: 1,
    interval: 500,
  });
  static chatwoot;

  /**
   * Inicializa el BotWrapper y configura ChatwootClient con las opciones dadas.
   * @param {Object} bot - La instancia del bot.
   * @param {Object} _options - Las opciones para configurar ChatwootClient.
   */
  static initialize(bot, _options = {}) {
    // Verifica si las opciones están vacías.
    if (Object.keys(_options).length === 0) {
      console.warn("\nLas opciones para ChatwootClient están vacías.");
      return;
    }

    this.botInstance = bot;
    this.chatwoot = new ChatwootClient(_options);

    // Registra un manejador de eventos si providerClass tiene un método "on".
    if (
      this.botInstance.providerClass &&
      typeof this.botInstance.providerClass.on === "function"
    ) {
      this.botInstance.providerClass.on("message", (data) => {
        this.queue.enqueue(async () => {
          try {
            const { from, body } = data;
            this.chatwoot.sendNotes(from, body, "incoming", false);
          } catch (error) {
            console.error("Error al procesar send_message:", error);
          }
        });
      });
    }

    // Si botInstance tiene un método "on", registra un manejador de eventos para enviar mensajes.
    if (this.botInstance && typeof this.botInstance.on === "function") {
      this.botInstance.on("send_message", (data) => {
        this.queue.enqueue(async () => {
          try {
            // Extrae datos del mensaje.
            const { numberOrId, answer } = data;
            // Envía notas a Chatwoot.
            this.chatwoot.sendNotes(numberOrId, answer, "outgoing", false);
          } catch (error) {
            console.error("Error al procesar send_message:", error);
          }
        });
      });
    }
  }
}

module.exports = BotWrapper;
