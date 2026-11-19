# Legacy retirement — прямой ответ

**Version:** 4.0.0-iteration.66  
**Date:** 2026-11-16

## Уберём ли все legacy?

**Да. Цель — убрать все 24 legacy script tags из runtime.**  
Сейчас — **нет**, они ещё грузятся. Это не «навсегда», это этап миграции.

## Когда?

Не одной кнопкой. Три стадии:

### Стадия A — dual-bind dead (сейчас → ~8–12 итераций)
Modular **владеет** open/send/timeline/shell/channels/…  
Legacy тела либо не вызываются, либо no-op под `__RIM_*_OWNED`.  
**Script tags ещё в HTML.** Удалять нельзя: порядок загрузки, побочные глобалы, fallback.

### Стадия B — no-op + smoke (после A, ~4–8 итераций)
Внутри legacy файлов остаются пустые/тонкие обёртки.  
Browser smoke по open/send/list/channel/group.  
Только после зелёного smoke — кандидаты на снятие tags.

### Стадия C — снятие script tags (после B, ~3–6 итераций)
Сначала мелкие (19–23), потом 18/24/25, потом 02–12.  
Каждый tag снимается отдельно + регресс.

**Ориентир до «legacy больше не грузится»:** примерно **15–25** итераций от .66, если без провалов smoke.  
**Не** «в следующей генерации удалю всё».

## Почему не сейчас?

1. Load order: legacy раньше module; глобалы (`activeConversation`, DOM helpers) ещё читает мост.
2. Не всё покрытие flags+tests+smoke.
3. Массовое удаление без smoke = сломанный чат.

## Что уже не «настоящий» legacy open path

Modular `ConversationOpenService` + `__RIM_MODULAR_OPEN_IMPL` — основной open.  
Legacy 18/24 open **не вызывается**, если module жив (guards + wrap).

## Правило удаления одного файла

Файл можно выкинуть только если:
- все его entrypoints имеют modular owner + flag;
- dual-bind/tests зелёные;
- smoke не показал дыру;
- из `index.html` убран script tag и ничего не падает.

**Итог:** уберём всё — **да**. Когда — **после A→B→C**, не «завтра одним zip». Сейчас стадия **A**.
