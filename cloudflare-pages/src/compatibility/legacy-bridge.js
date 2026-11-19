/** Единственная граница совместимости со старым интерфейсом. Новый код не обращается к legacy-глобалам напрямую. */
export function createLegacyBridge(context) {
  if (!context?.db) throw new Error('Legacy bridge missing: db');

  const requiredFns = ['getUser', 'getActiveConversation', 'getMessages', 'setMessages'];
  for (const key of requiredFns) {
    if (typeof context[key] !== 'function') {
      throw new Error(`Legacy bridge missing: ${key}`);
    }
  }

  return Object.freeze({
    db: context.db,
    getUser: context.getUser,
    getConversations: typeof context.getConversations === 'function' ? context.getConversations : () => [],
    setConversations: typeof context.setConversations === 'function'
      ? context.setConversations
      : (rows) => { throw new Error('Legacy bridge missing: setConversations'); },
    getActiveConversation: context.getActiveConversation,
    setActiveConversation: typeof context.setActiveConversation === 'function' ? context.setActiveConversation : () => {},
    setReplyTarget: typeof context.setReplyTarget === 'function' ? context.setReplyTarget : () => {},
    getMessages: context.getMessages,
    setMessages: context.setMessages,
    getReplyTarget: typeof context.getReplyTarget === 'function' ? context.getReplyTarget : () => null,
    notify: typeof context.notify === 'function' ? context.notify : (message => console.info(message))
  });
}
