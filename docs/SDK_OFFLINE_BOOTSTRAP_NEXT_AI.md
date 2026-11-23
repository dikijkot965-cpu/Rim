# RIM E2E SDK — инструкция следующей нейросети по восстановлению зависимостей без локальных тайм-аутов

## Контекст и причина проблемы

В локальной среде RIM установка из npm registry завершалась сетевой ошибкой `EAI_AGAIN` при обращении к `registry.npmjs.org`. Это не исправлялось повторением `npm install`: DNS/исходящая сеть были недоступны; прямые обращения к GitHub и попытки `curl --resolve` также не давали рабочего скачивания. Не трать время на бесконечные повторы npm в этой среде.

## Проверенный обход

Используй GitHub Actions как сетевой runner: он скачивает пакеты из npm с Ubuntu runner, проверяет опубликованный SHA-512 SDK, собирает offline artifact, после чего artifact скачивается и переносится в рабочую среду RIM.

В репозитории `dikijkot965-cpu/Rim` уже существуют workflows:

- `.github/workflows/rim-e2e-sdk-download.yml` — основной workflow для скачивания SDK и зависимостей в offline artifact.
- `.github/workflows/rim-e2e-sdk-bootstrap.yml` — дополнительный workflow, который также может проверить проект и собрать browser bundle на runner.

Не создавай новый workflow, пока эти два не проверены. Основной — `RIM E2E SDK network bootstrap`.

## Порядок действий через GitHub

1. Открой репозиторий `dikijkot965-cpu/Rim`.
2. Перейди во вкладку **Actions**.
3. В списке workflows выбери **RIM E2E SDK network bootstrap**.
4. Нажми **Run workflow**, ветка — `main` (workflow поддерживает `workflow_dispatch`).
5. Дождись успешного завершения job `fetch-sdk`.
6. Открой запуск workflow и скачай artifact **`rim-e2e-sdk-offline-bootstrap`**. У artifact срок хранения 7 дней — скачай его до истечения срока.
7. Распакуй ZIP. Внутри ожидается структура `rim-sdk/`, содержащая `node_modules/`, `package.json`, `package-lock.json` и `rim-sdk-packages/open-e2ee-signal-protocol-sdk-14.7.0.tgz`.

Workflow уже закрепляет точные версии:

- `@open-e2ee/signal-protocol-sdk@14.7.0`
- `idb@8.0.3`
- `esbuild@0.27.0`
- Node.js `22.16.0` на GitHub runner.

## Проверка целостности SDK

Workflow проверяет SHA-512 опубликованного tarball. Ожидаемое значение для `@open-e2ee/signal-protocol-sdk@14.7.0`:

```text
kKJ0rn1Gxy1nXk3oYq4jVigmDUKcWlbpV7RmmSm8RrW7tRp0QJv01GHqIzHZdPm7WxqinoUgzMiBXB7qU/dB5w==
```

Повторная ручная проверка tarball на Linux:

```bash
openssl dgst -sha512 -binary open-e2ee-signal-protocol-sdk-14.7.0.tgz | openssl base64 -A
```

Результат должен полностью совпасть со строкой выше. Не отключай проверку integrity и не подменяй tarball одноимённым пакетом другой версии.

## Восстановление в рабочем проекте RIM

После скачивания artifact:

1. Сохрани исходный ZIP как отдельный bootstrap artifact.
2. Скопируй содержимое `rim-sdk/node_modules/` в `node_modules/` корня текущего проекта RIM.
3. Скопируй исходный SDK tarball в `vendor/` текущего проекта, сохранив имя файла.
4. Не заменяй корневой `package.json` или корневой `package-lock.json` файлами из `rim-sdk/`: это bootstrap-проект с отдельным lock-файлом, а не lock-файл полного RIM.
5. Сверь корневые версии зависимостей RIM с закреплёнными версиями выше. Сохраняй корневой lock-файл RIM.
6. Не запускай `npm install`/`npm ci` в изолированной среде. Восстанови уже установленные `node_modules` копированием из artifact.
7. Проверь наличие SDK entrypoint и browser stores:

```bash
node --input-type=module -e "import('@open-e2ee/signal-protocol-sdk').then(m => { if (typeof m.createSignalProtocolClient !== 'function') process.exit(2); console.log('Signal SDK entrypoint OK'); })"
```

```bash
test -f node_modules/@open-e2ee/signal-protocol-sdk/dist/local/store/web-sqlite/index.js
test -f node_modules/@open-e2ee/signal-protocol-sdk/dist/local/store/web/index.js
```

8. Запусти проверки RIM: `npm run check`, `npm run check:syntax`, `npm test`, затем `npm run test:e2e:relay` и `npm run build:cloudflare`.

## Уже существующий локальный резервный artifact

В предыдущих итерациях artifact был скачан и сохранён как `rim-e2e-sdk-offline-bootstrap.zip` (около 21 MB). В текущем рабочем окружении он находится по пути `/mnt/data/files/rim-e2e-sdk-offline-bootstrap.zip`. Если этот файл уже доступен, сначала используй его и проверь SHA-512 tarball внутри; повторно запускать GitHub Actions не требуется.

## Важные запреты

- Не возвращай проект на `Iteration 144`: она была исключена из проверенной линии. Продолжай от последнего переданного архива Iteration 146/147.
- Не меняй версии SDK, `idb`, `esbuild` без отдельного анализа совместимости и обновления тестов.
- Не делай вывод, что E2E готово, только потому что SDK импортируется или сборка проходит.
- Не включай `protocolReady` и не применяй E2E migrations к production Supabase до SQL-валидации и настоящего двухаккаунтного теста.
- Не публикуй service-role/secret ключи и не помещай их в клиентский bundle.
