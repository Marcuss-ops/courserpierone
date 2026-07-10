/**
 * Chat UI Translations
 *
 * Traduzioni per i componenti chat (modal, inline, search bar, profile buttons).
 * Basate sul codice lingua (2 lettere), non sul locale completo.
 * Aggiungere nuove lingue è semplice: basta aggiungere una chiave.
 *
 * Pattern: replica di auth-translations.ts
 */

const chatTranslations: Record<string, ChatStrings> = {
  // ═══ Italiano ═══
  it: {
    writeToCreator: "Scrivi al creator",
    loadError: "Errore nel caricamento messaggi",
    loadErrorRetry: "Impossibile caricare i messaggi. Riprova.",
    loadErrorShort: "Errore nel caricamento",
    loading: "Caricamento...",
    olderMessages: "Messaggi precedenti",
    emptyChatHint: "Scrivi qui il tuo primo messaggio. Risponderò il prima possibile.",
    writeAs: "Scrivi come",
    respondWithin: "rispondo entro 24h",
    live: "Live",
    reconnecting: "Reconnecting...",
    closeChat: "Chiudi chat",
    typing: "sta scrivendo...",
    typePlaceholder: "Scrivi un messaggio...",
    sendMessage: "Invia messaggio",
    privacyNote: "I tuoi messaggi sono privati. Solo tu e {name} potete vederli.",
    sendError: "Errore nell'invio",
    writeToName: "Scrivi a {name}...",
    userFallback: "Utente",
    messageLabel: "Messaggio",
    messageTitle: "Scrivi a {name}",
    searchPlaceholder: "Cerca utenti per nome o username...",
    clearSearch: "Pulisci ricerca",
    searchError: "Impossibile cercare utenti. Riprova.",
    searchFetchError: "Errore nella ricerca",
    noUsersFound: 'Nessun utente trovato per "{query}"',
    userNoName: "Utente senza nome",
    creatorBadge: "Creator",
    writeButton: "Scrivi",
    shareTitle: "Copia link profilo",
    copied: "Copiato!",
    share: "Condividi",
    online: "Online",
    messages: "Messaggi",
    noConversations: "Nessuna conversazione",
    conversations: "conversazioni",
    conversation: "conversazione",
  },

  // ═══ English ═══
  en: {
    writeToCreator: "Message the creator",
    loadError: "Error loading messages",
    loadErrorRetry: "Unable to load messages. Please try again.",
    loadErrorShort: "Error loading",
    loading: "Loading...",
    olderMessages: "Older messages",
    emptyChatHint: "Write your first message here. I'll reply as soon as possible.",
    writeAs: "Writing as",
    respondWithin: "I reply within 24h",
    live: "Live",
    reconnecting: "Reconnecting...",
    closeChat: "Close chat",
    typing: "is typing...",
    typePlaceholder: "Write a message...",
    sendMessage: "Send message",
    privacyNote: "Your messages are private. Only you and {name} can see them.",
    sendError: "Error sending",
    writeToName: "Message {name}...",
    userFallback: "User",
    messageLabel: "Message",
    messageTitle: "Message {name}",
    searchPlaceholder: "Search users by name or username...",
    clearSearch: "Clear search",
    searchError: "Unable to search users. Try again.",
    searchFetchError: "Search error",
    noUsersFound: 'No users found for "{query}"',
    userNoName: "Unnamed user",
    creatorBadge: "Creator",
    writeButton: "Message",
    shareTitle: "Copy profile link",
    copied: "Copied!",
    share: "Share",
    online: "Online",
    messages: "Messages",
    noConversations: "No conversations",
    conversations: "conversations",
    conversation: "conversation",
  },

  // ═══ Español ═══
  es: {
    writeToCreator: "Escribe al creador",
    loadError: "Error al cargar mensajes",
    loadErrorRetry: "No se pudieron cargar los mensajes. Inténtalo de nuevo.",
    loadErrorShort: "Error al cargar",
    loading: "Cargando...",
    olderMessages: "Mensajes anteriores",
    emptyChatHint: "Escribe aquí tu primer mensaje. Responderé lo antes posible.",
    writeAs: "Escribiendo como",
    respondWithin: "respondo en 24h",
    live: "En vivo",
    reconnecting: "Reconectando...",
    closeChat: "Cerrar chat",
    typing: "está escribiendo...",
    typePlaceholder: "Escribe un mensaje...",
    sendMessage: "Enviar mensaje",
    privacyNote: "Tus mensajes son privados. Solo tú y {name} pueden verlos.",
    sendError: "Error al enviar",
    writeToName: "Escribe a {name}...",
    userFallback: "Usuario",
    messageLabel: "Mensaje",
    messageTitle: "Mensaje a {name}",
    searchPlaceholder: "Buscar usuarios por nombre...",
    clearSearch: "Limpiar búsqueda",
    searchError: "No se pueden buscar usuarios. Inténtalo de nuevo.",
    searchFetchError: "Error de búsqueda",
    noUsersFound: 'No se encontraron usuarios para "{query}"',
    userNoName: "Usuario sin nombre",
    creatorBadge: "Creador",
    writeButton: "Escribir",
    shareTitle: "Copiar enlace del perfil",
    copied: "¡Copiado!",
    share: "Compartir",
    online: "En línea",
    messages: "Mensajes",
    noConversations: "Sin conversaciones",
    conversations: "conversaciones",
    conversation: "conversación",
  },

  // ═══ Français ═══
  fr: {
    writeToCreator: "Écrire au créateur",
    loadError: "Erreur de chargement des messages",
    loadErrorRetry: "Impossible de charger les messages. Réessayez.",
    loadErrorShort: "Erreur de chargement",
    loading: "Chargement...",
    olderMessages: "Messages précédents",
    emptyChatHint: "Écrivez ici votre premier message. Je répondrai dès que possible.",
    writeAs: "Écrire en tant que",
    respondWithin: "je réponds sous 24h",
    live: "En direct",
    reconnecting: "Reconnexion...",
    closeChat: "Fermer le chat",
    typing: "est en train d'écrire...",
    typePlaceholder: "Écrivez un message...",
    sendMessage: "Envoyer le message",
    privacyNote: "Vos messages sont privés. Seuls vous et {name} pouvez les voir.",
    sendError: "Erreur d'envoi",
    writeToName: "Écrire à {name}...",
    userFallback: "Utilisateur",
    messageLabel: "Message",
    messageTitle: "Message à {name}",
    searchPlaceholder: "Rechercher des utilisateurs...",
    clearSearch: "Effacer la recherche",
    searchError: "Impossible de rechercher des utilisateurs. Réessayez.",
    searchFetchError: "Erreur de recherche",
    noUsersFound: 'Aucun utilisateur trouvé pour "{query}"',
    userNoName: "Utilisateur sans nom",
    creatorBadge: "Créateur",
    writeButton: "Écrire",
    shareTitle: "Copier le lien du profil",
    copied: "Copié !",
    share: "Partager",
    online: "En ligne",
    messages: "Messages",
    noConversations: "Aucune conversation",
    conversations: "conversations",
    conversation: "conversation",
  },

  // ═══ Deutsch ═══
  de: {
    writeToCreator: "Ersteller anschreiben",
    loadError: "Fehler beim Laden der Nachrichten",
    loadErrorRetry: "Nachrichten konnten nicht geladen werden. Bitte versuche es erneut.",
    loadErrorShort: "Ladefehler",
    loading: "Wird geladen...",
    olderMessages: "Ältere Nachrichten",
    emptyChatHint: "Schreibe hier deine erste Nachricht. Ich antworte so schnell wie möglich.",
    writeAs: "Schreiben als",
    respondWithin: "ich antworte innerhalb von 24h",
    live: "Live",
    reconnecting: "Wiederverbinden...",
    closeChat: "Chat schließen",
    typing: "schreibt gerade...",
    typePlaceholder: "Schreibe eine Nachricht...",
    sendMessage: "Nachricht senden",
    privacyNote: "Deine Nachrichten sind privat. Nur du und {name} können sie sehen.",
    sendError: "Fehler beim Senden",
    writeToName: "Schreibe an {name}...",
    userFallback: "Benutzer",
    messageLabel: "Nachricht",
    messageTitle: "Nachricht an {name}",
    searchPlaceholder: "Benutzer nach Namen suchen...",
    clearSearch: "Suche löschen",
    searchError: "Benutzersuche nicht möglich. Erneut versuchen.",
    searchFetchError: "Suchfehler",
    noUsersFound: 'Keine Benutzer gefunden für "{query}"',
    userNoName: "Unbenannter Benutzer",
    creatorBadge: "Ersteller",
    writeButton: "Schreiben",
    shareTitle: "Profil-Link kopieren",
    copied: "Kopiert!",
    share: "Teilen",
    online: "Online",
    messages: "Nachrichten",
    noConversations: "Keine Unterhaltungen",
    conversations: "Unterhaltungen",
    conversation: "Unterhaltung",
  },

  // ═══ Português ═══
  pt: {
    writeToCreator: "Escrever para o criador",
    loadError: "Erro ao carregar mensagens",
    loadErrorRetry: "Não foi possível carregar as mensagens. Tente novamente.",
    loadErrorShort: "Erro ao carregar",
    loading: "Carregando...",
    olderMessages: "Mensagens anteriores",
    emptyChatHint: "Escreva sua primeira mensagem aqui. Responderei o mais rápido possível.",
    writeAs: "Escrevendo como",
    respondWithin: "respondo em 24h",
    live: "Ao vivo",
    reconnecting: "Reconectando...",
    closeChat: "Fechar chat",
    typing: "está escrevendo...",
    typePlaceholder: "Escreva uma mensagem...",
    sendMessage: "Enviar mensagem",
    privacyNote: "Suas mensagens são privadas. Só você e {name} podem vê-las.",
    sendError: "Erro ao enviar",
    writeToName: "Escrever para {name}...",
    userFallback: "Usuário",
    messageLabel: "Mensagem",
    messageTitle: "Mensagem para {name}",
    searchPlaceholder: "Buscar usuários por nome...",
    clearSearch: "Limpar busca",
    searchError: "Não foi possível buscar usuários. Tente novamente.",
    searchFetchError: "Erro de busca",
    noUsersFound: 'Nenhum usuário encontrado para "{query}"',
    userNoName: "Usuário sem nome",
    creatorBadge: "Criador",
    writeButton: "Escrever",
    shareTitle: "Copiar link do perfil",
    copied: "Copiado!",
    share: "Compartilhar",
    online: "Online",
    messages: "Mensagens",
    noConversations: "Nenhuma conversa",
    conversations: "conversas",
    conversation: "conversa",
  },
};

export interface ChatStrings {
  writeToCreator: string;
  loadError: string;
  loadErrorRetry: string;
  loadErrorShort: string;
  loading: string;
  olderMessages: string;
  emptyChatHint: string;
  writeAs: string;
  respondWithin: string;
  live: string;
  reconnecting: string;
  closeChat: string;
  typing: string;
  typePlaceholder: string;
  sendMessage: string;
  privacyNote: string;
  sendError: string;
  writeToName: string;
  userFallback: string;
  messageLabel: string;
  messageTitle: string;
  searchPlaceholder: string;
  clearSearch: string;
  searchError: string;
  searchFetchError: string;
  noUsersFound: string;
  userNoName: string;
  creatorBadge: string;
  writeButton: string;
  shareTitle: string;
  copied: string;
  share: string;
  online: string;
  messages: string;
  noConversations: string;
  conversations: string;
  conversation: string;
}

// English as universal fallback
const FALLBACK: ChatStrings = chatTranslations.en;

/**
 * Get chat translations for a given language code.
 * Falls back to English if the language is not supported.
 *
 * @param langCode - 2-letter language code (e.g. "it", "en", "fr")
 */
export function getChatTranslations(langCode: string): ChatStrings {
  const normalized = langCode.toLowerCase().split("-")[0];
  return chatTranslations[normalized] ?? FALLBACK;
}
