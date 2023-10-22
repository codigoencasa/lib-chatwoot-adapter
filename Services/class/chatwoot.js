const axios = require("axios");
const FormData = require("form-data");
const mime = require("mime");

class ChatwootClient {
  static locks = {};

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
   * Realiza una solicitud HTTP a la API de Chatwoot.
   * @param {string} endpoint - Endpoint de la API.
   * @param {Object} options - Opciones para la solicitud HTTP.
   */
  async _request(endpoint, options = {}) {
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
      return response.data;
    } catch (error) {
      console.error("Error details:", error.response?.data || error.message);
      throw new Error(error.message);
    }
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
      throw new Error("No user found for the given phone number.");
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

    return response.payload.contact.id; // Retornar solo el ID del contacto creado.
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

    // Retorna el ID de la nueva conversación creada.
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

        // Libera el bloqueo
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

    // Agregar el contenido textual del mensaje si se proporciona
    if (mensaje) {
      form.append("content", mensaje);
    }

    // Descargar y agregar archivos adjuntos si se proporcionan URLs
    for (let url of fileUrls) {
      const fileResult = await this._downloadFile(url, token);

      const fileExtension = mime.getExtension(fileResult.contentType);

      if (fileExtension) {
        const fileName = `Documento.${fileExtension}`;
        form.append("attachments[]", fileResult.dataStream, {
          filename: fileName,
        });
      } else {
        // Manejar el caso en el que no puedas determinar la extensión.
        console.error(`No se pudo determinar la extensión para la URL: ${url}`);
      }
    }

    // Agregar el tipo de mensaje y si es privado
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
