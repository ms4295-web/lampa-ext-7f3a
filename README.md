# ms4295-plugin

Пустой каркас JS-плагина для [Lampa](https://github.com/yumata/lampa) /
[Lampac NextGen](https://github.com/lampac-nextgen/lampac).

## Структура

```
.
├── plugin.js     # сам плагин (точка входа — startPlugin())
├── manifest.json # метаданные для каталогов плагинов (опционально)
└── README.md
```

## Подключение

### Вариант 1 — напрямую в Lampa

1. Откройте Lampa → **Настройки** → **Плагины**.
2. **Добавить плагин** → вставьте URL:
   ```
   https://raw.githubusercontent.com/ms4295-web/ms4295-plugin/main/plugin.js
   ```
3. Перезапустите Lampa.

> Если включён GitHub Pages, доступен и более стабильный адрес:
> `https://ms4295-web.github.io/ms4295-plugin/plugin.js`

### Вариант 2 — через Lampac NextGen

Положите файл в каталог плагинов Lampac:

```
/lampac/plugins/override/ms4295-plugin.js
```

Для Docker — примонтируйте томом в `docker-compose.yaml`:

```yaml
services:
  lampac:
    image: ghcr.io/lampac-nextgen/lampac
    volumes:
      - ./lampac-docker/plugins/ms4295-plugin.js:/lampac/plugins/override/ms4295-plugin.js
```

После этого плагин будет доступен по адресу
`http://<IP>:9118/ms4295-plugin.js` — его и можно добавить в Lampa.

## Что уже есть в каркасе

- `Lampa.Lang.add()` — переводы (ru / en / uk / be).
- `Lampa.SettingsApi.addComponent()` + `addParam()` — собственный раздел
  в настройках Lampa с переключателем «Включить плагин».
- `Lampa.Listener.follow('full', ...)` — хук на открытие карточки фильма.
- `Lampa.Listener.follow('app', ...)` — хук на старт приложения.
- Защита от двойной инициализации через `window.ms4295_plugin`.

## Полезные API

| API | Назначение |
| --- | --- |
| `Lampa.Storage.field(name)` / `.set(name, value)` | чтение и запись настроек |
| `Lampa.Template.add(name, html)` / `.get(name, vars, plain)` | HTML-шаблоны |
| `Lampa.Controller.add(name, {...})` / `.toggle(name)` | управление фокусом с пульта |
| `Lampa.Activity.active()` | текущая активность |
| `Lampa.Noty.show(text)` | всплывающее уведомление |
| `Lampa.Api.sources.tmdb.get(method, params, onOk, onErr)` | запросы к TMDB |
| `Lampa.Lang.translate(key)` | получить перевод |

## Ключевые точки для правки

| Где | Что менять |
| --- | --- |
| `PLUGIN_KEY` в `plugin.js` | уникальный ключ плагина (сейчас `ms4295_plugin`) |
| `Lampa.Lang.add({...})` | тексты и переводы |
| `icon` | SVG-иконка в настройках |
| `Lampa.Listener.follow('full', ...)` | логика на карточке фильма |

## Лицензия

MIT
