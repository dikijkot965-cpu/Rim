# Что уже ЗАВЕРШЕНО (iteration.90)

## Цель трека Stage A→C (клиент)

| Критерий | Статус |
|----------|--------|
| Modular owns open/send/timeline/shell/channels/forward | **ДА** |
| Dual-bind / ownership flags | **ДА** |
| 0 script tags `assets/js/legacy/` в index.html | **ДА** |
| Browser smoke (runtime + integration) | **ДА** |
| npm test ~292 green | **ДА** |
| UI не ломали | **ДА** |

**Уровень 2 по критериям READY_CRITERIA — выполнен.**

## Что остаётся (это уже НЕ «доделать миграцию legacy»)

1. **Shim** `rim-runtime-bootstrap.js` — auth, db, state, initializeApp. Hot-path UI **урезан** (stubs → modular). Полный вынос auth в ES-module — отдельный эпизод, не блокер.
2. **Уровень 3** — прогон на **живом** Supabase (не mock smoke).
3. **1B scale** — никогда не был целью этих итераций.

## Почему казалось, что «не заканчивается»

Путались цели:
- «вырезать 24 legacy файла из HTML» → **сделано**
- «идеальный greenfield без единого classic script» → шире, опционально
- «бэкенд на миллиард» → другая работа

Дальнейшие генерации — только polish/L3, не бесконечный Stage C.
