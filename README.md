# ms4295-plugin

Форк плагина **hdpoisk** для [Lampa](https://github.com/yumata/lampa) / [Lampac NextGen](https://github.com/lampac-nextgen/lampac).

| | |
| --- | --- |
| **Оригинал** | https://udemika.github.io/wich/hdpoisk.js |
| **Автор оригинала** | `udemika` |
| **Размер** | ~128 КБ (2372 строки исходника) |
| **Лицензия** | MIT |

> Код скопирован **без изменений**, добавлен только заголовок с указанием авторства.
> Весь функционал принадлежит оригинальному автору.

---

## Подключение

### URL плагина

```
https://raw.githubusercontent.com/ms4295-web/ms4295-plugin/main/plugin.js
```

Стабильный вариант через GitHub Pages (сборка занимает 1-5 минут после первого пуша):

```
https://ms4295-web.github.io/ms4295-plugin/plugin.js
```

### В Lampa

1. `Настройки` -> `Плагины` -> `Добавить плагин`
2. Вставить URL выше
3. Перезапустить Lampa
4. В настройках появятся разделы **IPTV Skaz** и **Lampac Skaz**

### В Lampac NextGen (Docker)

```bash
mkdir -p lampac-docker/plugins
curl -o lampac-docker/plugins/hdpoisk.js \
  https://raw.githubusercontent.com/ms4295-web/ms4295-plugin/main/plugin.js
```

```yaml
services:
  lampac:
    image: ghcr.io/lampac-nextgen/lampac
    volumes:
      - ./lampac-docker/plugins/hdpoisk.js:/lampac/plugins/hdpoisk.js
```

---

## Что внутри

Плагин подключает несколько платных онлайн-источников и автоматически ротирует учётные записи при исчерпании лимита.

| Источник | Хосты | Механизм |
| --- | --- | --- |
| **Skaz** | `online3.skaz.tv`, `online4.skaz.tv`, `online5.skaz.tv`, `onlinecf3-5.skaz.tv`, `skaztv.top` | ротация 3 аккаунтов (`SKAZ_ACCOUNTS`) |
| **AB2024** | `ab2024.ru` | ротация токенов (`AB_TOKENS`) |
| **HDpoisk** | `hdpoisk.ru` | статический `TOKEN` |
| **Showy** | `wtch.ch`, `89.110.97.220:10254` | ротация зеркал (`MIRRORS_SHOWY`) |
| **Прочее** | `lampaua.mooo.com`, `beta.l-vid.online`, `148.135.207.174` | резервные зеркала |

Ключевые переменные находятся в самом начале файла:

```js
var connection_source   = 'ab2024';   // активный источник по умолчанию
var AB_TOKENS           = [ ... ];    // токены AB2024
var MIRRORS_SHOWY       = [ ... ];    // зеркала Showy
var SKAZ_ACCOUNTS       = [ ... ];    // аккаунты Skaz
var current_ab_token_index   = 0;
var current_showy_index      = 0;
```

---

## Редактирование

Репозиторий ваш - правьте прямо в веб-интерфейсе GitHub (карандаш на файле `plugin.js`) или клонируйте локально:

```bash
git clone https://github.com/ms4295-web/ms4295-plugin.git
```

Файл **минифицирован частично** и содержит длинные строки (до 6119 символов). Для удобной правки:

1. Прогнать через форматтер - `npx prettier --write plugin.js`
2. Либо открыть в VS Code и использовать `Alt+Z` (перенос строк)

После пуша в `main` изменения подхватываются сразу - `raw.githubusercontent.com` обновляется мгновенно, GitHub Pages через 1-2 минуты.

> **Кэш:** Lampa кэширует плагины. После обновления очистите кэш или добавьте `?v=2` к URL для проверки.

---

## Структура репозитория

```
ms4295-plugin/
├── plugin.js        # сам плагин (hdpoisk + заголовок авторства)
├── manifest.json    # метаданные
├── README.md        # этот файл
└── .gitignore
```

Первоначальный пустой каркас сохранён в истории git (коммит `7b1eaf9`) - вернуть:

```bash
git checkout 7b1eaf9 -- plugin.js
```

---

## Предупреждение

Репозиторий **публичный**. Плагин содержит учётные данные сторонних сервисов и даёт доступ к платному контенту. Возможны:

- DMCA takedown от правообладателей сервисов
- блокировка репозитория или аккаунта GitHub
- отзыв учётных данных автором оригинала в любой момент

Если это критично - сделайте репозиторий приватным (`Settings` -> `Danger Zone` -> `Change visibility`). Для подключения из Lampa приватный репозиторий тоже работает, но потребуется токен в URL:

```
https://<TOKEN>@raw.githubusercontent.com/ms4295-web/ms4295-plugin/main/plugin.js
```

---

## Ссылки

- Оригинал: https://udemika.github.io/wich/hdpoisk.js
- Lampa: https://github.com/yumata/lampa
- Lampac NextGen: https://github.com/lampac-nextgen/lampac
- Документация Lampac: https://docs.lampac.dev