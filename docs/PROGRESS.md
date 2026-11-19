# RIM — Progress Report

**Version:** 4.0.0-iteration.29  
**Date:** 2026-11-15

## Code mass

| Layer | Bytes | Share |
|-------|------:|------:|
| Modular `src/` (42 files) | 247,628 | 32.6% |
| Legacy scripts (24 files) | 486,425 | 64.1% |
| Core bridge | 24,471 | 3.2% |
| **Total** | **758,524** | **100%** |

```
Modular  [██████░░░░░░░░░░░░░░] 33%
Legacy   [████████████░░░░░░░░] 64%
```

## Feature ownership readiness

| Area | % | Bar |
|------|--:|-----|
| Сообщения: load/timeline/realtime | 88% | `█████████████████░░░` |
| Сообщения: base render HTML | 78% | `███████████████░░░░░` |
| Сообщения: decorations/receipts/reply/react | 92% | `██████████████████░░` |
| Сообщения: send/edit/delete/commands | 82% | `████████████████░░░░` |
| Список чатов (load + paint) | 90% | `████████████████░░░░` |
| Открытие чата / shell / navigation | 90% | `██████████████████░░` |
| Typing / presence | 88% | `█████████████████░░░` |
| Каналы: directory/feed/settings read | 80% | `████████████████░░░░` |
| Каналы: mutations join/mod/save/invite/role | 80% | `████████████████░░░░` |
| Группы: settings read | 72% | `██████████████░░░░░░` |
| Группы: create + прочие mutations | 85% | `████████░░░░░░░░░░░░` |
| Админка / ads / analytics | 60% | `██░░░░░░░░░░░░░░░░░░` |
| Voice messages | 75% | `████░░░░░░░░░░░░░░░░` |
| Writer / favorites / music | 55% | `███████████░░░░░░░░░` |
| Legacy retirement (можно удалять файлы) | 20% | `████░░░░░░░░░░░░░░░░` |

**Overall modern-runtime ownership (avg of areas):** **65%**

### Readiness gates (checklist)

| Gate | Status |
|------|--------|
| Hot path (open chat → messages → send → realtime) modular | mostly yes |
| Channel read + core mutations modular | mostly yes |
| Group mutations complete | partial |
| Legacy files deletable without feature loss | no |
| Browser E2E on rapid chat switch | not yet |
| Backend adapter boundary (swap Supabase) | not yet intentional |

