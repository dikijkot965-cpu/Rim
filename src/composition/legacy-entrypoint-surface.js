/**
 * Composition: LegacyEntrypointRegistry + modular overrides for classic globals.
 */
import { LegacyEntrypointRegistry } from '../application/legacy-entrypoint-registry.js';

/**
 * @param {object} deps
 */
export function bindLegacyEntrypointSurface({
  conversationList,
  conversationState,
  messageListRenderer,
  messageDecorations,
  readReceipts,
  logger,
  lifecycle,
  windowRef = globalThis.window
} = {}) {
  const win = windowRef;
  const entrypoints = new LegacyEntrypointRegistry(win);
  lifecycle?.add?.(() => entrypoints.dispose());

  entrypoints.wrap('renderConversationList', original => function (...args) {
    conversationState?.sort?.();
    let result;
    if (win.__RIM_CONVERSATION_LIST_RENDER_OWNED) {
      conversationList?.paintList?.();
      result = undefined;
    } else {
      result = original.apply(this, args);
    }
    conversationList?.refresh?.().catch(error =>
      logger?.warn?.('chat.list.enrich.failed', { message: error?.message })
    );
    return result;
  });

  entrypoints.wrap('loadConversations', original => async function (...args) {
    try {
      const result = await conversationList.load();
      await conversationState.hydrateActivity();
      conversationState.sort();
      await conversationState.refreshUnread();
      try { win.renderConversationList?.(); } catch { /* ignore */ }
      return result;
    } catch (error) {
      logger?.warn?.('conversations.list.modular.load.failed', { message: error?.message });
      const result = await original.apply(this, args);
      conversationState.sort();
      await conversationState.refreshUnread();
      return result;
    }
  });

  entrypoints.wrap('initializeApp', original => async function (...args) {
    const result = await original.apply(this, args);
    await conversationState.startRealtime();
    return result;
  });

  entrypoints.wrap('renderMessages', original => async function (...args) {
    if (win.__RIM_MESSAGE_LIST_RENDERER_OWNED) {
      await messageListRenderer.render();
    } else {
      await original.apply(this, args);
    }
    await messageDecorations?.decorate?.();
    await readReceipts?.render?.();
  });

  win.markConversationRead = () => conversationState.markActiveConversationRead();

  logger?.info?.('composition.legacyEntrypointSurface.bound', {});
  return { entrypoints };
}
