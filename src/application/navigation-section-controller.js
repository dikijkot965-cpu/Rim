/**
 * Primary tab sections: chats / channels / music (+ hide more/tools overlays).
 */
export class NavigationSectionController {
  constructor({
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    loadChannels = async () => {},
    loadMusic = async () => {},
    logger = null
  } = {}) {
    this.document = documentRef;
    this.window = windowRef;
    this.loadChannels = loadChannels;
    this.loadMusic = loadMusic;
    this.logger = logger;
  }

  show(section) {
    const doc = this.document;
    const win = this.window;
    const name = String(section || 'chats');
    try { win.currentSection = name; } catch { /* ignore */ }
    const createButton = doc.getElementById?.('rimCreateHandle');
    if (createButton) createButton.hidden = name !== 'chats';

    ['moreSection', 'toolsSection'].forEach(id => {
      const el = doc.getElementById?.(id);
      if (el) {
        el.classList.add('hidden');
        el.style.display = 'none';
      }
    });
    doc.getElementById?.('tabMoreFull')?.classList.remove('selected');
    doc.getElementById?.('tabToolsFull')?.classList.remove('selected');

    ['chats', 'feed', 'channels', 'music'].forEach(key => {
      const sec = doc.getElementById?.(`${key}Section`);
      if (!sec) return;
      const on = key === name;
      sec.classList.toggle('hidden', !on);
      if (key === 'chats' || key === 'feed') {
        sec.style.display = on ? 'flex' : 'none';
      } else {
        sec.style.display = on ? '' : 'none';
      }
      const tab = doc.getElementById?.(`tab${key.charAt(0).toUpperCase()}${key.slice(1)}`);
      tab?.classList.toggle('selected', on);
    });

    try {
      doc.getElementById?.('app')?.classList.remove('rim-chat-focus');
      doc.getElementById?.('chatWindow')?.classList.remove('open', 'mobile-active');
    } catch { /* ignore */ }

    if (name === 'feed') {
      try { win.renderFeedList?.(); } catch (e) { this.logger?.warn?.('section.feed.render', e); }
      try { void win.rimLoadFeedTopics?.(); } catch (e) { this.logger?.warn?.('section.feed.topics', e); }
    }
    if (name === 'channels') {
      try { void this.loadChannels?.(); } catch (e) { this.logger?.warn?.('section.channels.load', e); }
    }
    if (name === 'music') {
      try { void this.loadMusic?.(); } catch (e) { this.logger?.warn?.('section.music.load', e); }
    }
  }

  bindGlobals() {
    const win = this.window;
    win.__RIM_SECTION_NAV_OWNED = true;
    win.showSection = (section) => this.show(section);
  }

  dispose() {
    try { this.window.__RIM_SECTION_NAV_OWNED = false; } catch { /* ignore */ }
  }
}
