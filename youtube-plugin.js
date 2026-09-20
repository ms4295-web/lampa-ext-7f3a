/**
 * ============================================================================
 *  Plugin: YouTube (с личным аккаунтом Google)
 * ----------------------------------------------------------------------------
 *  Просмотр YouTube в Lampa с авторизацией через личный аккаунт:
 *
 *    - подписки (каналы -> свежие видео), понравившиеся, смотреть позже,
 *      история просмотров, поиск видео;
 *    - воспроизведение через встроенный YouTube-плеер Lampa
 *      (Lampa.Player.play + плейлист);
 *    - авторизация по протоколу OAuth 2.0 (device flow) — требуется
 *      собственный OAuth Client ID, инструкция внутри настроек плагина.
 *
 *  Настройки: Настройки -> YouTube
 *  Пункт главного меню: YouTube
 * ============================================================================
 */
(function () {
    'use strict';

    if (window.youtube_plugin) return;
    window.youtube_plugin = true;

    var COMPONENT = 'youtube';

    var OAUTH_DEVICE = 'https://oauth2.googleapis.com/device/code';
    var OAUTH_TOKEN  = 'https://oauth2.googleapis.com/token';
    var API_BASE     = 'https://www.googleapis.com/youtube/v3';
    var SCOPE        = 'https://www.googleapis.com/auth/youtube';
    var GRANT_DEVICE = 'urn:ietf:params:oauth:grant-type:device_code';

    var Network = Lampa.Reguest;

    // --------------------------------------------------------------------------
    //  Хранилище
    // --------------------------------------------------------------------------

    function clientId() {
        return (Lampa.Storage.get('yt_client_id', '') + '').trim();
    }

    function getTokens() {
        var t = Lampa.Storage.get('yt_tokens', null);
        return t && typeof t === 'object' ? t : null;
    }

    function setTokens(t) {
        Lampa.Storage.set('yt_tokens', t);
    }

    function loggedIn() {
        var t = getTokens();
        return !!(t && t.access_token);
    }

    // --------------------------------------------------------------------------
    //  Утилиты
    // --------------------------------------------------------------------------

    function esc(v) {
        return String(v === undefined || v === null ? '' : v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ISO 8601 длительность (PT1H2M3S) -> человекочитаемый вид
    function parseDuration(iso) {
        if (!iso) return '';
        var m = String(iso).toUpperCase().match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!m) return '';
        var h = parseInt(m[1] || 0, 10);
        var mi = parseInt(m[2] || 0, 10);
        var s = parseInt(m[3] || 0, 10);
        if (h > 0) return h + ':' + ('0' + mi).slice(-2) + ':' + ('0' + s).slice(-2);
        return mi + ':' + ('0' + s).slice(-2);
    }

    function thumb(snippet, prefer) {
        var t = (snippet && snippet.thumbnails) || {};
        var keys = prefer || ['maxres', 'standard', 'high', 'medium', 'default'];
        for (var i = 0; i < keys.length; i++) {
            if (t[keys[i]] && t[keys[i]].url) return t[keys[i]].url;
        }
        return '';
    }

    function notify(msg) {
        try {
            Lampa.Noty.show(msg);
        } catch (e) {}
    }

    // --------------------------------------------------------------------------
    //  Авторизация (OAuth 2.0 device flow)
    // --------------------------------------------------------------------------

    var auth = {
        network: null,
        polling: false,
        cancelled: false
    };

    function authNetwork() {
        if (!auth.network) auth.network = new Network();
        return auth.network;
    }

    function saveTokens(tok) {
        if (!tok || !tok.access_token) return;
        var old = getTokens() || {};
        setTokens({
            access_token: tok.access_token,
            refresh_token: tok.refresh_token || old.refresh_token || '',
            expires_at: tok.expires_in ? Date.now() + (tok.expires_in - 60) * 1000 : 0
        });
    }

    // Получить валидный access token (с обновлением по refresh_token)
    function getToken(call) {
        var t = getTokens();

        if (!t || !t.access_token) return call(null);

        if (t.expires_at && Date.now() < t.expires_at) return call(t.access_token);

        if (!t.refresh_token) return call(null);

        refreshTokens(function(ok) {
            var nt = getTokens();
            call(ok && nt ? nt.access_token : null);
        });
    }

    function refreshTokens(call) {
        var t = getTokens();
        if (!t || !t.refresh_token) return call(false);

        var net = authNetwork();

        net.silent(OAUTH_TOKEN, function (tok) {
            if (tok && tok.access_token) {
                saveTokens(tok);
                call(true);
            } else call(false);
        }, function () {
            call(false);
        }, {
            client_id: clientId(),
            grant_type: 'refresh_token',
            refresh_token: t.refresh_token
        });
    }

    // Запуск авторизации: запрос device code + показ кода пользователю
    function startLogin() {
        var cid = clientId();

        if (!cid) {
            notify('Сначала укажите OAuth Client ID в настройках');
            return;
        }

        var net = authNetwork();

        net.silent(OAUTH_DEVICE, function (res) {
            if (!res || !res.device_code) {
                notify('Не удалось начать авторизацию');
                return;
            }
            showAuthModal(res);
        }, function () {
            notify('Ошибка запроса авторизации');
        }, {
            client_id: cid,
            scope: SCOPE
        });
    }

    function logout() {
        setTokens(null);
        Lampa.Storage.set('yt_account', null);
        updateStatus();
        notify('Вы вышли из аккаунта');
    }

    // Модальное окно с кодом авторизации + опрос токена
    function showAuthModal(res) {
        var modal_html = $(
            '<div class="about">' +
            '<div style="font-size:1.2em;margin-bottom:0.6em">Откройте на устройстве с браузером:</div>' +
            '<div style="font-size:1.4em;font-weight:700;margin-bottom:0.3em">' + esc(res.verification_url || 'google.com/device') + '</div>' +
            '<div style="margin-bottom:0.3em">и введите код:</div>' +
            '<div class="extensions__item-code" style="font-size:1.8em;letter-spacing:0.1em;font-weight:700">' + esc(res.user_code || '') + '</div>' +
            '<div style="margin-top:0.8em;opacity:0.7">Ожидание подтверждения...</div>' +
            '</div>'
        );

        try {
            Lampa.Modal.open({
                title: 'Авторизация YouTube',
                html: modal_html,
                size: 'medium'
            });
        } catch (e) {
            notify('Код авторизации: ' + (res.user_code || '') + ' на ' + (res.verification_url || 'google.com/device'));
        }

        auth.cancelled = false;
        pollToken(res, 1);
    }

    function pollToken(res, attempt) {
        if (auth.cancelled) return;

        var cid = clientId();
        var net = authNetwork();

        net.silent(OAUTH_TOKEN, function (tok) {
            if (auth.cancelled) return;
            if (tok && tok.access_token) {
                saveTokens(tok);
                try { Lampa.Modal.close(); } catch (e) {}
                notify('Вы успешно вошли в аккаунт YouTube');
                loadAccount(updateStatus);
            }
        }, function (e) {
            if (auth.cancelled) return;

            var code = '';
            try { code = (e && e.responseJSON && e.responseJSON.error) || (e && e.responseText) || ''; } catch (err) {}

            if (code == 'authorization_pending') {
                setTimeout(function () { pollToken(res, attempt + 1); }, (res.interval || 5) * 1000);
            } else if (code == 'slow_down') {
                setTimeout(function () { pollToken(res, attempt + 1); }, ((res.interval || 5) + 5) * 1000);
            } else if (code == 'expired_token') {
                notify('Срок действия кода истёк. Попробуйте снова');
                try { Lampa.Modal.close(); } catch (err) {}
            } else {
                notify('Ошибка авторизации' + (code ? ': ' + code : ''));
                try { Lampa.Modal.close(); } catch (err) {}
            }
        }, {
            client_id: cid,
            grant_type: GRANT_DEVICE,
            device_code: res.device_code
        });
    }

    // Загрузка информации о канале аккаунта
    function loadAccount(call) {
        if (!loggedIn()) {
            if (call) call(null);
            return;
        }
        apiGet('/channels', { part: 'snippet', mine: 'true' }, function (json) {
            var acc = null;
            try {
                var it = json.items && json.items[0];
                if (it) acc = { title: it.snippet.title, img: thumb(it.snippet) };
            } catch (e) {}
            Lampa.Storage.set('yt_account', acc);
            if (call) call(acc);
        }, function () {
            if (call) call(null);
        });
    }

    // --------------------------------------------------------------------------
    //  YouTube Data API v3
    // --------------------------------------------------------------------------

    // GET-запрос к API с авторизацией (и одним ретраем при 401)
    function apiGet(path, params, call, err) {
        getToken(function (token) {
            if (!token) {
                err({ notoken: true });
                return;
            }

            var url = API_BASE + path + (path.indexOf('?') >= 0 ? '&' : '?') + buildQuery(params);
            var net = authNetwork();

            net.silent(url, call, function (e) {
                var status = 0;
                try { status = e.status || 0; } catch (ex) {}

                if (status == 401) {
                    refreshTokens(function (ok) {
                        if (!ok) return err(e);
                        getToken(function (t2) {
                            if (!t2) return err(e);
                            net.silent(url, call, err, false, {
                                headers: { Authorization: 'Bearer ' + t2 }
                            });
                        });
                    });
                } else err(e);
            }, false, {
                headers: { Authorization: 'Bearer ' + token }
            });
        });
    }

    function buildQuery(params) {
        var q = [];
        for (var k in params) {
            if (!Object.prototype.hasOwnProperty.call(params, k)) continue;
            q.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
        }
        return q.join('&');
    }

    // Пакетное получение длительностей видео
    function fetchDurations(ids, call) {
        if (!ids || !ids.length) return call({});

        apiGet('/videos', { part: 'contentDetails', id: ids.join(',') }, function (json) {
            var map = {};
            try {
                (json.items || []).forEach(function (it) {
                    map[it.id] = parseDuration(it.contentDetails && it.contentDetails.duration);
                });
            } catch (e) {}
            call(map);
        }, function () { call({}); });
    }

    // --------------------------------------------------------------------------
    //  Настройки
    // --------------------------------------------------------------------------

    var statusEl = null;

    function updateStatus() {
        if (!statusEl || !statusEl.length) return;
        try {
            var acc = Lampa.Storage.get('yt_account', null);
            if (acc && acc.title) {
                statusEl.text('Вы вошли как: ' + acc.title);
            } else if (loggedIn()) {
                statusEl.text('Выполнен вход');
            } else {
                statusEl.text('Вход не выполнен');
            }
        } catch (e) {}
    }

    function showInstructions() {
        var html = $(
            '<div class="about" style="line-height:1.6">' +
            '<div>1. Откройте <b>console.cloud.google.com</b> и войдите в Google-аккаунт</div>' +
            '<div>2. Создайте проект (или выберите существующий)</div>' +
            '<div>3. <b>APIs &amp; Services</b> &rarr; <b>Library</b> &rarr; включите <b>YouTube Data API v3</b></div>' +
            '<div>4. <b>APIs &amp; Services</b> &rarr; <b>OAuth consent screen</b> &rarr; тип <b>External</b>, заполните название и email</div>' +
            '<div>5. <b>Credentials</b> &rarr; <b>Create credentials</b> &rarr; <b>OAuth client ID</b></div>' +
            '<div>6. Тип приложения: <b>TVs and Limited Input devices</b></div>' +
            '<div>7. Скопируйте <b>Client ID</b> и вставьте его в настройках плагина</div>' +
            '<div style="margin-top:0.6em;opacity:0.7">API используется только для списков видео. Токен хранится только на этом устройстве.</div>' +
            '</div>'
        );

        try {
            Lampa.Modal.open({
                title: 'Как получить OAuth Client ID',
                html: html,
                size: 'medium'
            });
        } catch (e) {
            notify('Подробнее: console.cloud.google.com -> Credentials -> OAuth client ID (TVs and Limited Input devices)');
        }
    }

    function addSettings() {
        Lampa.SettingsApi.addComponent({
            component: COMPONENT,
            icon: "<svg height=\"36\" viewBox=\"0 0 36 36\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n                <rect x=\"1\" y=\"6\" width=\"34\" height=\"24\" rx=\"5\" fill=\"#FF0000\"/>\n                <path d=\"M15 13.5v9l7.5-4.5-7.5-4.5z\" fill=\"#fff\"/>\n            </svg>",
            name: 'YouTube'
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT,
            param: { type: 'title' },
            field: { name: 'Авторизация' }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT,
            param: { type: 'button' },
            field: {
                name: 'Как получить Client ID',
                description: 'Пошаговая инструкция по созданию OAuth-приложения в Google Cloud'
            },
            onChange: function () {
                showInstructions();
            }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT,
            param: {
                name: 'yt_client_id',
                type: 'input',
                default: ''
            },
            field: {
                name: 'OAuth Client ID',
                description: 'Client ID из Google Cloud Console'
            }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT,
            param: { type: 'button' },
            field: { name: 'Статус аккаунта' },
            onRender: function (item) {
                statusEl = $('<div class="settings-param__descr"></div>');
                item.append(statusEl);
                updateStatus();
            },
            onChange: function () {
                loadAccount(updateStatus);
            }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT,
            param: { type: 'button' },
            field: { name: 'Войти в аккаунт YouTube' },
            onChange: function () {
                startLogin();
            }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT,
            param: { type: 'button' },
            field: { name: 'Выйти из аккаунта' },
            onChange: function () {
                logout();
            }
        });
    }

    // --------------------------------------------------------------------------
    //  Шаблоны и стили
    // --------------------------------------------------------------------------

    function addTemplates() {
        Lampa.Template.add('yt_css', "\n        <style>\n        .yt-card{position:relative;display:flex;background-color:rgba(0,0,0,0.3);border-radius:0.3em;overflow:hidden}\n        .yt-card__img{position:relative;width:16em;min-width:16em;flex-shrink:0}\n        .yt-card__img>img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .3s}\n        .yt-card__img--loaded>img{opacity:1}\n        .yt-card__duration{position:absolute;right:0.5em;bottom:0.5em;background:rgba(0,0,0,0.8);border-radius:0.2em;padding:0.1em 0.4em;font-size:0.8em}\n        .yt-card__body{padding:1em 1.2em;line-height:1.35;flex-grow:1}\n        .yt-card__title{font-size:1.1em;font-weight:700;margin-bottom:0.3em}\n        .yt-card__info{opacity:0.7;font-size:0.9em}\n        .yt-folder{display:flex;align-items:center;background-color:rgba(0,0,0,0.3);border-radius:0.3em;padding:1em 1.2em}\n        .yt-folder__ico{width:2.4em;height:2.4em;margin-right:1em;flex-shrink:0}\n        .yt-folder__ico>svg{width:100%;height:100%}\n        .yt-folder__title{font-size:1.1em;font-weight:700}\n        .yt-empty{padding:3em 2em;text-align:center;opacity:0.8}\n        .yt-empty__title{font-size:1.2em;font-weight:700;margin-bottom:0.4em}\n        .yt-empty__text{opacity:0.7}\n        .yt-loading{padding:3em 0;display:flex;justify-content:center}\n        .yt-loading>div.broadcast__scan{width:2.4em;height:2.4em}\n        @media screen and (max-width:480px){\n            .yt-card__img{width:10em;min-width:10em}\n            .yt-card__body{padding:0.8em 1em}\n        }\n        </style>");

        Lampa.Template.add('yt_video', "<div class=\"yt-card selector\">\n            <div class=\"yt-card__img\">\n                <img alt=\"\">\n                <div class=\"yt-card__duration\">{duration}</div>\n            </div>\n            <div class=\"yt-card__body\">\n                <div class=\"yt-card__title\">{title}</div>\n                <div class=\"yt-card__info\">{info}</div>\n            </div>\n        </div>");

        Lampa.Template.add('yt_folder', "<div class=\"yt-folder selector\">\n            <div class=\"yt-folder__ico\">{ico}</div>\n            <div class=\"yt-folder__title\">{title}</div>\n        </div>");

        Lampa.Template.add('yt_empty', "<div class=\"yt-empty selector\">\n            <div class=\"yt-empty__title\">{title}</div>\n            <div class=\"yt-empty__text\">{text}</div>\n        </div>");

        Lampa.Template.add('yt_loading', "<div class=\"yt-loading\"><div class=\"broadcast__scan\"><div></div></div></div>");
    }

    var ICON_PLAY = "<svg viewBox=\"0 0 36 36\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><rect x=\"1\" y=\"6\" width=\"34\" height=\"24\" rx=\"5\" fill=\"#FF0000\"/><path d=\"M15 13.5v9l7.5-4.5-7.5-4.5z\" fill=\"#fff\"/></svg>";
    var ICON_HEART = "<svg viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M12 21s-8-4.9-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 3.5C20 16.1 12 21 12 21z\" fill=\"#FF0000\"/></svg>";
    var ICON_CLOCK = "<svg viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><circle cx=\"12\" cy=\"12\" r=\"9\" stroke=\"#fff\" stroke-width=\"2\"/><path d=\"M12 7v5l3.5 2\" stroke=\"#fff\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>";
    var ICON_HISTORY = "<svg viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M3 12a9 9 0 1 0 3-6.7\" stroke=\"#fff\" stroke-width=\"2\" stroke-linecap=\"round\"/><path d=\"M3 4v5h5\" stroke=\"#fff\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M12 8v4l3 2\" stroke=\"#fff\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>";
    var ICON_SEARCH = "<svg viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><circle cx=\"11\" cy=\"11\" r=\"7\" stroke=\"#fff\" stroke-width=\"2\"/><path d=\"M16.5 16.5L21 21\" stroke=\"#fff\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>";
    var ICON_USERS = "<svg viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><circle cx=\"9\" cy=\"8\" r=\"3.5\" stroke=\"#fff\" stroke-width=\"2\"/><path d=\"M2.5 19c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6\" stroke=\"#fff\" stroke-width=\"2\" stroke-linecap=\"round\"/><path d=\"M16 5.2a3.5 3.5 0 0 1 0 5.6M17.5 13.4c2.1.6 3.5 2.4 3.5 5.1\" stroke=\"#fff\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>";

    // --------------------------------------------------------------------------
    //  Компонент-обзор YouTube
    // --------------------------------------------------------------------------

    var CATEGORIES = [
        { id: 'subs',    title: 'Подписки',       ico: ICON_USERS },
        { id: 'likes',   title: 'Понравившиеся',  ico: ICON_HEART },
        { id: 'later',   title: 'Смотреть позже', ico: ICON_CLOCK },
        { id: 'history', title: 'История',        ico: ICON_HISTORY },
        { id: 'search',  title: 'Поиск',          ico: ICON_SEARCH }
    ];

    function component(object) {
        var network = new Network();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var stack = [];
        var last = false;
        var initialized = false;
        var current_videos = [];

        var _this = this;

        this.create = function () {
            return this.render();
        };

        this.render = function () {
            return scroll.render();
        };

        this.loading = function (status) {
            try {
                if (status) this.activity.loader(true);
                else {
                    this.activity.loader(false);
                    this.activity.toggle();
                }
            } catch (e) {}
        };

        // --- отрисовка ------------------------------------------------------

        function clear() {
            last = false;
            network.clear();
            scroll.clear();
        }

        function bindCard(html, onClick) {
            html.on('hover:enter', onClick).on('hover:focus', function (e) {
                last = e.target;
                scroll.update($(e.target), true);
            });
            scroll.append(html);
        }

        function drawMain() {
            clear();
            CATEGORIES.forEach(function (cat) {
                var html = Lampa.Template.get('yt_folder', {
                    ico: cat.ico,
                    title: cat.title
                });
                bindCard(html, function () {
                    openCategory(cat);
                });
            });
            _this.loading(false);
        }

        function drawChannels(items, title) {
            clear();
            if (!items.length) return drawEmpty(title, 'Список пуст');

            items.forEach(function (ch) {
                var html = Lampa.Template.get('yt_video', {
                    duration: '',
                    title: ch.title,
                    info: esc(ch.subs || '')
                });
                loadImage(html, ch.img, true);
                bindCard(html, function () {
                    loadChannelVideos(ch);
                });
            });
            _this.loading(false);
        }

        function drawVideos(items, title) {
            clear();
            current_videos = items;
            if (!items.length) return drawEmpty(title, 'Видео не найдены');

            items.forEach(function (v) {
                var info = [];
                if (v.channel) info.push(v.channel);
                if (v.date) info.push(v.date);
                if (v.duration) info.push(v.duration);

                var html = Lampa.Template.get('yt_video', {
                    duration: v.duration || '',
                    title: esc(v.title),
                    info: esc(info.join(' ● '))
                });
                loadImage(html, v.img, false);
                bindCard(html, function () {
                    playVideo(v);
                });
            });
            _this.loading(false);
        }

        function drawEmpty(title, text) {
            clear();
            var html = Lampa.Template.get('yt_empty', {
                title: esc(title),
                text: esc(text)
            });
            scroll.append(html);
            _this.loading(false);
        }

        function drawAuth() {
            clear();
            var html = Lampa.Template.get('yt_empty', {
                title: 'Вход не выполнен',
                text: 'Укажите OAuth Client ID и войдите в аккаунт в настройках плагина'
            });
            html.on('hover:enter', function () {
                try {
                    Lampa.Activity.push({
                        url: '',
                        title: 'YouTube',
                        component: 'settings_' + COMPONENT,
                        page: 1
                    });
                } catch (e) {}
            });
            scroll.append(html);
            _this.loading(false);
        }

        function drawLoading() {
            clear();
            scroll.append(Lampa.Template.get('yt_loading', {}));
        }

        function loadImage(html, url, square) {
            if (!url) return;
            try {
                var img = html.find('img')[0];
                var box = html.find('.yt-card__img');
                if (!img) return;
                img.onerror = function () {
                    img.src = './img/img_broken.svg';
                    box.addClass('yt-card__img--loaded');
                };
                img.onload = function () {
                    box.addClass('yt-card__img--loaded');
                };
                img.src = url;
            } catch (e) {}
        }

        // --- навигация ------------------------------------------------------

        function openView(view) {
            stack.push(view);
            renderView(view);
        }

        function renderView(view) {
            if (!view) return;
            if (view.view == 'main') drawMain();
            else if (view.view == 'channels') drawChannels(view.items, view.title);
            else if (view.view == 'videos') drawVideos(view.items, view.title);
            else if (view.view == 'auth') drawAuth();
            else if (view.view == 'empty') drawEmpty(view.title, view.text);
        }

        function openCategory(cat) {
            if (cat.id == 'search') {
                try {
                    Lampa.Input.edit({
                        title: 'Поиск YouTube',
                        value: '',
                        free: true,
                        nosave: true,
                        nomic: true
                    }, function (value) {
                        if (value && value.trim()) searchVideos(value.trim());
                    });
                } catch (e) {}
                return;
            }

            if (!loggedIn()) {
                openView({ view: 'auth' });
                return;
            }

            drawLoading();

            if (cat.id == 'subs') loadSubscriptions();
            else loadPlaylist(cat.id);
        }

        // --- загрузка данных ------------------------------------------------

        function loadSubscriptions() {
            apiGet('/subscriptions', { part: 'snippet', mine: 'true', maxResults: '50' }, function (json) {
                var items = [];
                try {
                    (json.items || []).forEach(function (it) {
                        var s = it.snippet || {};
                        items.push({
                            id: s.resourceId && s.resourceId.channelId,
                            title: s.title || '',
                            img: thumb(s, ['high', 'medium', 'default']),
                            subs: Lampa.Utils.parseTime(s.publishedAt || '').full || ''
                        });
                    });
                } catch (e) {}

                openView({ view: 'channels', items: items, title: 'Подписки' });
            }, function (e) {
                openView({ view: 'empty', title: 'Подписки', text: errorText(e) });
            });
        }

        function loadChannelVideos(ch) {
            drawLoading();

            apiGet('/search', {
                part: 'snippet',
                channelId: ch.id,
                type: 'video',
                order: 'date',
                maxResults: '50'
            }, function (json) {
                var items = parseSearch(json);
                withDurations(items, ch.title);
            }, function (e) {
                openView({ view: 'empty', title: ch.title, text: errorText(e) });
            });
        }

        function loadPlaylist(kind) {
            apiGet('/channels', { part: 'contentDetails', mine: 'true' }, function (json) {
                var playlistId = '';
                try {
                    var rp = json.items && json.items[0] && json.items[0].contentDetails && json.items[0].contentDetails.relatedPlaylists;
                    if (rp) playlistId = rp[kind] || '';
                } catch (e) {}

                if (!playlistId) {
                    openView({ view: 'empty', title: titleOf(kind), text: 'Плейлист недоступен' });
                    return;
                }

                apiGet('/playlistItems', { part: 'snippet', playlistId: playlistId, maxResults: '50' }, function (json2) {
                    var items = [];
                    try {
                        (json2.items || []).forEach(function (it) {
                            var s = it.snippet || {};
                            items.push({
                                id: s.resourceId && s.resourceId.videoId,
                                title: s.title || '',
                                channel: s.channelTitle || '',
                                img: thumb(s),
                                date: Lampa.Utils.parseTime(s.publishedAt || '').full || ''
                            });
                        });
                    } catch (e) {}
                    withDurations(items, titleOf(kind));
                }, function (e2) {
                    openView({ view: 'empty', title: titleOf(kind), text: errorText(e2) });
                });
            }, function (e) {
                openView({ view: 'empty', title: titleOf(kind), text: errorText(e) });
            });
        }

        function searchVideos(query) {
            if (!loggedIn()) {
                openView({ view: 'auth' });
                return;
            }

            drawLoading();

            apiGet('/search', {
                part: 'snippet',
                type: 'video',
                maxResults: '25',
                q: query
            }, function (json) {
                var items = parseSearch(json);
                withDurations(items, 'Поиск: ' + query);
            }, function (e) {
                openView({ view: 'empty', title: 'Поиск', text: errorText(e) });
            });
        }

        function parseSearch(json) {
            var items = [];
            try {
                (json.items || []).forEach(function (it) {
                    var s = it.snippet || {};
                    var id = (it.id && (it.id.videoId || it.id.channelId)) || (s.resourceId && s.resourceId.videoId);
                    if (id) {
                        items.push({
                            id: id,
                            title: s.title || '',
                            channel: s.channelTitle || '',
                            img: thumb(s),
                            date: Lampa.Utils.parseTime(s.publishedAt || '').full || ''
                        });
                    }
                });
            } catch (e) {}
            return items;
        }

        function withDurations(items, title) {
            var ids = items.map(function (v) { return v.id; }).filter(Boolean);
            fetchDurations(ids, function (map) {
                items.forEach(function (v) {
                    if (map[v.id]) v.duration = map[v.id];
                });
                openView({ view: 'videos', items: items, title: title });
            });
        }

        function titleOf(kind) {
            var f = CATEGORIES.find(function (c) { return c.id == kind; });
            return f ? f.title : 'YouTube';
        }

        function errorText(e) {
            var msg = '';
            try {
                if (e && e.notoken) return 'Не выполнен вход в аккаунт';
                msg = (e && e.responseJSON && (e.responseJSON.error && e.responseJSON.error.message || e.responseJSON.error)) || '';
            } catch (err) {}
            return msg || 'Не удалось загрузить данные';
        }

        // --- воспроизведение ------------------------------------------------

        function playVideo(v) {
            try {
                var playlist = current_videos.map(function (c) {
                    return {
                        title: c.title,
                        url: 'https://www.youtube.com/watch?v=' + c.id
                    };
                });

                Lampa.Player.play({
                    url: 'https://www.youtube.com/watch?v=' + v.id,
                    title: v.title,
                    youtube: true
                });

                if (playlist.length > 1) Lampa.Player.playlist(playlist);
            } catch (e) {
                notify('Ошибка воспроизведения');
            }
        }

        // --- жизненный цикл -------------------------------------------------

        this.initialize = function () {
            openView({ view: 'main' });
        };

        this.start = function () {
            if (Lampa.Activity.active().activity !== this.activity) return;

            if (!initialized) {
                initialized = true;
                this.initialize();
            }

            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(last || false, scroll.render());
                },
                gone: function () {
                    network.clear();
                },
                up: function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function () {
                    Navigator.move('down');
                },
                right: function () {
                    if (Navigator.canmove('right')) Navigator.move('right');
                },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                back: this.back.bind(this)
            });

            Lampa.Controller.toggle('content');
        };

        this.back = function () {
            stack.pop();
            if (stack.length) renderView(stack[stack.length - 1]);
            else Lampa.Activity.backward();
        };

        this.pause = function () {
            network.clear();
        };

        this.stop = function () {
            network.clear();
        };

        this.destroy = function () {
            network.clear();
            scroll.destroy();
            stack = [];
        };
    }

    // --------------------------------------------------------------------------
    //  Пункт главного меню
    // --------------------------------------------------------------------------

    function addMenuItem(body) {
        var list = body.find('.menu__list:eq(0)');
        if (!list || !list.length) list = body;

        if (list.find('[data-action="youtube"]').length) return;

        var item = $(
            '<li class="menu__item selector" data-action="youtube">' +
            '<div class="menu__ico">' + ICON_PLAY + '</div>' +
            '<div class="menu__text">YouTube</div>' +
            '</li>'
        );

        list.append(item);
    }

    function openYouTube() {
        try {
            Lampa.Component.add(COMPONENT, component);
            Lampa.Activity.push({
                url: '',
                title: 'YouTube',
                component: COMPONENT,
                page: 1
            });
        } catch (e) {
            notify('Не удалось открыть YouTube');
        }
    }

    function followMenu() {
        Lampa.Listener.follow('menu', function (e) {
            if (e.type == 'start' && e.body) {
                try {
                    addMenuItem($(e.body));
                } catch (err) {}
            } else if (e.type == 'action' && e.action == 'youtube') {
                e.abort();
                openYouTube();
            }
        });
    }

    // --------------------------------------------------------------------------
    //  Старт
    // --------------------------------------------------------------------------

    function start() {
        try {
            addTemplates();
            $('body').append(Lampa.Template.get('yt_css', {}, true));
        } catch (e) {}

        try {
            addSettings();
        } catch (e) {}

        try {
            followMenu();
        } catch (e) {}

        try {
            if (loggedIn()) loadAccount(updateStatus);
        } catch (e) {}
    }

    Lampa.Manifest.plugins = {
        type: 'video',
        version: '1.0.0',
        name: 'YouTube',
        description: 'Просмотр YouTube с авторизацией через личный аккаунт Google',
        component: COMPONENT,
        onContextMenu: function () {
            return {
                name: 'YouTube',
                description: 'Подписки, история, поиск YouTube'
            };
        },
        onContextLauch: function () {
            openYouTube();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
