# RIM — полный статус (iteration.91)

## Когда можно смело фиксить баги и добавлять функции

**Уже сейчас** — для hot-path (открытие чата, отправка, лента, список, каналы, forward, settings entrypoints).

Правила:
1. Новый код — в `src/application/*` + `src/composition/*`, не в `rim-runtime-bootstrap.js`.
2. Не возвращать логику в `assets/js/legacy/*` (даже если файлы лежат на диске).
3. После фичи: `npm test` + при возможности headless smoke.
4. UI/CSS/HTML layout — не трогать без отдельного решения (контракт заморожен).

Живой Supabase (уровень 3) желателен перед крупным релизом, но **не блокер** для разработки фич на modular-слое.

## Сколько генераций осталось

| Работа | Оценка |
|--------|--------|
| Обязательный Stage C / dual-bind | **0 — сделано** |
| Опциональный polish bootstrap (ещё ужать auth/init) | 0–2 |
| Level 3 live QA | отдельно, не «генерации рефакторинга» |
| 1B architecture | не в этом проекте |

**Для цели «можно пилить продукт» — осталось 0 обязательных рефакторинг-генераций.**

## Что сделано за всё время (сжато)

1. Старт с мини-HTML чата на Supabase.
2. Рост в продукт RIM (диалоги, каналы, группы, админка, UI).
3. Вынос в modular: repositories, application services, 14 composition surfaces, `app.js` ~384 строки склейки.
4. Dual-bind ownership (`__RIM_*_OWNED`) против перетирания legacy.
5. ~292 автотеста, project check, headless Chrome smoke.
6. **Все 24 `assets/js/legacy/*.js` сняты с index.html.**
7. Один shim: `rim-runtime-bootstrap.js` (db, state, auth, initializeApp + thin stubs).
8. Hot-path stubs делегируют в modular.

## Что остаётся и зачем

| Остаток | Зачем нужен | Надо ли для фич |
|---------|-------------|-----------------|
| `rim-runtime-bootstrap.js` | Создаёт `db`, lexical state, login/session, первый `initializeApp` | Да как boot, нет как место для новых фич |
| Файлы в `assets/js/legacy/` на диске | Архив/история, не грузятся | Нет |
| Live QA | Уверенность на реальном бэке | Для релиза — да; для кода фич — нет |
| Scale 1B | Другая серверная архитектура | Нет |

## Нормальный ли код

**Да, для maintainable product client — нормальный и выше среднего legacy-SPA.**

Плюсы:
- Слои (composition / application / infrastructure)
- Result-стиль ошибок на сервисах
- Ownership flags, тесты, smoke
- Монолит разбит

Минусы (честно):
- Ещё classic bootstrap (не ES-module auth)
- Не MIT-research-grade и не hyperscale
- Часть surface всё ещё завязана на `window` API под HTML onclick

Это **рабочий modular hybrid**, на котором уже можно чинить баги и наращивать функции без страха «тронул — развалилось 24 скрипта».
