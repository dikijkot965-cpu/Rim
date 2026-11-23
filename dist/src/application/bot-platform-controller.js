function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/** First-party bot account management. Bot API secrets are only returned once. */
export class BotPlatformController {
  constructor({ client, documentRef = globalThis.document, notify = () => {}, logger = null } = {}) {
    this.client = client; this.document = documentRef; this.notify = notify; this.logger = logger;
    this.root = null; this.busy = false; this.selectedBot = null; this.editorTimer = null; this.project = null; this.savePromise = null;
    this.click = this.#onClick.bind(this); this.submit = this.#onSubmit.bind(this); this.input = this.#onEditorInput.bind(this);
  }
  async open() {
    const tools = this.document?.getElementById?.('toolsSection');
    if (!tools) return;
    let section = this.document?.getElementById?.('botsSection');
    if (!section) { section = this.document.createElement('section'); section.id = 'botsSection'; section.className = 'rim-bots-workspace'; tools.append(section); }
    tools.querySelector('.rim-page-grid')?.setAttribute('hidden', '');
    this.root = section; section.hidden = false; section.innerHTML = this.#shell();
    section.removeEventListener('click', this.click); section.addEventListener('click', this.click);
    section.removeEventListener('submit', this.submit); section.addEventListener('submit', this.submit);
    section.removeEventListener('input', this.input); section.addEventListener('input', this.input);
    section.onchange = async event => { if (event.target?.matches?.('[data-bot-code-file]') && event.target.files?.[0]) { const file=event.target.files[0]; const files=Array.from(event.target.files||[]); for(const item of files){const code=await item.text(); if(item.name==='index.js'||!section.querySelector('[data-bot-code-editor]')?.value){const editor=section.querySelector('[data-bot-code-editor]');if(editor)editor.value=code;} await this.#saveProjectFile(item.name,code);} this.#renderProjectFiles(); this.#setEditorStatus(`${files.length} файл(ов) загружено и сохранено в проекте`); event.target.value=''; } };
    await this.refresh();
  }
  #shell() {
    return `<section class="rim-bots-page"><header><button type="button" class="action-btn" data-bot-action="back">← Инструменты</button><div><span class="eyebrow">RIM DEVELOPER PLATFORM</span><h2>Боты РИМ</h2><p>Создавай автоматизированные аккаунты, подключай собственную логику и управляй командами.</p></div><div class="bot-mark">⌘</div></header><form class="rim-bot-create"><h3>Создать бота</h3><label>Имя бота<input name="display_name" maxlength="40" required placeholder="Например, Ирис"></label><label>Username<input name="username" maxlength="24" required placeholder="iris_helperbot"><small>Латиница, цифры и _. Username должен оканчиваться на bot.</small></label><label>Описание<textarea name="description" maxlength="512" rows="2" placeholder="Что умеет этот бот?"></textarea></label><button class="primary-btn" type="submit">＋ Создать бота</button></form><section class="rim-bot-token-result" hidden></section><div class="rim-bot-list-head"><h3>Мои боты</h3><button type="button" data-bot-action="refresh">Обновить</button></div><div class="rim-bot-list"><div class="rim-bot-loading">Загрузка ботов…</div></div><footer><b>Bot API</b><p>Боты получают обновления через серверный runtime. Исходники сохраняются в проекте; запуск выполняется в отдельном изолированном процессе, а не внутри интерфейса РИМа.</p></footer></section>`;
  }
  #draftKey(botId) { return `rim.bot.editor.v1:${String(botId)}`; }
  async #editorTemplate(bot) {
    this.selectedBot = bot;
    const project = await this.#ensureProject(bot);
    this.project = project;
    const { data: file } = await this.client.from('rim_bot_project_files').select('content').eq('project_id', project.id).eq('path', project.entry_file || 'index.js').maybeSingle();
    const code = file?.content || `// RIM Bot API — runtime sandbox
// Register an event handler. The runtime injects no Node.js globals or unrestricted network access.
RIM.onMessage(async update => {
  const message = update.message;
  if (!message) return;
  if (message.text === '/start') {
    await RIM.sendMessage(message.chat_id, 'Привет! Я работаю на RIM Bot Runtime.');
  }
});
`;
    this.root.innerHTML = `<section class="rim-bot-editor"><header><button type="button" class="action-btn" data-bot-action="editor-back">← К списку ботов</button><div><span class="eyebrow">BOT WORKSPACE</span><h2>${esc(bot.display_name)} · редактор</h2><small>@${esc(bot.username)}</small></div></header><div class="rim-bot-editor-toolbar"><label class="action-btn">Загрузить файлы<input type="file" accept=".js,.mjs,.ts,.json,.txt,.md" multiple data-bot-code-file hidden></label><button type="button" class="action-btn" data-bot-action="editor-new-file">Новый файл</button><button type="button" class="action-btn" data-bot-action="editor-save">Сохранить</button><button type="button" class="action-btn" data-bot-action="editor-run">Запустить</button><button type="button" class="action-btn" data-bot-action="editor-stop">Остановить</button><button type="button" class="action-btn" data-bot-action="editor-copy">Копировать</button><button type="button" class="action-btn" data-bot-action="editor-download">Скачать index.js</button></div><div class="rim-bot-project-files" data-bot-project-files></div><textarea spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" data-bot-code-editor aria-label="Исходный код бота">${esc(code)}</textarea><div class="rim-bot-editor-status" data-bot-editor-status>Проект загружен · автосохранение в Supabase</div><div class="rim-bot-editor-note"><b>Изолированный runtime</b><p>Код хранится в проекте и запускается отдельным сервисом на базе isolated-vm. Само окно редактора не исполняет пользовательский код. Для запуска необходим установленный RIM Bot Runtime; инструкции находятся в bot-runtime/README.md.</p></div></section>`;
    this.root.dataset.editorBotId = bot.id; this.root.dataset.activeFile = project.entry_file || 'index.js';
    await this.#renderProjectFiles();
    const {data:runtime}=await this.client.from('rim_bot_runtime_state').select('actual_state,heartbeat_at,last_error_code').eq('bot_id',bot.id).maybeSingle();
    this.#setEditorStatus(`Runtime: ${runtime?.actual_state||'не подключён'}${runtime?.last_error_code?' · '+runtime.last_error_code:''}`);
  }
  async #ensureProject(bot) {
    const { data: authData } = await this.client.auth.getUser();
    const ownerId = authData?.user?.id;
    if (!ownerId) throw new Error('Требуется авторизация.');
    let { data, error } = await this.client.from('rim_bot_projects').select('*').eq('bot_id',bot.id).maybeSingle();
    if (error) throw error;
    if (!data) {
      const created = await this.client.from('rim_bot_projects').insert({bot_id:bot.id,owner_id:ownerId,name:`${bot.display_name} — проект`,entry_file:'index.js'}).select('*').single();
      if (created.error) throw created.error;
      data = created.data;
    }
    return data;
  }
  async #saveProjectFile(path, content) {
    if (!this.project || !this.selectedBot) throw new Error('Сначала открой проект бота.');
    const safePath=String(path||'index.js').replace(/\\/g,'/').split('/').filter(part=>part && part!=='.' && part!=='..').join('/');
    if(!safePath || safePath.length>240) throw new Error('Недопустимое имя файла.');
    const {data:authData}=await this.client.auth.getUser(); const ownerId=authData?.user?.id;
    const language=safePath.endsWith('.json')?'json':safePath.endsWith('.ts')?'typescript':safePath.endsWith('.md')?'markdown':'javascript';
    const {error}=await this.client.from('rim_bot_project_files').upsert({project_id:this.project.id,owner_id:ownerId,path:safePath,language,content:String(content),updated_at:new Date().toISOString()},{onConflict:'project_id,path'});
    if(error) throw error;
    return safePath;
  }
  async #renderProjectFiles() {
    const host=this.root?.querySelector('[data-bot-project-files]'); if(!host||!this.project)return;
    const {data,error}=await this.client.from('rim_bot_project_files').select('path,byte_length').eq('project_id',this.project.id).order('path');
    if(error){host.textContent='Не удалось загрузить список файлов';return;}
    host.innerHTML=(data||[]).map(f=>`<button type="button" data-bot-file="${esc(f.path)}">${esc(f.path)} <small>${Number(f.byte_length||0).toLocaleString()} Б</small></button>`).join('') || '<span>Нет файлов</span>';
  }
  #setEditorStatus(message) { const status=this.root?.querySelector('[data-bot-editor-status]'); if(status)status.textContent=message; }
  async #saveEditor(options={}) {
    if(this.savePromise) await this.savePromise;
    const operation=this.#persistEditor(options);
    this.savePromise=operation;
    try{return await operation;}finally{if(this.savePromise===operation)this.savePromise=null;}
  }
  async #persistEditor({snapshot=false}={}) {
    const editor=this.root?.querySelector('[data-bot-code-editor]'); if(!editor)return;
    this.#setEditorStatus('Сохранение проекта…');
    try {
      await this.#saveProjectFile(this.root?.dataset?.activeFile||this.project?.entry_file||'index.js',editor.value);
      const {data:versions}=await this.client.from('rim_bot_projects').select('runtime_version').eq('id',this.project.id).single();
      const nextVersion=Number(versions?.runtime_version||0)+1;
      const {error}=await this.client.from('rim_bot_projects').update({runtime_version:nextVersion,updated_at:new Date().toISOString()}).eq('id',this.project.id);
      if(error)throw error;
      this.project.runtime_version=nextVersion;
      if(snapshot){const {data:files}=await this.client.from('rim_bot_project_files').select('path,content').eq('project_id',this.project.id);await this.client.from('rim_bot_project_versions').insert({project_id:this.project.id,owner_id:(await this.client.auth.getUser()).data.user.id,version:nextVersion,snapshot:{files:files||[],saved_at:new Date().toISOString()}});}
      this.#setEditorStatus(`Сохранено в Supabase · версия ${nextVersion}`);
      await this.#renderProjectFiles();
      return true;
    } catch(error) { this.#setEditorStatus(`Ошибка сохранения: ${error.message||'неизвестная ошибка'}`); return false; }
  }
  #onEditorInput() {
    const editor = this.root?.querySelector?.('[data-bot-code-editor]');
    if (!editor || !this.project) return;
    clearTimeout(this.editorTimer);
    this.#setEditorStatus('Есть несохранённые изменения…');
    this.editorTimer = setTimeout(() => { void this.#saveEditor(); }, 800);
  }
  #downloadEditorCode() {
    const code = this.root?.querySelector?.('[data-bot-code-editor]')?.value;
    if (typeof code !== 'string') return;
    const blob = new Blob([code], { type: 'text/javascript;charset=utf-8' });
    const url = this.document.defaultView.URL.createObjectURL(blob);
    const anchor = this.document.createElement('a'); anchor.href = url; anchor.download = this.root?.dataset?.activeFile || this.project?.entry_file || 'index.js'; anchor.click();
    setTimeout(() => this.document.defaultView.URL.revokeObjectURL(url), 1000);
  }

  async #invoke(payload) {
    const result = await this.client.functions.invoke('rim-bot-manage', { body: payload });
    if (result.error) throw result.error;
    if (result.data?.error) throw new Error(result.data.error);
    return result.data;
  }
  async refresh() {
    const host=this.root?.querySelector('.rim-bot-list'); if(!host)return;
    host.innerHTML='<div class="rim-bot-loading">Загрузка ботов…</div>';
    try { const data=await this.#invoke({action:'list'}); const bots=data.bots||[];
      host.innerHTML=bots.length?bots.map(bot=>`<article class="rim-bot-card"><div class="rim-bot-avatar">⌘</div><div class="rim-bot-card-copy"><b>${esc(bot.display_name)}</b><span>@${esc(bot.username)} · ${bot.is_active?'Активен':'Отключён'}</span><small>${esc(bot.description||'Без описания')}</small></div><button type="button" data-bot-action="editor" data-bot-id="${esc(bot.id)}">Код</button><button type="button" data-bot-action="rotate" data-bot-id="${esc(bot.id)}" ${bot.is_active?'':'disabled'}>Сменить токен</button><button type="button" data-bot-action="revoke" data-bot-id="${esc(bot.id)}" ${bot.is_active?'':'disabled'}>Отключить</button></article>`).join(''):'<div class="rim-bot-empty">Пока нет ботов. Создай первого выше.</div>';
    } catch(error) { host.innerHTML='<div class="rim-bot-empty">Не удалось загрузить ботов. '+esc(error.message||'')+'</div>'; }
  }
  async #onSubmit(event) {
    const form=event.target?.closest?.('.rim-bot-create');if(!form||this.busy)return;event.preventDefault();this.busy=true;
    const button=form.querySelector('button[type="submit"]');if(button){button.disabled=true;button.textContent='Создаём…';}
    try {
      const data=new FormData(form);const result=await this.#invoke({action:'create',display_name:data.get('display_name'),username:data.get('username'),description:data.get('description')});
      const host=this.root.querySelector('.rim-bot-token-result');host.hidden=false;host.innerHTML=`<div class="token-head"><b>Бот создан: @${esc(result.bot.username)}</b><span>Токен показывается только один раз</span></div><code>${esc(result.token)}</code><button type="button" data-bot-action="copy-token">Копировать токен</button><p>Сохрани токен в защищённом месте. После закрытия этого экрана восстановить его нельзя — потребуется ротация.</p>`;host.dataset.token=result.token;form.reset();await this.refresh();
    } catch(error) { this.notify('Не удалось создать бота: '+(error.message||'ошибка')); }
    finally {this.busy=false;if(button){button.disabled=false;button.textContent='＋ Создать бота';}}
  }
  async #onClick(event) {
    const button=event.target?.closest?.('[data-bot-action],[data-bot-file]');if(!button)return;
    if(button.dataset.botAction==='back'){ this.root.hidden=true; const tools=this.document.getElementById('toolsSection'); tools?.querySelector('.rim-page-grid')?.removeAttribute('hidden'); this.root.innerHTML=''; return; }
    if(button.dataset.botAction==='editor-back'){ await this.open(); return; }
    if(button.dataset.botAction==='editor'){ const data=await this.#invoke({action:'list'}); const bot=(data.bots||[]).find(item=>String(item.id)===String(button.dataset.botId)); if(bot){try{await this.#editorTemplate(bot);}catch(error){this.notify('Не удалось открыть проект: '+(error.message||''));}} return; }
    if(button.dataset.botAction==='editor-save'){ await this.#saveEditor({snapshot:true}); return; }
    if(button.dataset.botAction==='editor-new-file'){const path=this.document.defaultView.prompt('Имя нового файла','commands.js');if(!path)return;try{await this.#saveProjectFile(path,'// Новый файл бота\n');await this.#renderProjectFiles();const editor=this.root.querySelector('[data-bot-code-editor]');editor.value='// Новый файл бота\n';this.root.dataset.activeFile=path;this.#setEditorStatus(`Создан файл ${path}`);}catch(error){this.notify(error.message||'Не удалось создать файл');}return;}
    if(button.dataset.botAction==='editor-stop'){const {error}=await this.client.rpc('rim_bot_request_runtime',{p_bot_id:this.selectedBot.id,p_desired_state:'stopped'});if(error)this.notify('Не удалось остановить: '+error.message);else this.#setEditorStatus('Остановка запрошена.');return;}
    if(button.dataset.botAction==='editor-run'){ 
      if(!await this.#saveEditor({snapshot:true}))return;
      const activeEntry=this.root?.dataset?.activeFile||'index.js';
      const {error:entryError}=await this.client.from('rim_bot_projects').update({entry_file:activeEntry,updated_at:new Date().toISOString()}).eq('id',this.project.id);
      if(entryError){this.notify('Не удалось сохранить точку входа: '+entryError.message);return;}
      const {error}=await this.client.rpc('rim_bot_request_runtime',{p_bot_id:this.selectedBot.id,p_desired_state:'running'});
      if(error){this.notify('Не удалось поставить бота в очередь: '+error.message);return;}
      this.#setEditorStatus('Запуск запрошен. Если runtime не установлен, бот останется в очереди.');
      this.notify('Команда запуска сохранена.');return;
    }
    if(button.dataset.botFile){
      if(!await this.#saveEditor())return;
      const path=button.dataset.botFile;const {data}=await this.client.from('rim_bot_project_files').select('content').eq('project_id',this.project.id).eq('path',path).maybeSingle();
      const editor=this.root.querySelector('[data-bot-code-editor]');if(editor&&data){editor.value=data.content;this.root.dataset.activeFile=path;this.#setEditorStatus(`Открыт файл ${path}`);}return;
    }
    if(button.dataset.botAction==='editor-download'){ this.#downloadEditorCode(); return; }
    if(button.dataset.botAction==='editor-copy'){ const code=this.root?.querySelector?.('[data-bot-code-editor]')?.value||''; try{await this.document.defaultView.navigator.clipboard.writeText(code);this.notify('Код скопирован.');}catch{this.notify('Не удалось скопировать код.');} return; }
    if(button.dataset.botAction==='refresh')await this.refresh();
    if(button.dataset.botAction==='copy-token'){
      const token=this.root?.querySelector('.rim-bot-token-result')?.dataset.token;if(!token)return;
      try{await this.document.defaultView.navigator.clipboard.writeText(token);this.notify('Токен скопирован. Сохрани его — он больше не будет показан.');}catch{this.notify('Не удалось скопировать токен.');}
    }
    if(button.dataset.botAction==='rotate'){
      if(!this.document.defaultView.confirm('Старый токен немедленно перестанет работать. Продолжить?'))return;
      button.disabled=true;try{const result=await this.#invoke({action:'rotate_token',bot_id:button.dataset.botId});const host=this.root.querySelector('.rim-bot-token-result');host.hidden=false;host.dataset.token=result.token;host.innerHTML=`<div class="token-head"><b>Новый токен создан</b><span>Предыдущий токен отозван</span></div><code>${esc(result.token)}</code><button type="button" data-bot-action="copy-token">Копировать токен</button><p>Сохрани токен сейчас. Повторно показать его нельзя.</p>`;this.notify('Токен бота обновлён.');}catch(error){this.notify('Не удалось сменить токен: '+(error.message||''));}finally{button.disabled=false;}
    }
    if(button.dataset.botAction==='revoke'){
      if(!this.document.defaultView.confirm('Отключить бота? Его токен перестанет работать.'))return;
      button.disabled=true;try{await this.#invoke({action:'revoke',bot_id:button.dataset.botId});await this.refresh();this.notify('Бот отключён.');}catch(error){button.disabled=false;this.notify('Не удалось отключить бота: '+(error.message||''));}
    }
  }
  dispose(){clearTimeout(this.editorTimer); if(this.project && this.root?.querySelector?.('[data-bot-code-editor]')) this.#saveEditor();this.root?.removeEventListener('click',this.click);this.root?.removeEventListener('submit',this.submit);this.root?.removeEventListener('input',this.input);this.root=null;}
}
