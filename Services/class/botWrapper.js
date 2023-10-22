const { EventEmitter } = require("events");
const Queue = require("queue-promise");
const ChatwootClient = require("./chatwoot");

// Clase que envuelve las funcionalidades del bot.
class BotWrapper {
  static botInstance = null; // Instancia única del bot.
  static chatwoot = null; // Cliente para la interacción con Chatwoot.
  static events = new EventEmitter(); // Emisor de eventos para la cola de mensajes.

  // Cola de mensajes que se procesarán de forma secuencial.
  static queue = new Queue({
    concurrent: 1, // Asegura el procesamiento de un mensaje a la vez.
    interval: 200, // Intervalo entre cada procesamiento.
  });

  // Método para manejar los mensajes entrantes y emitir un evento.
  static async handleMessage(data) {
    try {
      // Emitir un evento para procesar el mensaje entrante.
      this.events.emit("message_para_chatwoot_user", data);
    } catch (error) {
      console.error("Error al procesar mensaje entrante:", error);
    }
  }

  // Método para manejar los mensajes salientes y emitir un evento.
  static async handleSendMessage(data) {
    try {
      // Emitir un evento para procesar el mensaje saliente.
      this.events.emit("send_message_Bot", data);
    } catch (error) {
      console.error("Error al procesar mensaje saliente:", error);
    }
  }

  // Método para procesar un mensaje entrante en la cola y enviarlo a Chatwoot.
  static async processIncomingMessage(data) {
    const { from, body, caption, pushName, url } = data;
    const token = this.botInstance.providerClass.jwtToken;
    try {
      if (body.includes("_event_")) {
        await this.chatwoot.sendMessageWithAttachments(
          from,
          caption,
          [url],
          "incoming",
          false,
          token
        );
      } else {
        await this.chatwoot.sendNotes(from, body, "incoming", false, pushName);
      }
    } catch (error) {
      console.error("Error al procesar mensaje de la cola entrante:", error);
    }
  }

  // Método para procesar un mensaje saliente en la cola y enviarlo a Chatwoot.
  static async processOutgoingMessage(data) {
    const { numberOrId, answer, ctxMessage } = data;
    const Url_Adjunto = ctxMessage?.options?.media;
    try {
      if (Url_Adjunto) {
        await this.chatwoot.sendMessageWithAttachments(
          numberOrId,
          answer,
          [Url_Adjunto],
          "outgoing",
          false
        );
      } else {
        await this.chatwoot.sendNotes(numberOrId, answer, "outgoing", false);
      }
    } catch (error) {
      console.error("Error al procesar mensaje de la cola saliente:", error);
    }
  }

  // Método para inicializar la clase, configurando listeners y preparando la interacción con Chatwoot.
  static initialize(bot, _options = {}) {
    // Verifica si se pasaron opciones para el cliente de Chatwoot.
    if (Object.keys(_options).length === 0) {
      console.warn("\nLas opciones para ChatwootClient están vacías.");
      return;
    }

    this.botInstance = bot;
    this.chatwoot = new ChatwootClient(_options);

    // Configura el escuchador para mensajes entrantes del bot.
    if (
      this.botInstance.providerClass &&
      typeof this.botInstance.providerClass.on === "function"
    ) {
      this.botInstance.providerClass.on("message", (data) => {
        this.handleMessage(data);
      });
    }

    // Configura el escuchador para mensajes salientes del bot.
    if (this.botInstance && typeof this.botInstance.on === "function") {
      this.botInstance.on("send_message", async (data) => {
        const { numberOrId } = data;

        const getAttributes = await this.chatwoot.getAttributes(numberOrId);

        if (getAttributes === "Off") {
          this.botInstance.dynamicBlacklist.addToBlacklist(numberOrId);
          return;
        } else if (getAttributes === "On") {
          this.handleSendMessage(data);
          return;
        }
      });
    }

    // Escucha y procesa los eventos de mensajes entrantes, añadiendo tareas a la cola.
    this.events.on("message_para_chatwoot_user", (data) => {
      this.queue.enqueue(() => this.processIncomingMessage(data));
    });

    // Escucha y procesa los eventos de mensajes salientes, añadiendo tareas a la cola.
    this.events.on("send_message_Bot", (data) => {
      this.queue.enqueue(() => this.processOutgoingMessage(data));
    });
  }
}

// Exporta la clase para que otros módulos puedan usarla.
module.exports = BotWrapper;
