const axios = require("axios");

class ChatwootClient {
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
      throw new Error("No user found for the given phone number.");
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
    return contact.custom_attributes;
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
      throw new Error("No conversations found for the given user.");
    }
    const conversation = conversations.find((c) => c.inbox_id == this.inboxID);
    if (!conversation) {
      throw new Error(`No conversation found with inbox_id ${this.inboxID}`);
    }
    return conversation.conversation_id;
  }

  /**
   * Envía notas al usuario en Chatwoot.
   * @param {string} userPhone - Número de teléfono del usuario.
   * @param {string} mensaje - Mensaje a enviar.
   * @param {string} TypeUser - Tipo de mensaje.
   * @param {boolean} isPrivate - Indica si el mensaje es privado.
   */
  async sendNotes(userPhone, mensaje, TypeUser, isPrivate) {
    const userID = await this.getUserID(userPhone);
    const conversation_id = await this.getConversationID(userID);
    await this._request(`/conversations/${conversation_id}/messages`, {
      method: "POST",
      data: {
        content: mensaje,
        message_type: TypeUser,
        private: isPrivate,
        content_attributes: {},
      },
    });
    return true;
  }
}

module.exports = ChatwootClient;
