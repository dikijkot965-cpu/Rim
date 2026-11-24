import { escapeHtml } from '../core/html.js';

const QUICK_COMMANDS = [
  ['Обзор','/menu'],['Статистика','/stats'],['Правила','/rules'],['Администраторы','/admins'],
  ['Предупреждения','/warnings'],['Команды','/commands'],['Триггеры','/trigger list'],['Правила: изменить','/setrules'],['Приветствие: изменить','/setwelcome'],
  ['Баланс','/balance'],['Ежедневная награда','/daily'],['Викторина','/quiz'],
  ['Магазин','/shop'],['Инвентарь','/inventory'],['Рынок','/market'],['Топ экономики','/economy_top'],
  ['Кланы','/clan'],['Напоминания','/remind'],['Опрос','/poll'],['Голосование','/vote'],['Результаты опроса','/pollresults'],['Жалобы','/reports'],['Ранг','/rank'],['Передать жетоны','/pay'],['Начислить жетоны','/grant'],['Репутация','/rep'],['Топ','/top'],['Награды','/awards']
];

const field = (value, max, label) => {
  const text = String(value ?? '').trim();
  if (!text || text.length > max || /[\r\n|]/.test(text)) throw new Error(label + ': заполните поле (до ' + max + ' символов), без переносов строк и символа |.');
  return text;
};

export function buildZladenTriggerCommand({ name, matchType, matchValue, actionType, actionValue }) {
  const triggerName = field(name, 80, 'Название триггера');
  const value = field(matchValue, 160, 'Фраза-триггер');
  if (value.length < 2) throw new Error('Фраза-триггер должна содержать минимум два символа.');
  if (!['contains','starts_with','equals'].includes(matchType)) throw new Error('Неизвестный тип совпадения.');
  let action;
  if (actionType === 'reply') action = 'reply:' + field(actionValue, 1000, 'Ответ триггера');
  else if (actionType === 'grant') {
    const rawPoints = String(actionValue ?? '').trim();
    const points = Number(rawPoints);
    if (!/^\d+$/.test(rawPoints) || !Number.isInteger(points) || points < 1 || points > 1000) throw new Error('Награда должна быть от 1 до 1000 жетонов.');
    action = 'grant:' + points;
  } else throw new Error('Неизвестное действие триггера.');
  return '/trigger add ' + triggerName + ' | ' + matchType + ':' + value + ' | ' + action;
}

export function buildZladenJoinTriggerCommand({ name, text }) {
  return '/trigger join_add ' + field(name, 80, 'Название триггера') + ' | reply:' + field(text, 1000, 'Приветствие');
}

export class ZladenGroupConsoleController {
  constructor({ client, getUser, zladenService = null, notify = () => {}, documentRef = globalThis.document, windowRef = globalThis.window, logger = null } = {}) {
    this.client = client; this.getUser = getUser; this.zladenService = zladenService;
    this.notify = notify; this.document = documentRef; this.window = windowRef; this.logger = logger;
    this.group = null; this.root = null;
    this.onClick = event => { void this.#click(event); };
    this.onSubmit = event => { void this.#submit(event); };
  }

  async open(conversationId) {
    const user = this.getUser?.();
    if (!user?.id) return this.#say('Для управления Злыдей войдите в РИМ.');
    const result = await this.client.from('conversations').select('id,type,title,created_by,e2e_mode').eq('id', conversationId).maybeSingle();
    const group = result.data;
    if (result.error || !group || group.type !== 'group') return this.#say('Группа не найдена.');
    if (['required','pending'].includes(group.e2e_mode)) return this.#say('Злыдя отключён в защищённых беседах E2E. Панель недоступна.');
    const member = await this.client.from('conversation_members').select('role').eq('conversation_id', conversationId).eq('user_id', user.id).maybeSingle();
    if (member.error || (!member.data && String(group.created_by) !== String(user.id))) return this.#say('Вы не состоите в этой группе.');
    if (String(group.created_by) !== String(user.id) && !['owner','admin'].includes(member.data?.role)) return this.#say('Центр управления доступен владельцу и администраторам группы.');
    this.group = group;
    let botJoined = false;
    try {
      const profile = await this.zladenService?.getPublicProfile?.();
      const username = profile?.value?.username;
      if (profile?.ok && username) {
        const bot = await this.client.from('profiles').select('id').eq('username', username).maybeSingle();
        if (bot.data?.id) {
          const membership = await this.client.from('conversation_members').select('user_id').eq('conversation_id', conversationId).eq('user_id', bot.data.id).maybeSingle();
          botJoined = !!membership.data;
        }
      }
    } catch (error) { this.logger?.warn?.('zladen.console.bot_check_failed', { message: error?.message }); }
    this.window?.showModal?.(this.#html(group, botJoined));
    this.root = this.document?.querySelector?.('[data-rim-zladen-console]');
    this.root?.addEventListener?.('click', this.onClick);
    this.root?.addEventListener?.('submit', this.onSubmit);
    return true;
  }

  #html(group, botJoined) {
    const disabled = botJoined ? '' : ' disabled';
    const buttons = QUICK_COMMANDS.map(([label, command]) => '<button type="button" data-zc="preset" data-command="' + escapeHtml(command) + '"><b>' + escapeHtml(label) + '</b><code>' + escapeHtml(command) + '</code></button>').join('');
    return '<section class="rim-zladen-console" data-rim-zladen-console>' +
      '<style>.rim-zladen-console{max-height:82vh;overflow:auto;color:var(--text)}.rim-zc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.rim-zc-card{padding:12px;margin:10px 0;border:1px solid var(--border);border-radius:12px;background:var(--panel)}.rim-zc-grid button{display:grid;text-align:left;gap:4px;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--panel2);color:inherit}.rim-zc-grid code,.rim-zc-muted{font-size:12px;color:var(--muted)}.rim-zc-form{display:grid;gap:8px}.rim-zc-form input,.rim-zc-form select,.rim-zc-form textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--bg);color:inherit}.rim-zc-form textarea{min-height:70px}.rim-zc-form button{padding:10px;border:0;border-radius:10px;background:var(--gold);color:#17130d;font-weight:700}@media(max-width:420px){.rim-zc-grid{grid-template-columns:1fr}}</style>' +
      '<header><div class="rim-zc-muted">RIM · СИСТЕМНЫЙ ПОМОЩНИК</div><h2>Центр управления Злыдей</h2><p>' + escapeHtml(group.title || 'Группа') + '</p><button type="button" data-zc="close">Закрыть</button></header>' +
      '<div class="rim-zc-card">' + (botJoined ? 'Злыдя подключён. Права команд проверяет сервер.' : 'Злыдя не подключён к группе. <button type="button" data-zc="connect">Подключить Злыдю</button>') + '</div>' +
      '<section class="rim-zc-card"><h3>Быстрые команды</h3><div class="rim-zc-grid">' + buttons + '</div><p class="rim-zc-muted">Ответы появятся в переписке группы. В беседах с обязательным E2E команды отключены.</p></section>' +
      '<section class="rim-zc-card"><h3>Создать текстовый триггер</h3><form class="rim-zc-form" data-zcf="trigger"><input name="name" required maxlength="80" placeholder="Название"><select name="matchType"><option value="contains">Содержит фразу</option><option value="starts_with">Начинается с</option><option value="equals">Полное совпадение</option></select><input name="matchValue" required maxlength="160" placeholder="Фраза"><select name="actionType"><option value="reply">Ответить текстом</option><option value="grant">Начислить жетоны раз в день</option></select><textarea name="actionValue" required maxlength="1000" placeholder="Ответ или число жетонов 1–1000"></textarea><button type="submit">Создать триггер</button></form></section>' +
      '<section class="rim-zc-card"><h3>Приветствие новых участников</h3><form class="rim-zc-form" data-zcf="join"><input name="name" required maxlength="80" placeholder="Название"><textarea name="text" required maxlength="1000" placeholder="Текст приветствия"></textarea><button type="submit">Создать приветствие</button></form></section>' +
      '<section class="rim-zc-card"><h3>Удалить триггер</h3><form class="rim-zc-form" data-zcf="delete"><input name="id" required minlength="8" maxlength="32" pattern="[0-9a-fA-F]{8,32}" placeholder="Первые 8–32 символа ID"><button type="submit">Удалить</button></form><p class="rim-zc-muted">Сначала выполните /trigger list.</p></section>' +
      '<section class="rim-zc-card"><h3>Своя команда</h3><form class="rim-zc-form" data-zcf="command"><input name="command" required maxlength="1000" placeholder="/warn UUID причина или /rank UUID 1 помощник"><button type="submit">Отправить</button></form><p class="rim-zc-muted">Жетоны — внутренние очки без денежной стоимости.</p></section></section>';
  }

  async #click(event) {
    const button = event.target?.closest?.('[data-zc]');
    if (!button || !this.root?.contains?.(button)) return;
    if (button.dataset.zc === 'close') { this.window?.closeModal?.(); return; }
    if (button.dataset.zc === 'connect') { await this.window?.rimGroupAddZladen?.(this.group?.id); return; }
    if (button.dataset.zc === 'preset') await this.sendCommand(button.dataset.command || '');
  }

  async #submit(event) {
    const form = event.target?.closest?.('[data-zcf]');
    if (!form || !this.root?.contains?.(form)) return;
    event.preventDefault();
    const data = new FormData(form);
    try {
      let command = '';
      if (form.dataset.zcf === 'trigger') command = buildZladenTriggerCommand({
        name: data.get('name'), matchType: data.get('matchType'), matchValue: data.get('matchValue'),
        actionType: data.get('actionType'), actionValue: data.get('actionValue')
      });
      else if (form.dataset.zcf === 'join') command = buildZladenJoinTriggerCommand({ name: data.get('name'), text: data.get('text') });
      else if (form.dataset.zcf === 'delete') {
        const id = field(data.get('id'), 32, 'ID');
        if (!/^[0-9a-fA-F]{8,32}$/.test(id)) throw new Error('Некорректный ID триггера.');
        command = '/trigger del ' + id;
      } else if (form.dataset.zcf === 'command') {
        command = field(data.get('command'), 1000, 'Команда');
        if (!/^[/!.]/.test(command)) throw new Error('Команда должна начинаться с /, ! или .');
      }
      if (command && await this.sendCommand(command)) form.reset();
    } catch (error) { this.#say(error?.message || 'Не удалось подготовить команду.'); }
  }

  async sendCommand(command) {
    const user = this.getUser?.();
    const text = String(command || '').trim();
    if (!this.group?.id || !user?.id || !/^[/!.][^\r\n]{1,999}$/.test(text)) return this.#say('Некорректная команда.');
    const group = await this.client.from('conversations').select('id,type,e2e_mode').eq('id', this.group.id).maybeSingle();
    if (group.error || !group.data || group.data.type !== 'group' || ['required','pending'].includes(group.data.e2e_mode)) return this.#say('Команда не отправлена: группа недоступна или защищена E2E.');
    const id = globalThis.crypto?.randomUUID?.() || (Date.now() + '-' + Math.random().toString(36).slice(2));
    const result = await this.client.from('chat_messages').insert({
      conversation_id: this.group.id, sender_id: user.id, body: text, client_message_id: 'zladen-ui:' + id
    }).select('id').maybeSingle();
    if (result.error) {
      this.logger?.warn?.('zladen.console.command_failed', { command: text.split(' ')[0], message: result.error.message });
      this.#say(result.error.message || 'Не удалось отправить команду.');
      return false;
    }
    this.window?.closeModal?.();
    try {
      await this.window?.openConversation?.(this.group.id);
      await this.window?.loadMessages?.();
    } catch (error) {
      this.logger?.warn?.('zladen.console.open_chat_after_command.failed', { message: error?.message });
    }
    this.#say('Команда отправлена. Ответ Злыди появится в переписке.');
    return true;
  }

  #say(message) { this.notify(String(message || 'Неизвестная ошибка')); return false; }

  dispose() {
    this.root?.removeEventListener?.('click', this.onClick);
    this.root?.removeEventListener?.('submit', this.onSubmit);
    this.root = null;
    this.group = null;
  }
}
