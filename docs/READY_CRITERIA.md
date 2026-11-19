# Критерии готовности RIM (клиент)

«Готово» — не одно слово. Ниже три уровня. Мы целимся в **уровень 2**, потом 3.

---

## Уровень 1 — Maintainable modular core (минимум «можно жить»)

Код **готов на уровне 1**, когда одновременно:

1. **Hot-path modular**  
   Open / send / load messages / list / shell / channels open / forward / settings entrypoints идут через composition + application, не через «живой» legacy body по умолчанию.

2. **Ownership flags**  
   `__RIM_*_OWNED` выставляются на boot; legacy не перетирает modular на этих путях (dual-bind + тесты).

3. **Тесты**  
   `npm test` зелёный (сейчас 288+); нет orphan import (bind объявлен и **вызывается**).

4. **Browser smoke**  
   - `runtime-smoke.html` → `rimReady=true`  
   - `runtime-integration-smoke.html` → `modularOpen`, `messageLoaded`, `legacyLoaderBypassed`

5. **UI contract**  
   Дизайн/разметка продукта не ломались сознательно (только внутренности).

6. **Один bootstrap**  
   `app.js` — склейка surfaces, не монолит бизнес-логики.

*На .84 уровень 1 почти выполнен; legacy tags ещё в HTML — это уже уровень 2.*

---

## Уровень 2 — Legacy не грузится (цель текущего трека)

Код **готов на уровне 2**, когда:

1. Выполнен **уровень 1**.
2. В `index.html` **нет** `<script src="assets/js/legacy/...">`. Допускается один документированный runtime bootstrap вне `legacy/` (`rim-runtime-bootstrap.js`) до полного выноса auth/state в modules.
3. После снятия каждого tag — **smoke зелёный**.
4. Нет регрессии: open, send, list, channel, group settings, forward, search, profile в smoke/ручной проверке на стенде.
5. `docs/STAGE_C_SCRIPT_TAG_ORDER.md` закрыт или помечен done.

**Оценка от .84:** ещё **~3–7** генераций.

---

## Уровень 3 — Product confidence (не «миллиард»)

1. Уровень 2.
2. Прогон на **живом Supabase** (не только mock smoke): auth, realtime, вложения, блоки.
3. Список известных дыр пуст или заведен в issues с приоритетом.
4. Нет секретов/ключей в клиентском репо в открытом виде сверх publishable anon.

---

## Что **не** входит в «готово» этого проекта

- Архитектура на **1B users** / свой messaging backend  
- Полный выкидыш Supabase  
- Смена UI/дизайна  

---

## Как я пойму в конкретной генерации

| Сигнал | Значение |
|--------|----------|
| `npm test` fail | не готово |
| smoke `messageLoaded=false` / нет `modularOpen` | откат tag / чинить open |
| legacy tag снят + smoke OK | прогресс к уровню 2 |
| все tags сняты + smoke OK + уровень 1 | **уровень 2 = готов по текущей цели** |
