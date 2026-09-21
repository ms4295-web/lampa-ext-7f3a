# lampa-ext-7f3a

Форк плагина **hdpoisk** для [Lampa](https://github.com/yumata/lampa) / [Lampac NextGen](https://github.com/lampac-nextgen/lampac).

| | |
| --- | --- |
| **Оригинал** | https://udemika.github.io/wich/hdpoisk.js |
| **Автор оригинала** | `udemika` |
| **Размер** | ~119 КБ (2217 строк исходника) |
| **Лицензия** | MIT |

> Код скопирован **без изменений**, добавлен только заголовок с указанием авторства.
> Весь функционал принадлежит оригинальному автору.

---

## Подключение

### URL плагина

```
https://raw.githubusercontent.com/ms4295-web/lampa-ext-7f3a/main/plugin.js
```

Стабильный вариант через GitHub Pages (сборка занимает 1-5 минут после первого пуша):

```
https://ms4295-web.github.io/lampa-ext-7f3a/plugin.js
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
  https://raw.githubusercontent.com/ms4295-web/lampa-ext-7f3a/main/plugin.js
```

```yaml
services:
  lampac:
    image: ghcr.io/lampac-nextgen/lampac
    volumes:
          - ./lampac-docker/plugins/hdpoisk.js:/lampac/plugins/hdpoisk.js
```

---

## Quality Filter (второй плагин)

Отдельный плагин `quality-filter.js` — отсекает качество видео ниже выбранного порога
(по умолчанию 1080p):

- убирает низкие качества из списка качеств в плеере (работает для всех источников:
  встроенный онлайн, плагины, IPTV);
- прячет карточки видео в списках онлайн-компонентов с качеством ниже порога;
- настройки: `Настройки` -> `Фильтр качества` (включение и выбор порога:
  720p / 1080p / 1440p / 2160p).

Если у видео все качества ниже порога — список не меняется, воспроизведение не ломается.

### URL плагина

```
https://raw.githubusercontent.com/ms4295-web/lampa-ext-7f3a/main/quality-filter.js
```

Через GitHub Pages:

```
https://ms4295-web.github.io/lampa-ext-7f3a/quality-filter.js
```

---

## Country Filter (третий плагин)

Отдельный плагин `country-filter.js` — прячет карточки контента из выбранных стран
во всех списках Lampa (каталоги, рекомендации, поиск, история):

- страны по умолчанию: **Корея, Китай, Турция, Индия, Пакистан, Афганистан**;
- каждую страну можно отдельно включить/выключить;
- дополнительная настройка — фильтр по языку оригинала;
- настройки: `Настройки` -> `Фильтр стран`.

### URL плагина

```
https://raw.githubusercontent.com/ms4295-web/lampa-ext-7f3a/main/country-filter.js
```

Через GitHub Pages:

```
https://ms4295-web.github.io/lampa-ext-7f3a/country-filter.js
```

---

## YouTube (четвёртый плагин)

Отдельный плагин `youtube-plugin.js` — **полноценный клиент YouTube** (как браузерная
версия или APK), без аккаунта Google:

- **Главная** — тренды выбранного региона (сетка карточек с обложками, длительностью,
  просмотрами и датой);
- **Поиск** — постраничная загрузка результатов (кнопка «Загрузить ещё»);
- **Страница видео** — герой-баннер, название, метаданные (просмотры, дата, лайки),
  блок канала, описание, похожие видео и комментарии;
- **Страница канала** — видео канала, подгрузка следующих страниц;
- **Воспроизведение в 4K** через собственный сервер **cobalt** (true 2160p), с откатом
  на лучший muxed-поток Piped и далее на нативный плеер;
- **Выбор качества** — длинное нажатие на герой-баннере видео (2160p / 1440p /
  1080p / 720p / 480p / 360p);
- в главном меню появляется пункт **YouTube**;
- настройки: `Настройки` → `YouTube` (URL Piped, URL и ключ cobalt, качество по
  умолчанию, регион трендов).

Контент берётся из публичного API **Piped** (не нужны аккаунт и ключи), а само
воспроизведение — через **cobalt**, единственный экстрактор, отдающий настоящие 4K-потоки.

### Настройка Piped

По умолчанию используется `https://api.piped.private.coffee`. Если он не отвечает,
подставьте любой рабочий инстанс из списка
https://github.com/TeamPiped/Piped-Kubernetes or https://piped.video/instances —
поле **URL Piped** в настройках плагина.

### Настройка cobalt (для 4K)

Публичный `api.cobalt.tools` больше не принимает запросы YouTube, поэтому cobalt
нужно поднять самостоятельно (бесплатно, Docker):

```bash
docker run -d --name cobalt -p 9000:9000 ghcr.io/imputnet/cobalt
```

Затем в настройках плагина укажите **URL cobalt**: `http://IP-СЕРВЕРА:9000`.

Опционально можно защитить сервер ключом API при запуске:

```bash
docker run -d --name cobalt -p 9000:9000 \
  -e API_KEY=ВАШ_КЛЮЧ ghcr.io/imputnet/cobalt
```

Тот же ключ впишите в поле **Ключ API cobalt** в настройках плагина.

> Если cobalt не настроен, плагин всё равно работает — воспроизведение идёт через
> лучший muxed-поток Piped (обычно 720p), а при его недоступности — через нативный
> YouTube-плеер Lampa.

### Использование

1. Установите плагин (URL ниже), перезапустите Lampa
2. (Опционально) `Настройки` → `YouTube` → укажите URL Piped и URL cobalt
3. Пункт **YouTube** в главном меню

> Аккаунт Google не требуется. Никакие данные не покидают устройство, кроме
> запросов к Piped и вашему cobalt-серверу.

### URL плагина

```
https://raw.githubusercontent.com/ms4295-web/lampa-ext-7f3a/main/youtube-plugin.js
```

Через GitHub Pages:

```
https://ms4295-web.github.io/lampa-ext-7f3a/youtube-plugin.js
```

---

## Что внутри

Плагин подключает несколько платных онлайн-источников и автоматически ротирует учётные записи при исчерпании лимита.

| Источник | Хосты | Механизм |
| --- | --- | --- |
| **Skaz** | `online3.skaz.tv`, `online4.skaz.tv`, `online5.skaz.tv`, `onlinecf3-5.skaz.tv`, `skaztv.top` | ротация 3 аккаунтов (`SKAZ_ACCOUNTS`) |
| **AB2024** | `ab2024.ru` | ротация токенов (`AB_TOKENS`) |
| **Showy** | `wtch.ch`, `89.110.97.220:10254` | ротация зеркал (`MIRRORS_SHOWY`) |

> Удалены неработающие источники: **HD Poisk** (`hdpoisk.ru`), **LampaUA** (`lampaua.mooo.com`), **Beta L-Vid** (`beta.l-vid.online`), **OkeanTV** (`148.135.207.174:12359`).

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
git clone https://github.com/ms4295-web/lampa-ext-7f3a.git
```

Файл **минифицирован частично** и содержит длинные строки (до 6119 символов). Для удобной правки:

1. Прогнать через форматтер - `npx prettier --write plugin.js`
2. Либо открыть в VS Code и использовать `Alt+Z` (перенос строк)

После пуша в `main` изменения подхватываются сразу - `raw.githubusercontent.com` обновляется мгновенно, GitHub Pages через 1-2 минуты.

> **Кэш:** Lampa кэширует плагины. После обновления очистите кэш или добавьте `?v=2` к URL для проверки.

---

## Структура репозитория

```
lampa-ext-7f3a/
├── plugin.js           # плагин hdpoisk (источники онлайн)
├── quality-filter.js   # плагин: фильтр качества видео (от 1080p)
├── country-filter.js   # плагин: фильтр стран контента
├── youtube-plugin.js   # плагин: YouTube (Piped + cobalt, 4K)
├── manifest.json       # метаданные
├── README.md           # этот файл
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
https://<TOKEN>@raw.githubusercontent.com/ms4295-web/lampa-ext-7f3a/main/plugin.js
```

---

## Ссылки

- Оригинал: https://udemika.github.io/wich/hdpoisk.js
- Lampa: https://github.com/yumata/lampa
- Lampac NextGen: https://github.com/lampac-nextgen/lampac
- Документация Lampac: https://docs.lampac.dev