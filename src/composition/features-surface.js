/**
 * Composition: Lite Writer, Favorites workspace, local music library + window routes.
 */
import { FavoritesWorkspace } from '../features/favorites-workspace.js';
import { LiteWriterWorkspace } from '../features/lite-writer.js';
import { LocalMusicLibrary } from '../features/local-music.js';

/**
 * @param {object} deps
 */
export function bindFeaturesSurface({
  client,
  getUser,
  getMessages,
  conversationList,
  logger,
  lifecycle,
  documentRef = globalThis.document,
  windowRef = globalThis.window
} = {}) {
  const win = windowRef;
  const doc = documentRef;

  const writer = new LiteWriterWorkspace({ db: client, getUser, logger });
  const musicRoot = doc.createElement('div');
  musicRoot.id = 'rimLocalMusicRoot';
  // Claim the section during composition, before the first navigation paint.
  // This prevents the retired server-rendered music screen from flashing.
  const musicSection = doc.getElementById('musicSection');
  if (musicSection) musicSection.replaceChildren(musicRoot);
  else doc.body.append(musicRoot);
  const music = new LocalMusicLibrary({ root: musicRoot, logger, client, getUser });
  win.__RIM_MUSIC_OWNED = true;
  win.loadMusic = async () => {
    try {
      // Mount modular player into music section if present
      const section = doc.getElementById('musicSection');
      if (section && music.root && !section.contains(music.root)) {
        // Replace the obsolete server-rendered music form/list atomically.
        // The modular library is the sole owner of this section.
        section.replaceChildren(music.root);
      }
      await music.render?.();
    } catch (e) { logger?.warn?.('music.open.failed', e); }
  };
  win.rimOpenMusic = win.loadMusic;
  win.uploadMusic = async () => {
    try {
      const input = doc.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*,.mp3,.m4a,.ogg,.wav,.flac,.aac';
      input.multiple = true;
      input.onchange = async () => {
        try {
          if (input.files?.length) await music.addFiles(input.files);
        } catch (error) {
          win.toast?.(error?.message || String(error));
        }
      };
      input.click();
    } catch (e) { logger?.warn?.('music.upload.failed', e); }
  };
  lifecycle?.add?.(() => { win.__RIM_MUSIC_OWNED = false; });
  const favorites = new FavoritesWorkspace({
    db: client,
    getUser,
    writer: () => win.rimOpenWriter?.(),
    logger
  });

  win.rimOpenWriter = async () => {
    try {
      await writer.open();
    } catch (error) {
      logger?.error?.('writer.open.failed', error);
      win.alert?.(`Не удалось открыть Lite Writer: ${error?.message || error}`);
    }
  };
  win.rimSaveDocument = () => writer.save();
  win.rimNewDocument = () => writer.newDocument();
  win.rimSelectDocument = id => writer.select(id);
  win.rimWriterBack = () => writer.back();

  win.openFavorites = async () => {
    if (writer.root?.isConnected) await writer.closeForNavigation();
    favorites.mount();
  };

  win.rimSaveMessageToFavorites = async id => {
    const messages = getMessages?.() || [];
    const message = messages.find(item => String(item.id) === String(id));
    if (!message) {
      win.alert?.('Сообщение не найдено в текущей переписке.');
      return;
    }
    await favorites.saveMessage(message);
    try {
      conversationList?.touchFavoritesActivity?.();
      conversationList?.ensureFavoritesRow?.();
    } catch { /* ignore */ }
  };

  // Favorite stars are no longer injected under every bubble (gray squares).
  // Save-to-favorites lives in the message action sheet instead.


  // NavigationSectionController owns tab switching and invokes win.loadMusic.
  // Avoid a second capture-phase render, which caused the legacy UI to flash.

  win.__RIM_FEATURES_SURFACE_OWNED = true;
  lifecycle?.add?.(() => { win.__RIM_FEATURES_SURFACE_OWNED = false; });

  logger?.info?.('composition.featuresSurface.bound', {});
  return { favorites, writer, music };
}
