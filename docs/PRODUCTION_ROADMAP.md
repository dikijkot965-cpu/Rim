# RIM — путь к продукту «белого света»

Цель: мессенджер, которому доверяют незнакомые пользователи, а не только круг друзей.

## Уровни готовности

| Уровень | Критерий | Статус (iter.99) |
| --- | --- | --- |
| L0 Прототип | Можно показать | Пройден |
| L1 Архитектура клиента | Модули, тесты, dual-bind retirement | **В процессе (~8/10 клиента)** |
| L2 Продуктовый UX | Стабильные ЛС/каналы/навигация без регрессий | Частично |
| L3 Безопасность | RLS review, XSS pass, pin deps | Частично |
| L4 Наблюдаемость | Ошибки, метрики, health | Слабо |
| L5 Нагрузка | Realtime/DB под concurrent users | Не доказано |
| L6 Релиз | Поддержка, миграции, rollback | Не готово |

## Инженерный backlog (порядок)

1. **Клиент-ядро**
   - Bootstrap только как shim (auth client + lexical mirror + initializeApp).
   - Все user flows через application/composition owners.
2. **Домен**
   - Message, conversation, username, channel membership rules в `src/domain`.
3. **Доказательство UX**
   - Playwright: login → chat → send → switch → channel.
   - Live QA checklist на двух аккаунтах.
4. **Безопасность**
   - `npm run audit:html` + fix unescaped sinks.
   - Supabase RLS / SECURITY DEFINER review.
5. **Данные**
   - `sql/migrations/*` как источник схемы.
6. **Масштаб**
   - Индексы, лимиты send, пагинация, connection budget.

## Что не делать

- Не раздувать фичи (радио, звонки WebRTC) пока L2 нестабилен.
- Не переписывать UI «с нуля» без продуктовой причины.
- Не объявлять 10/10 по зелёным unit-тестам.


## Update 112

Bootstrap client shim is under 300 LOC. Next product proofs: install Playwright and run `npm run test:e2e`; dual-account live QA; XSS audit pass.
