const axios = require("axios");
const FormData = require("form-data");
const Queue = require("queue-promise");
const mime = require("mime");

class ChatwootClient {
  static locks = {};
  static queue = new Queue({
    concurrent: 1,
    interval: 100,
  });

  /**
   * Constructor para inicializar el cliente de Chatwoot.
   * @param {Object} _options - Opciones para configurar ChatwootClient.
   */
  constructor(_options = {}) {
    this.chatwootURL = _options.CHATWOOT_URL;
    this.idChatwoot = _options.CHATWOOT_ID;
    this.inboxID = _options.CHATWOOT_INBOX_ID;
    this.apiAccessToken = _options.CHATWOOT_API_ACCESS_TOKEN;
  }

  /**
   * Enfila la solicitud HTTP en la cola y espera su procesamiento.
   *
   * @param {string} endpoint - El endpoint de la API a llamar.
   * @param {Object} [options={}] - Opciones adicionales para la petición axios.
   * @returns {Promise<Object>} Resuelve con la respuesta de la API o rechaza con un error.
   */
  async _enqueueRequest(endpoint, options = {}) {
    return new Promise((resolve, reject) => {
      // Añade una función asincrónica a la cola.
      // Esta función realiza la solicitud HTTP y resuelve o rechaza la promesa externa.
      ChatwootClient.queue.enqueue(async () => {
        try {
          const response = await axios({
            ...options,
            url: `${this.chatwootURL}/${this.idChatwoot}${endpoint}`,
            headers: {
              api_access_token: this.apiAccessToken,
              "Content-Type": "application/json",
              ...options.headers,
            },
          });
          resolve(response.data);
        } catch (error) {
          // Loguea el error y rechaza la promesa externa con el mensaje de error.
          console.error(
            "Error details:",
            error.response?.data || error.message
          );
          reject(new Error(error.message));
        }
      });
    });
  }

  /**
   * Realiza una solicitud HTTP al servidor de Chatwoot.
   *
   * @param {string} endpoint - El endpoint de la API a llamar.
   * @param {Object} [options={}] - Opciones adicionales para la petición axios.
   * @returns {Promise<Object>} Resuelve con la respuesta de la API o rechaza con un error.
   */
  async _request(endpoint, options = {}) {
    // Encola la petición y espera su procesamiento.
    return this._enqueueRequest(endpoint, options);
  }

  /**
   * Obtiene el ID de usuario de Chatwoot basado en el número de teléfono.
   * @param {string} userPhone - Número de teléfono del usuario.
   */
  async getUserID(userPhone) {
    const data = await this._request(`/contacts/search`, {
      params: { q: `+${userPhone}` },
    });
    const contact = data.payload[0];
    if (!contact) {
      return false;
    }
    return contact.id;
  }

  /**
   * Obtiene los atributos personalizados del usuario en Chatwoot.
   * @param {string} userPhone - Número de teléfono del usuario.
   */
  async getAttributes(userPhone) {
    const data = await this._request(`/contacts/search`, {
      params: { q: `+${userPhone}` },
    });
    const contact = data.payload[0];
    if (!contact) {
      return false;
    }
    if (
      !contact.custom_attributes ||
      !contact.custom_attributes.funciones_del_bot
    ) {
      return false;
    }
    const attributeValue = contact.custom_attributes.funciones_del_bot;

    return String(attributeValue);
  }

  /**
   * Establece los atributos personalizados del usuario en Chatwoot.
   * @param {string} userPhone - Número de teléfono del usuario.
   * @param {string} field - Campo a actualizar.
   * @param {Object} attributes - Atributos a establecer.
   */
  async setAttributes(userPhone, field, attributes) {
    const userID = await this.getUserID(userPhone);
    await this._request(`/contacts/${userID}`, {
      method: "PUT",
      data: { custom_attributes: { [field]: attributes } },
    });
    return true;
  }

  /**
   * Obtiene el ID de conversación de Chatwoot para un usuario.
   * @param {string} userID - ID de usuario en Chatwoot.
   */
  async getConversationID(userID) {
    const data = await this._request(`/contacts/${userID}/conversations`);
    const conversations = data.payload[0]?.messages;
    if (!conversations || conversations.length === 0) {
      return false;
    }
    const conversation = conversations.find((c) => c.inbox_id == this.inboxID);
    if (!conversation) {
      throw new Error(`No conversation found with inbox_id ${this.inboxID}`);
    }
    return conversation.conversation_id;
  }

  /**
   * Verifica si el atributo personalizado "Funciones del Bot" ya está creado en la cuenta especificada.
   *
   * @param {integer} account_id - El ID numérico de la cuenta donde se verificará la existencia del atributo.
   * @returns {boolean} - Retorna true si el atributo ya existe, de lo contrario, retorna false.
   */
  async isAttributeCreated() {
    const targetAttributeKey = "funciones_del_bot";

    const response = await this._request(`/custom_attribute_definitions`, {
      method: "GET",
    });

    if (response && response.length > 0) {
      for (let attribute of response) {
        if (attribute.attribute_key === targetAttributeKey) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Crea un nuevo atributo personalizado en la cuenta especificada.
   *
   * El atributo creado se denomina "Funciones del Bot" y es de tipo lista con
   * los valores "On" y "Off". Está destinado a actuar como un control para
   * las funciones del bot.
   *
   * @param {integer} account_id - El ID numérico de la cuenta donde se creará el atributo.
   * @returns {object} - Retorna la respuesta del servidor, que puede incluir detalles del atributo creado.
   */
  async createAttributes() {
    const data = {
      attribute_display_name: "Funciones del Bot", // Nombre visible del atributo.
      attribute_display_type: 6, // Tipo de visualización: Lista.
      attribute_description: "Control para las funciones del bot", // Descripción del atributo.
      attribute_key: "funciones_del_bot", // Clave única para el atributo.
      attribute_values: ["On", "Off"], // Posibles valores para el atributo.
      attribute_model: 1, // Tipo de modelo: Contacto.
    };

    const response = await this._request(`/custom_attribute_definitions`, {
      method: "POST",
      data: data,
    });

    return response;
  }

  /**
   * Crea un nuevo contacto en Chatwoot.
   * @param {string} name - Nombre del contacto.
   * @param {string} phoneNumber - Número de teléfono del contacto.
   */
  async createContact(name, phoneNumber) {
    const formattedPhoneNumber = phoneNumber.startsWith("+")
      ? phoneNumber
      : `+${phoneNumber}`;

    const data = {
      inbox_id: this.inboxID,
      name: name,
      phone_number: formattedPhoneNumber,
    };

    const response = await this._request(`/contacts`, {
      method: "POST",
      data: data,
    });

    return response.payload.contact.id;
  }

  /**
   * Crea una nueva conversación en Chatwoot para un usuario específico.
   * @param {string} sourceID - El ID de fuente único para la conversación.
   * @param {string} contactID - El ID del contacto para el cual se crea la conversación.
   * @returns {number} Retorna el ID de la conversación creada.
   */
  async createNewConversation(sourceID, contactID) {
    const data = {
      source_id: sourceID,
      inbox_id: this.inboxID,
      contact_id: contactID,
      status: "open",
      assignee_id: this.idChatwoot,
    };

    const response = await this._request(`/conversations`, {
      method: "POST",
      data: data,
    });

    return response.id;
  }

  /**
   * Envía notas al usuario en Chatwoot y gestiona la creación de usuarios y conversaciones si es necesario.
   * Esta función también implementa un bloqueo para prevenir la creación de múltiples conversaciones.
   * @param {string} userPhone - Número de teléfono del usuario.
   * @param {string} mensaje - Mensaje a enviar.
   * @param {string} TypeUser - Tipo de mensaje (por ejemplo: "incoming" o "outgoing").
   * @param {boolean} isPrivate - Indica si el mensaje es privado o visible para el usuario.
   * @param {string} [name=null] - Nombre del usuario, utilizado si se necesita crear un nuevo usuario en Chatwoot.
   * @returns {boolean} Retorna true si la nota fue enviada con éxito.
   */
  async sendNotes(userPhone, mensaje, TypeUser, isPrivate, name = null) {
    let userID = await this.getUserID(userPhone);
    if (!userID) {
      userID = await this.createContact(name, userPhone);
      await new Promise((r) => setTimeout(r, 100));
      const getAttributes = await this.getAttributes(userPhone);
      if (!getAttributes) {
        const result = await this.setAttributes(
          userPhone,
          "funciones_del_bot",
          "On"
        );
        if (result) {
          console.log("Atributo actualizado con éxito.");
        }
      }
    }

    let conversation_id = await this.getConversationID(userID);
    if (!conversation_id) {
      // Adquiere el bloqueo
      if (ChatwootClient.locks[userPhone]) {
        while (ChatwootClient.locks[userPhone]) {
          await new Promise((r) => setTimeout(r, 100));
        }
        conversation_id = await this.getConversationID(userID);
      } else {
        ChatwootClient.locks[userPhone] = true;

        const sourceID = "someUniqueValue"; // Aquí, debes decidir cómo determinar el 'sourceID'. Podría ser el userID u otro valor único.
        conversation_id = await this.createNewConversation(sourceID, userID);
        ChatwootClient.locks[userPhone] = false;
      }
    }

    await this._request(`/conversations/${conversation_id}/messages`, {
      method: "POST",
      data: {
        content: mensaje,
        message_type: TypeUser,
        private: isPrivate,
      },
    });

    return true;
  }

  /**
   * Descarga un archivo desde un enlace y lo retorna como un stream.
   * @param {string} url - URL del archivo a descargar.
   * @returns {Stream} Stream del archivo descargado.
   */
  async _downloadFile(url, token = null) {
    const headers = {};

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await axios.get(url, {
      responseType: "stream",
      headers: headers,
    });
    return {
      dataStream: response.data,
      contentType: response.headers["content-type"],
    };
  }

  /**
   * Envía un mensaje a Chatwoot con texto y/o adjuntos.
   * @param {string} userPhone - Número de teléfono del usuario.
   * @param {string} [mensaje] - Mensaje a enviar (opcional).
   * @param {string[]} [fileUrls] - Array de URLs de archivos para adjuntar (opcional).
   * @param {string} TypeUser - Tipo de mensaje (e.g., "outgoing" o "incoming").
   * @param {boolean} isPrivate - Indica si el mensaje es privado.
   */
  async sendMessageWithAttachments(
    userPhone,
    mensaje = null,
    fileUrls = [],
    TypeUser,
    isPrivate = false,
    token = null
  ) {
    const userID = await this.getUserID(userPhone);
    const conversation_id = await this.getConversationID(userID);

    const form = new FormData();

    if (mensaje) {
      form.append("content", mensaje);
    }

    for (let url of fileUrls) {
      const fileResult = await this._downloadFile(url, token);

      const fileExtension = mime.getExtension(fileResult.contentType);

      if (fileExtension) {
        const fileName = `Documento.${fileExtension}`;
        form.append("attachments[]", fileResult.dataStream, {
          filename: fileName,
        });
      } else {
        console.error(`No se pudo determinar la extensión para la URL: ${url}`);
      }
    }

    form.append("message_type", TypeUser);
    form.append("private", isPrivate.toString());

    try {
      await this._request(`/conversations/${conversation_id}/messages`, {
        method: "POST",
        headers: {
          ...form.getHeaders(),
          api_access_token: this.apiAccessToken,
        },
        data: form,
      });
      return true;
    } catch (error) {
      console.error(
        "Failed to send message:",
        error.response?.data || error.message
      );
      throw error;
    }
  }
}

module.exports = ChatwootClient;
