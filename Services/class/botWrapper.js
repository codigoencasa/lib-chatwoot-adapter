// Importaciones de módulos
const { EventEmitter } = require("events");
const Queue = require("queue-promise");
const express = require("express");
const bodyParser = require("body-parser");
const ChatwootClient = require("./chatwoot");

// Clase que envuelve las funcionalidades del bot
class BotWrapper {
  static botInstance = null;
  static chatwoot = null;
  static events = new EventEmitter();
  static queue = new Queue({
    concurrent: 1,
    interval: 200,
  });

  /**
   * Inicializa el bot y establece las configuraciones de Chatwoot.
   *
   * @param {Object} bot - Instancia del bot a envolver.
   * @param {Object} [_options={}] - Opciones de configuración para ChatwootClient.
   */
  static async initialize(bot, _options = {}) {
    if (Object.keys(_options).length === 0) {
      console.warn("\nLas opciones para ChatwootClient están vacías.");
      return;
    }

    this.botInstance = bot;
    this.chatwoot = new ChatwootClient(_options);
    this.setUpBotListeners();
    this.setUpEventListeners();
    this.startServer(_options.port || 3004);

    // Verificar y crear el atributo personalizado si es necesario.
    await this.checkAndCreateAttribute();
  }

  /**
   * Configura los listeners del bot para procesar mensajes.
   */
  static setUpBotListeners() {
    if (
      this.botInstance.providerClass &&
      typeof this.botInstance.providerClass.on === "function"
    ) {
      this.botInstance.providerClass.on("message", async (data) => {
        await this.handleMessage(data);
      });
    }

    if (this.botInstance && typeof this.botInstance.on === "function") {
      this.botInstance.on("send_message", async (data) => {
        await this.handleSendMessage(data);
      });
    }
  }

  /**
   * Configura los listeners de eventos personalizados.
   */
  static setUpEventListeners() {
    this.events.on("message_para_chatwoot_user", (data) => {
      this.queue.enqueue(() => this.processIncomingMessage(data));
    });
    this.events.on("send_message_Bot", (data) => {
      this.queue.enqueue(() => this.processOutgoingMessage(data));
    });
  }

  /**
   * Maneja eventos relacionados con el agente.
   *
   * @param {Object} data - Datos del evento del agente.
   */
  static async handleAgentEvent(data) {
    try {
      this.events.emit("agent_event", data);
    } catch (error) {
      console.error("Error al procesar evento del agente:", error);
    }
  }

  /**
   * Procesa y emite un evento para mensajes entrantes del user.
   *
   * @param {Object} data - Datos del mensaje entrante del user.
   */
  static async handleMessage(data) {
    try {
      this.events.emit("message_para_chatwoot_user", data);
    } catch (error) {
      console.error("Error al procesar mensaje entrante:", error);
    }
  }

  /**
   * Procesa y emite un evento para mensajes salientes del bot.
   *
   * @param {Object} data - Datos del mensaje saliente del bot.
   */
  static async handleSendMessage(data) {
    try {
      this.events.emit("send_message_Bot", data);
    } catch (error) {
      console.error("Error al procesar mensaje saliente:", error);
    }
  }

  /**
   * Verifica la existencia de un atributo y lo crea si no está presente.
   */
  static async checkAndCreateAttribute() {
    try {
      const attributeExists = await this.chatwoot.isAttributeCreated();
      if (!attributeExists) {
        await this.chatwoot.createAttributes();
      }
    } catch (error) {
      console.error("Error al verificar o crear el atributo:", error);
    }
  }

  /**
   * Procesa mensajes entrantes, decide si enviar una nota o un mensaje con adjunto.
   *
   * @param {Object} data - Datos del mensaje entrante del user.
   */
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

  /**
   * Procesa mensajes salientes, decide si enviar una nota o un mensaje con adjunto del bot.
   *
   * @param {Object} data - Datos del mensaje saliente del bot.
   */
  static async processOutgoingMessage(data) {
    const { numberOrId, answer, ctxMessage } = data;
    const getAttributes = await this.chatwoot.getAttributes(numberOrId);
    const getBlacklistSnapshot =
      await this.botInstance.dynamicBlacklist.getBlacklistSnapshot();

    if (getAttributes === "On") {
      // Al encender el servidor, verificar si el número está en la lista negra
      if (getBlacklistSnapshot.includes(numberOrId)) {
        await this.botInstance.dynamicBlacklist.removeFromBlacklist(numberOrId);
        console.log("Número eliminado. Verifica el archivo JSON nuevamente.");
      }
    }

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

  /**
   * Inicia un servidor Express para manejar webhooks.
   *
   * @param {number} port - Puerto en el que se iniciará el servidor.
   */
  static startServer(port) {
    const app = express();
    app.use(bodyParser.json());
    app.post("/webhook-endpoint", (req, res) => {
      BotWrapper.handleAgentEvent(req.body);
      res.status(200).send("Evento del agente recibido.");
    });
    app.listen(port, () =>
      console.log(`Servidor escuchando en el puerto ${port}`)
    );
  }
}

module.exports = BotWrapper;
