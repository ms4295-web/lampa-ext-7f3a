/**
 * ============================================================================
 *  Plugin: YouTube — полноценный клиент на базе Piped + cobalt
 * ----------------------------------------------------------------------------
 *  Контент (без аккаунта и ключей): публичный API Piped
 *    - Главная: тренды по региону
 *    - Поиск видео и каналов (с подгрузкой следующих страниц)
 *    - Страница видео: описание, канал, похожие видео, комментарии
 *    - Страница канала: видео/Shorts/стримы
 *
 *  Воспроизведение в максимальном качестве: сервер cobalt
 *    - отдаёт один готовый mp4 в исходном качестве (вплоть до 2160p);
 *    - публичный api.cobalt.tools больше не отдаёт YouTube, поэтому
 *      нужен свой инстанс (одна команда Docker, инструкция в настройках);
 *    - если cobalt не настроен/недоступен — откат на поток Piped
 *      (макс. 720p) или на встроенный YouTube-плеер Lampa.
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

    var DEFAULT_PIPED = 'https://api.piped.private.coffee';
    var YT_WATCH = 'https://www.youtube.com/watch?v=';

    var QUALITIES = [
        { title: '2160p (4K)', q: '2160' },
        { title: '1440p (2K)', q: '1440' },
        { title: '1080p (FullHD)', q: '1080' },
        { title: '720p (HD)', q: '720' },
        { title: '480p', q: '480' },
        { title: '360p', q: '360' }
    ];

    var REGIONS = {
        'RU': 'Россия', 'US': 'США', 'UA': 'Украина', 'BY': 'Беларусь',
        'GB': 'Великобритания', 'DE': 'Германия', 'FR': 'Франция',
        'JP': 'Япония', 'KR': 'Корея', 'IN': 'Индия', 'BR': 'Бразилия'
    };

    var Network = Lampa.Reguest;

    // --------------------------------------------------------------------------
    //  Настройки
    // --------------------------------------------------------------------------

    function pipedUrl() {
        return (Lampa.Storage.get('yt_piped_url', DEFAULT_PIPED) + '').trim().replace(/\/+$/, '');
    }

    function cobaltUrl() {
        return (Lampa.Storage.get('yt_cobalt_url', '') + '').trim().replace(/\/+$/, '');
    }

    function cobaltKey() {
        return (Lampa.Storage.get('yt_cobalt_key', '') + '').trim();
    }

    function defaultQuality() {
        return Lampa.Storage.get('yt_quality', '2160') + '';
    }

    function region() {
        return Lampa.Storage.get('yt_region', 'RU') + '';
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

    function notify(msg) {
        try { Lampa.Noty.show(msg); } catch (e) {}
    }

    function videoId(item) {
        var m = String(item && item.url || '').match(/[?&]v=([^&]+)/);
        return m ? m[1] : '';
    }

    function channelId(item) {
        var m = String(item && item.url || '').match(/\/(?:channel|c|user)\/([^/?&]+)/);
        return m ? m[1] : '';
    }

    function fmtNum(n) {
        n = parseInt(n, 10);
        if (isNaN(n) || n < 0) return '';
        if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + ' млн';
        if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + ' тыс';
        return '' + n;
    }

    function fmtDur(sec) {
        sec = parseInt(sec, 10);
        if (isNaN(sec) || sec <= 0) return '';
        var h = Math.floor(sec / 3600);
        var m = Math.floor((sec % 3600) / 60);
        var s = sec % 60;
        if (h > 0) return h + ':' + ('0' + m).slice(-2) + ':' + ('0' + s).slice(-2);
        return m + ':' + ('0' + s).slice(-2);
    }

    function fmtDate(d) {
        if (!d) return '';
        return String(d).slice(0, 10);
    }

    // --------------------------------------------------------------------------
    //  Сеть
    // --------------------------------------------------------------------------

    function apiGet(path, params, call, err) {
        var url = pipedUrl() + path;
        if (params) {
            var q = [];
            for (var k in params) {
                if (Object.prototype.hasOwnProperty.call(params, k)) {
                    q.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
                }
            }
            if (q.length) url += (url.indexOf('?') >= 0 ? '&' : '?') + q.join('&');
        }

        var net = new Network();
        net.timeout(20000);
        net.silent(url, call, err, false, { dataType: 'json' });
    }

    // --------------------------------------------------------------------------
    //  Воспроизведение: cobalt -> Piped -> нативный плеер
    // --------------------------------------------------------------------------

    // Запрос одного качества у cobalt
    function cobaltFetch(url, id, quality, call) {
        var body = {
            url: YT_WATCH + id,
            videoQuality: quality,
            youtubeVideoCodec: 'h264',
            youtubeVideoContainer: 'mp4',
            filenameStyle: 'basic'
        };

        var headers = { Accept: 'application/json' };
        if (cobaltKey()) headers.Authorization = 'Api-Key ' + cobaltKey();

        var net = new Network();
        net.timeout(60000);
        net.silent(url, function (res) {
            if (res && (res.status == 'tunnel' || res.status == 'redirect') && res.url) call(res.url);
            else call(false);
        }, function () { call(false); }, JSON.stringify(body), {
            headers: headers,
            contentType: 'application/json',
            processData: false,
            dataType: 'json',
            timeout: 60000
        });
    }

    function playStream(video, quality, call) {
        var url = cobaltUrl();
        var id = video.id || videoId(video);

        if (!url) return fallbackPlay(video, call);

        var q = quality || defaultQuality();

        // Запрашиваем выбранное качество и все выше — плеер покажет их все
        var want = QUALITIES.filter(function (x) { return parseInt(x.q, 10) >= parseInt(q, 10); }).map(function (x) { return x.q; });
        if (want.indexOf(q) < 0) want.unshift(q);

        var result = {};
        var done = 0;

        want.forEach(function (w) {
            cobaltFetch(url, id, w, function (res) {
                if (res) result[w + 'p'] = res;
                done++;
                if (done >= want.length) {
                    var keys = Object.keys(result);
                    if (!keys.length) { if (call) call(false); return; }

                    var best = keys[0];
                    keys.forEach(function (k) { if (parseInt(k, 10) > parseInt(best, 10)) best = k; });

                    Lampa.Player.play({
                        url: result[best],
                        title: video.title,
                        quality: keys.length > 1 ? result : undefined
                    });
                    if (call) call(true);
                }
            });
        });
    }

    // Откат: лучший muxed-поток Piped (макс. 720p), далее — нативный плеер
    function fallbackPlay(video, call) {
        var id = video.id || videoId(video);
        if (!id) { notify('Не удалось определить видео'); return; }

        apiGet('/streams/' + id, {}, function (json) {
            var best = null;
            try {
                (json.videoStreams || []).forEach(function (s) {
                    if (s.videoOnly) return;
                    var h = parseInt(s.quality, 10) || 0;
                    if (!best || h > best._h) { best = s; s._h = h; }
                });
            } catch (e) {}

            if (best && best.url) {
                Lampa.Player.play({ url: best.url, title: json.title || video.title });
                if (call) call(true);
            } else {
                Lampa.Player.play({ url: YT_WATCH + id, title: video.title, youtube: true });
                if (call) call(true);
            }
        }, function () {
            Lampa.Player.play({ url: YT_WATCH + id, title: video.title, youtube: true });
            if (call) call(true);
        });
    }

    function playVideo(video, quality) {
        notify('Загрузка видео' + (quality ? ' (' + quality + 'p)' : '') + '…');

        playStream(video, quality, function (ok) {
            if (!ok) {
                notify('cobalt не ответил — используется поток Piped');
                fallbackPlay(video);
            }
        });
    }

    function showQualityMenu(video) {
        var enabled = Lampa.Controller.enabled().name;

        Lampa.Select.show({
            title: 'Качество воспроизведения',
            items: QUALITIES.map(function (q) {
                return { title: q.title, q: q.q };
            }),
            onBack: function () {
                Lampa.Controller.toggle(enabled);
            },
            onSelect: function (a) {
                Lampa.Controller.toggle(enabled);
                playVideo(video, a.q);
            }
        });
    }

    // --------------------------------------------------------------------------
    //  Шаблоны и стили
    // --------------------------------------------------------------------------

    function addTemplates() {
        Lampa.Template.add('yt_css', "\n        <style>\n        .yt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(16em,1fr));gap:0.9em}\n        @media screen and (min-width:1000px){.yt-grid{grid-template-columns:repeat(auto-fill,minmax(18em,1fr))}}\n        @media screen and (max-width:480px){.yt-grid{grid-template-columns:repeat(auto-fill,minmax(12em,1fr));gap:0.6em}}\n        .yt-card{background:rgba(0,0,0,0.3);border-radius:0.4em;overflow:hidden;display:flex;flex-direction:column}\n        .yt-card__thumb{position:relative;padding-top:56.25%;background:#111}\n        .yt-card__thumb>img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .3s}\n        .yt-card__thumb--loaded>img{opacity:1}\n        .yt-card__dur{position:absolute;right:0.4em;bottom:0.4em;background:rgba(0,0,0,0.85);border-radius:0.2em;padding:0.05em 0.35em;font-size:0.78em}\n        .yt-card__body{padding:0.7em 0.8em}\n        .yt-card__title{font-weight:700;line-height:1.3;margin-bottom:0.25em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}\n        .yt-card__meta{opacity:0.65;font-size:0.85em;line-height:1.3;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}\n        .yt-head{display:flex;align-items:center;gap:0.8em;margin-bottom:1em}\n        .yt-head__logo{display:flex;align-items:center;gap:0.45em;font-size:1.4em;font-weight:800}\n        .yt-head__logo svg{width:1.5em;height:1.5em}\n        .yt-searchbtn{margin-left:auto;background:rgba(255,255,255,0.08);border-radius:0.4em;padding:0.55em 1.1em;font-weight:600;display:flex;align-items:center;gap:0.5em}\n        .yt-searchbtn svg{width:1.1em;height:1.1em;opacity:0.8}\n        .yt-secthead{font-size:1.15em;font-weight:700;margin:1.1em 0 0.7em;opacity:0.9}\n        .yt-secthead:first-child{margin-top:0}\n        .yt-hero{position:relative;padding-top:42%;border-radius:0.5em;overflow:hidden;background:#000}\n        @media screen and (max-width:900px){.yt-hero{padding-top:56.25%}}\n        .yt-hero>img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .3s}\n        .yt-hero--loaded>img{opacity:1}\n        .yt-hero__play{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.25)}\n        .yt-hero__play svg{width:3.4em;height:3.4em;filter:drop-shadow(0 0 0.4em rgba(0,0,0,0.6))}\n        .yt-hero__dur{position:absolute;right:0.6em;bottom:0.6em;background:rgba(0,0,0,0.85);border-radius:0.25em;padding:0.1em 0.5em;font-size:0.9em}\n        .yt-vtitle{font-size:1.35em;font-weight:700;line-height:1.3;margin:0.8em 0 0.3em}\n        .yt-vmeta{opacity:0.7;margin-bottom:0.9em}\n        .yt-channel{display:flex;align-items:center;gap:0.8em;margin-bottom:1em}\n        .yt-channel__avatar{width:3em;height:3em;border-radius:100%;flex-shrink:0;object-fit:cover;background:#222}\n        .yt-channel__name{font-weight:700;font-size:1.05em}\n        .yt-channel__subs{opacity:0.65;font-size:0.85em}\n        .yt-desc{opacity:0.85;line-height:1.5;margin-bottom:1em;max-height:11em;overflow-y:auto;background:rgba(0,0,0,0.25);border-radius:0.4em;padding:0.8em 1em;font-size:0.92em}\n        .yt-desc a{color:#8ab4f8}\n        .yt-banner{position:relative;padding-top:22%;border-radius:0.5em;overflow:hidden;background:#1a1a1a;margin-bottom:1em}\n        .yt-banner>img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .3s}\n        .yt-banner--loaded>img{opacity:1}\n        .yt-comment{display:flex;gap:0.7em;padding:0.7em 0;border-bottom:1px solid rgba(255,255,255,0.06)}\n        .yt-comment__avatar{width:2.2em;height:2.2em;border-radius:100%;flex-shrink:0;background:#333;object-fit:cover}\n        .yt-comment__name{font-weight:600;font-size:0.9em;opacity:0.9}\n        .yt-comment__time{opacity:0.55;font-size:0.8em;margin-left:0.5em}\n        .yt-comment__text{opacity:0.85;font-size:0.9em;line-height:1.35;margin-top:0.15em;word-wrap:break-word}\n        .yt-more{display:flex;justify-content:center;padding:1em}\n        .yt-more__btn{background:rgba(255,255,255,0.08);border-radius:0.4em;padding:0.6em 1.6em;font-weight:600}\n        .yt-empty{padding:3em 1.5em;text-align:center;opacity:0.8}\n        .yt-empty__title{font-size:1.2em;font-weight:700;margin-bottom:0.4em}\n        .yt-empty__text{opacity:0.7}\n        .yt-tabs{display:flex;gap:0.5em;margin-bottom:1em;flex-wrap:wrap}\n        .yt-tab{background:rgba(255,255,255,0.08);border-radius:2em;padding:0.4em 1.1em;font-weight:600;font-size:0.92em}\n        .yt-tab--active{background:#fff;color:#000}\n        .yt-loading{padding:3em 0;display:flex;justify-content:center}\n        </style>");

        Lampa.Template.add('yt_card', "<div class=\"yt-card selector\">\n            <div class=\"yt-card__thumb\">\n                <img alt=\"\">\n                <span class=\"yt-card__dur\">{duration}</span>\n            </div>\n            <div class=\"yt-card__body\">\n                <div class=\"yt-card__title\">{title}</div>\n                <div class=\"yt-card__meta\">{meta}</div>\n            </div>\n        </div>");

        Lampa.Template.add('yt_channelcard', "<div class=\"yt-card selector\">\n            <div class=\"yt-card__thumb\" style=\"padding-top:0\">\n                <img alt=\"\" style=\"position:static;width:100%;height:100%;object-fit:cover\">\n            </div>\n            <div class=\"yt-card__body\">\n                <div class=\"yt-card__title\">{title}</div>\n                <div class=\"yt-card__meta\">{meta}</div>\n            </div>\n        </div>");

        Lampa.Template.add('yt_head', "<div class=\"yt-head\">\n            <div class=\"yt-head__logo\"><svg viewBox=\"0 0 36 36\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><rect x=\"1\" y=\"6\" width=\"34\" height=\"24\" rx=\"5\" fill=\"#FF0000\"/><path d=\"M15 13.5v9l7.5-4.5-7.5-4.5z\" fill=\"#fff\"/></svg>YouTube</div>\n            <div class=\"yt-searchbtn selector\"><svg viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><circle cx=\"11\" cy=\"11\" r=\"7\" stroke=\"currentColor\" stroke-width=\"2\"/><path d=\"M16.5 16.5L21 21\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>Поиск</div>\n        </div>");

        Lampa.Template.add('yt_secthead', "<div class=\"yt-secthead\">{title}</div>");

        Lampa.Template.add('yt_hero', "<div class=\"yt-hero selector\">\n            <img alt=\"\">\n            <div class=\"yt-hero__play\"><svg viewBox=\"0 0 60 60\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><circle cx=\"30\" cy=\"30\" r=\"29\" fill=\"rgba(0,0,0,0.55)\" stroke=\"#fff\" stroke-width=\"2\"/><path d=\"M24 20v20l16-10-16-10z\" fill=\"#fff\"/></svg></div>\n            <span class=\"yt-hero__dur\">{duration}</span>\n        </div>");

        Lampa.Template.add('yt_empty', "<div class=\"yt-empty selector\">\n            <div class=\"yt-empty__title\">{title}</div>\n            <div class=\"yt-empty__text\">{text}</div>\n        </div>");

        Lampa.Template.add('yt_more', "<div class=\"yt-more\"><div class=\"yt-more__btn selector\">Загрузить ещё</div></div>");

        Lampa.Template.add('yt_loading', "<div class=\"yt-loading\"><div class=\"broadcast__scan\"><div></div></div></div>");
    }

    var ICON_SEARCH = "<svg viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><circle cx=\"11\" cy=\"11\" r=\"7\" stroke=\"currentColor\" stroke-width=\"2\"/><path d=\"M16.5 16.5L21 21\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>";

    // --------------------------------------------------------------------------
    //  Нормализация элементов
    // --------------------------------------------------------------------------

    function normStream(it) {
        return {
            id: videoId(it),
            type: 'stream',
            title: it.title || '',
            url: it.url || '',
            thumb: it.thumbnail || it.thumbnailUrl || '',
            uploader: it.uploaderName || it.uploader || '',
            uploaderUrl: it.uploaderUrl || '',
            uploaderAvatar: it.uploaderAvatar || '',
            duration: it.duration >= 0 ? it.duration : -1,
            views: it.views >= 0 ? it.views : -1,
            uploadedDate: it.uploadedDate || '',
            isShort: !!it.isShort
        };
    }

    function normChannel(it) {
        return {
            id: channelId(it),
            type: 'channel',
            title: it.name || '',
            url: it.url || '',
            thumb: it.thumbnail || '',
            description: it.description || '',
            subscribers: it.subscribers >= 0 ? it.subscribers : -1,
            verified: !!it.verified
        };
    }

    function metaOf(v) {
        var parts = [];
        if (v.uploader) parts.push(v.uploader);
        if (v.views >= 0) parts.push(fmtNum(v.views) + ' просмотров');
        if (v.uploadedDate) parts.push(v.uploadedDate);
        return esc(parts.join(' • '));
    }

    // --------------------------------------------------------------------------
    //  Компонент
    // --------------------------------------------------------------------------

    function component(object) {
        var network = new Network();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var stack = [];
        var last = false;
        var initialized = false;
        var controllerReady = false;

        var _this = this;

        this.create = function () { return this.render(); };
        this.render = function () { return scroll.render(); };

        this.loading = function (status) {
            try {
                if (status) this.activity.loader(true);
                else {
                    this.activity.loader(false);
                    this.activity.toggle();
                    //after async content load, the navigation collection is stale — rebuild it
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(last || false, scroll.render());
                }
            } catch (e) {}
        };

        // --- базовая отрисовка ----------------------------------------------

        function clear() {
            last = false;
            network.clear();
            scroll.clear();
        }

        function bind(html, onClick, onLong) {
            html.on('hover:enter', onClick);
            if (onLong) html.on('hover:long', onLong);
            html.on('hover:focus', function (e) {
                last = e.target;
                scroll.update($(e.target), true);
            });
            scroll.append(html);
        }

        function loadImage(html, url, loadedClass) {
            if (!url) return;
            try {
                var img = html.find('img')[0];
                if (!img) return;
                img.onerror = function () { img.src = './img/img_broken.svg'; html.find(loadedClass).addClass('yt-card__thumb--loaded'); };
                img.onload = function () { html.find(loadedClass).addClass('yt-card__thumb--loaded'); };
                img.src = url;
            } catch (e) {}
        }

        function drawVideoCard(v, onLong) {
            var html = Lampa.Template.get('yt_card', {
                duration: esc(fmtDur(v.duration)),
                title: esc(v.title),
                meta: metaOf(v)
            });
            loadImage(html, v.thumb, '.yt-card__thumb');
            bind(html, function () { openVideo(v); }, onLong);
            return html;
        }

        function drawChannelCard(c) {
            var html = Lampa.Template.get('yt_channelcard', {
                title: esc(c.title),
                meta: esc((c.subscribers >= 0 ? fmtNum(c.subscribers) + ' подписчиков' : '') + (c.description ? ' • ' + c.description.slice(0, 60) : ''))
            });
            loadImage(html, c.thumb, '.yt-card__thumb');
            bind(html, function () { openChannel(c.id || c.url); });
            return html;
        }

        function drawGrid(items, gridType) {
            var grid = $('<div class="yt-grid"></div>');
            items.forEach(function (it) {
                if (it.type == 'channel' || it.name) grid.append(drawChannelCard(normChannel(it)));
                else grid.append(drawVideoCard(normStream(it)));
            });
            scroll.append(grid);
        }

        function drawEmpty(title, text) {
            scroll.append(Lampa.Template.get('yt_empty', { title: esc(title), text: esc(text) }));
            _this.loading(false);
        }

        function drawLoading() {
            clear();
            scroll.append(Lampa.Template.get('yt_loading', {}));
        }

        // --- главная ---------------------------------------------------------

        function drawHome() {
            clear();
            scroll.append(Lampa.Template.get('yt_head', {}));

            var head = scroll.render().find('.yt-searchbtn');
            head.off('hover:enter').on('hover:enter', function () { startSearch(); });

            scroll.append(Lampa.Template.get('yt_secthead', { title: 'В тренде' }));

            apiGet('/trending', { region: region() }, function (json) {
                if (!json || !json.length) return drawEmpty('Тренды недоступны', 'Попробуйте сменить регион или инстанс Piped в настройках');
                drawGrid(json);
                _this.loading(false);
            }, function () {
                drawEmpty('Не удалось загрузить', 'Проверьте URL инстанса Piped в настройках');
            });
        }

        // --- поиск ------------------------------------------------------------

        function startSearch() {
            try {
                Lampa.Input.edit({
                    title: 'Поиск YouTube',
                    value: '',
                    free: true,
                    nosave: true,
                    nomic: true
                }, function (value) {
                    if (value && value.trim()) openSearch(value.trim());
                });
            } catch (e) {}
        }

        function drawSearch(view) {
            clear();
            scroll.append(Lampa.Template.get('yt_secthead', { title: 'Поиск: ' + view.query }));

            apiGet('/search', { q: view.query, filter: view.filter }, function (json) {
                if (!json || !json.items || !json.items.length) return drawEmpty('Ничего не найдено', 'Измените запрос');
                view.nextpage = json.nextpage || null;
                drawGrid(json.items);
                appendMore(view);
                _this.loading(false);
            }, function () {
                drawEmpty('Ошибка поиска', 'Попробуйте другой запрос или инстанс');
            });
        }

        function loadMoreSearch(view) {
            if (!view.nextpage) return;
            apiGet('/nextpage/search', { nextpage: view.nextpage, q: view.query, filter: view.filter }, function (json) {
                if (!json || !json.items) return;
                view.nextpage = json.nextpage || null;
                scroll.render().find('.yt-more').remove();
                drawGrid(json.items);
                appendMore(view);
            }, function () {
                scroll.render().find('.yt-more').remove();
            });
        }

        function appendMore(view) {
            if (!view.nextpage) return;
            var btn = Lampa.Template.get('yt_more', {});
            btn.on('hover:enter', function () {
                scroll.render().find('.yt-more').remove();
                if (view.view == 'search') loadMoreSearch(view);
                else if (view.view == 'channel') loadMoreChannel(view);
            });
            scroll.append(btn);
        }

        // --- страница видео ----------------------------------------------------

        function drawVideo(view) {
            // Отрисовываем страницу немедленно из данных карточки — Piped /streams
            // часто блокируется YouTube (Sign in to confirm you're not a bot),
            // а для воспроизведения через cobalt он и не нужен.
            var v = view.video || normStream({ url: '/watch?v=' + view.id, title: '' });

            clear();

            var hero = Lampa.Template.get('yt_hero', { duration: esc(fmtDur(v.duration)) });
            loadImage(hero, v.thumb, '.yt-hero');
            bind(hero, function () { playVideo(v); }, function () { showQualityMenu(v); });
            scroll.append(hero);

            scroll.append($('<div class="yt-vtitle">' + esc(v.title || 'Видео') + '</div>'));

            var meta = [];
            if (v.uploader) meta.push(v.uploader);
            if (v.views >= 0) meta.push(fmtNum(v.views) + ' просмотров');
            if (v.uploadedDate) meta.push(v.uploadedDate);
            if (meta.length) scroll.append($('<div class="yt-vmeta">' + esc(meta.join(' • ')) + '</div>'));

            if (v.uploader) {
                var ch = $('<div class="yt-channel selector"><img class="yt-channel__avatar" alt=""><div><div class="yt-channel__name"></div><div class="yt-channel__subs"></div></div></div>');
                ch.find('.yt-channel__name').text(v.uploader);
                var chId = channelId({ url: v.uploaderUrl });
                ch.find('.yt-channel__subs').text(chId ? 'Перейти на канал' : '');
                var av = ch.find('img')[0];
                if (av && v.uploaderAvatar) {
                    av.onerror = function () { av.style.display = 'none'; };
                    av.src = v.uploaderAvatar;
                }
                ch.on('hover:enter', function () { if (chId) openChannel(chId); });
                ch.on('hover:focus', function (e) { last = e.target; scroll.update($(e.target), true); });
                scroll.append(ch);
            }

            _this.loading(false);

            // Дополнительная информация (описание, похожие, комментарии) — если Piped
            // доступен. Не блокируем страницу при ошибке.
            apiGet('/streams/' + view.id, {}, function (json) {
                if (!json || !json.title) return;

                if (json.description) {
                    var desc = $('<div class="yt-desc"></div>');
                    desc.html(json.description);
                    scroll.append(desc);
                }

                if (json.relatedStreams && json.relatedStreams.length) {
                    scroll.append(Lampa.Template.get('yt_secthead', { title: 'Похожие видео' }));
                    drawGrid(json.relatedStreams);
                }

                loadComments(view.id);
            }, function () { /* доп. информация недоступна — страница уже отрисована */ });
        }

        function loadComments(id) {
            apiGet('/comments/' + id, {}, function (json) {
                if (!json || json.disabled || !json.comments || !json.comments.length) return;

                scroll.append(Lampa.Template.get('yt_secthead', { title: json.commentCount >= 0 ? 'Комментарии • ' + fmtNum(json.commentCount) : 'Комментарии' }));

                var box = $('<div></div>');
                json.comments.slice(0, 12).forEach(function (c) {
                    var item = $('<div class="yt-comment"><img class="yt-comment__avatar" alt=""><div><span class="yt-comment__name"></span><span class="yt-comment__time"></span><div class="yt-comment__text"></div></div></div>');
                    item.find('.yt-comment__name').text(c.author);
                    item.find('.yt-comment__time').text(c.commentedTime);
                    item.find('.yt-comment__text').text(c.commentText);
                    if (c.pinned) item.find('.yt-comment__name').text('📌 ' + c.author);
                    var av = item.find('img')[0];
                    if (av && c.thumbnail) {
                        av.onerror = function () { av.style.display = 'none'; };
                        av.src = c.thumbnail;
                    }
                    box.append(item);
                });
                scroll.append(box);
            }, function () {});
        }

        // --- страница канала ----------------------------------------------------

        function drawChannel(view) {
            drawLoading();

            apiGet('/channel/' + view.id, {}, function (json) {
                if (!json || !json.name) return drawEmpty('Канал недоступен', 'Не удалось получить данные о канале');

                clear();

                if (json.bannerUrl) {
                    var banner = $('<div class="yt-banner"><img alt=""></div>');
                    loadImage(banner, json.bannerUrl, '.yt-banner');
                    scroll.append(banner);
                }

                var head = $('<div class="yt-channel"><img class="yt-channel__avatar" alt=""><div><div class="yt-channel__name"></div><div class="yt-channel__subs"></div><div class="yt-channel__subs"></div></div></div>');
                head.find('.yt-channel__name').text(json.name + (json.verified ? ' ✓' : ''));
                head.find('.yt-channel__subs').eq(0).text(json.subscriberCount >= 0 ? fmtNum(json.subscriberCount) + ' подписчиков' : '');
                if (json.description) head.find('.yt-channel__subs').eq(1).text(json.description).css('opacity', 0.6).css('max-width', '40em');
                var av = head.find('img')[0];
                if (av && json.avatarUrl) {
                    av.onerror = function () { av.style.display = 'none'; };
                    av.src = json.avatarUrl;
                }
                scroll.append(head);

                view.nextpage = json.nextpage || null;
                view.tabs = json.tabs || [];
                view.videos = (json.relatedStreams || []).map(normStream);

                if (view.videos.length) {
                    scroll.append(Lampa.Template.get('yt_secthead', { title: 'Видео' }));
                    drawGrid(view.videos);
                    appendMore(view);
                    _this.loading(false);
                } else {
                    // На некоторых инстансах первый лист канала пустой — берём следующую страницу
                    // или содержимое первой вкладки (shorts/стримы)
                    loadChannelFallback(view);
                }
            }, function () {
                drawEmpty('Канал недоступен', 'Не удалось получить данные о канале');
            });
        }

        function loadChannelFallback(view) {
            if (view.nextpage) {
                apiGet('/nextpage/channel/' + view.id, { nextpage: view.nextpage }, function (json) {
                    if (json && json.relatedStreams && json.relatedStreams.length) {
                        view.nextpage = json.nextpage || null;
                        view.videos = json.relatedStreams.map(normStream);
                        scroll.append(Lampa.Template.get('yt_secthead', { title: 'Видео' }));
                        drawGrid(view.videos);
                        appendMore(view);
                        _this.loading(false);
                        return;
                    }
                    loadChannelTab(view);
                }, function () { loadChannelTab(view); });
            } else {
                loadChannelTab(view);
            }
        }

        function loadChannelTab(view) {
            var tab = view.tabs && view.tabs.length ? view.tabs[0] : null;
            if (!tab || !tab.data) {
                if (view.videos.length) { appendMore(view); _this.loading(false); }
                else drawEmpty('Видео не найдены', 'На канале нет видео или инстанс их не отдал');
                return;
            }

            apiGet('/channels/tabs', { data: tab.data }, function (json) {
                if (!json || !json.content || !json.content.length) {
                    drawEmpty('Видео не найдены', 'На канале нет видео или инстанс их не отдал');
                    return;
                }
                view.tabNextpage = json.nextpage || null;
                scroll.append(Lampa.Template.get('yt_secthead', { title: tab.name == 'shorts' ? 'Shorts' : tab.name == 'livestreams' ? 'Трансляции' : 'Видео' }));
                drawGrid(json.content);
                appendMore(view);
                _this.loading(false);
            }, function () {
                drawEmpty('Видео не найдены', 'На канале нет видео или инстанс их не отдал');
            });
        }

        function loadMoreChannel(view) {
            if (view.tabNextpage && view.tabs && view.tabs.length) {
                apiGet('/channels/tabs', { data: view.tabs[0].data, nextpage: view.tabNextpage }, function (json) {
                    if (!json || !json.content) return;
                    view.tabNextpage = json.nextpage || null;
                    scroll.render().find('.yt-more').remove();
                    drawGrid(json.content);
                    appendMore(view);
                }, function () { scroll.render().find('.yt-more').remove(); });
            } else if (view.nextpage) {
                apiGet('/nextpage/channel/' + view.id, { nextpage: view.nextpage }, function (json) {
                    if (!json || !json.relatedStreams) return;
                    view.nextpage = json.nextpage || null;
                    scroll.render().find('.yt-more').remove();
                    drawGrid(json.relatedStreams);
                    appendMore(view);
                }, function () { scroll.render().find('.yt-more').remove(); });
            }
        }

        // --- навигация ---------------------------------------------------------

        function openView(view) {
            stack.push(view);
            renderView(view);
        }

        function renderView(view) {
            if (!view) return;
            if (view.view == 'home') drawHome();
            else if (view.view == 'search') drawSearch(view);
            else if (view.view == 'video') drawVideo(view);
            else if (view.view == 'channel') drawChannel(view);

            // Обновляем навигацию: после перерисовки_scroll нужно заново
            // собрать коллекцию фокусируемых элементов
            try {
                Lampa.Controller.add('content', {
                    toggle: function () {
                        Lampa.Controller.collectionSet(scroll.render());
                        Lampa.Controller.collectionFocus(last || false, scroll.render());
                    },
                    gone: function () { network.clear(); },
                    up: function () {
                        if (Navigator.canmove('up')) Navigator.move('up');
                        else Lampa.Controller.toggle('head');
                    },
                    down: function () { Navigator.move('down'); },
                    right: function () { if (Navigator.canmove('right')) Navigator.move('right'); },
                    left: function () {
                        if (Navigator.canmove('left')) Navigator.move('left');
                        else Lampa.Controller.toggle('menu');
                    },
                    back: function () { _this.back(); }
                });
                Lampa.Controller.toggle('content');
            } catch (e) {}
        }

        function openVideo(v) {
            var id = v.id || videoId(v);
            if (!id) return;
            openView({ view: 'video', id: id, video: v });
        }

        function openChannel(id) {
            if (!id) return;
            openView({ view: 'channel', id: id });
        }

        function openSearch(query) {
            openView({ view: 'search', query: query, filter: 'videos', nextpage: null });
        }

        // --- жизненный цикл ----------------------------------------------------

        this.initialize = function () {
            openView({ view: 'home' });
        };

        this.start = function () {
            if (Lampa.Activity.active().activity !== this.activity) return;

            if (!initialized) {
                initialized = true;
                this.initialize();
            }

            // Навигация регистрируется в renderView() при каждой перерисовке
            if (!controllerReady) {
                controllerReady = true;
                Lampa.Controller.toggle('content');
            }
        };

        this.back = function () {
            stack.pop();
            if (stack.length) renderView(stack[stack.length - 1]);
            else Lampa.Activity.backward();
        };

        this.pause = function () { network.clear(); };
        this.stop = function () { network.clear(); };

        this.destroy = function () {
            network.clear();
            scroll.destroy();
            stack = [];
        };
    }

    // --------------------------------------------------------------------------
    //  Настройки
    // --------------------------------------------------------------------------

    var cobaltStatusEl = null;

    function updateCobaltStatus() {
        if (!cobaltStatusEl || !cobaltStatusEl.length) return;
        try {
            var url = cobaltUrl();
            cobaltStatusEl.text(url ? 'Экстрактор: ' + url : 'Экстрактор не настроен — воспроизведение до 720p');
        } catch (e) {}
    }

    function showCobaltInstructions() {
        var html = $(
            '<div class="about" style="line-height:1.6">' +
            '<div>Для воспроизведения в максимальном качестве (вплоть до 4K) нужен свой сервер <b>cobalt</b>. Публичный api.cobalt.tools больше не отдаёт YouTube, поэтому разворачиваем свой — одна команда:</div>' +
            '<div style="background:rgba(0,0,0,0.4);border-radius:0.4em;padding:0.8em;margin:0.8em 0;font-family:monospace;font-size:0.85em;white-space:pre-wrap">docker run -d --name cobalt -p 9000:9000 ghcr.io/imputnet/cobalt</div>' +
            '<div>После запуска укажите в настройках URL: <b>http://IP-сервера:9000</b></div>' +
            '<div style="margin-top:0.6em;opacity:0.7">cobalt отдаёт готовый mp4 в исходном качестве. Без него плагин откатывается на поток Piped (до 720p) или встроенный плеер.</div>' +
            '</div>'
        );

        try {
            Lampa.Modal.open({ title: 'Настройка cobalt для 4K', html: html, size: 'medium' });
        } catch (e) {}
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
            field: { name: 'Воспроизведение' }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT,
            param: { type: 'button' },
            field: {
                name: 'Как получить 4K (cobalt)',
                description: 'Инструкция по запуску своего сервера cobalt в Docker'
            },
            onChange: function () { showCobaltInstructions(); }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT,
            param: { name: 'yt_cobalt_url', type: 'input', values: { '': '' }, default: '' },
            field: {
                name: 'URL сервера cobalt',
                description: 'Например: http://192.168.1.100:9000'
            },
            onChange: function () { updateCobaltStatus(); }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT,
            param: { name: 'yt_cobalt_key', type: 'input', values: { '': '' }, default: '' },
            field: {
                name: 'API-ключ cobalt (необязательно)',
                description: 'Только если сервер требует авторизацию'
            }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT,
            param: {
                name: 'yt_quality',
                type: 'select',
                values: (function () { var o = {}; QUALITIES.forEach(function (q) { o[q.q] = q.title; }); return o; })(),
                default: '2160'
            },
            field: {
                name: 'Качество по умолчанию',
                description: 'Используется при воспроизведении через cobalt'
            }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT,
            param: { type: 'button' },
            field: { name: 'Статус экстрактора' },
            onRender: function (item) {
                cobaltStatusEl = $('<div class="settings-param__descr"></div>');
                item.append(cobaltStatusEl);
                updateCobaltStatus();
            }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT,
            param: { type: 'title' },
            field: { name: 'Контент' }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT,
            param: { name: 'yt_piped_url', type: 'input', values: { '': '' }, default: DEFAULT_PIPED },
            field: {
                name: 'URL API Piped',
                description: 'Можно заменить на свой или другой публичный инстанс'
            }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT,
            param: {
                name: 'yt_region',
                type: 'select',
                values: REGIONS,
                default: 'RU'
            },
            field: { name: 'Регион трендов' }
        });
    }

    // --------------------------------------------------------------------------
    //  Пункт главного меню
    // --------------------------------------------------------------------------

    function addMenuItem(body) {
        var list = body.find('.menu__list:eq(0)');
        if (!list || !list.length) list = body;
        if (list.find('[data-action="youtube"]').length) return;

        list.append(
            '<li class="menu__item selector" data-action="youtube">' +
            '<div class="menu__ico"><svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="6" width="34" height="24" rx="5" fill="#FF0000"/><path d="M15 13.5v9l7.5-4.5-7.5-4.5z" fill="#fff"/></svg></div>' +
            '<div class="menu__text">YouTube</div>' +
            '</li>'
        );
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
                try { addMenuItem($(e.body)); } catch (err) {}
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
        try { addTemplates(); $('body').append(Lampa.Template.get('yt_css', {}, true)); } catch (e) {}
        try { addSettings(); } catch (e) {}
        try { followMenu(); } catch (e) {}
    }

    Lampa.Manifest.plugins = {
        type: 'video',
        version: '2.0.0',
        name: 'YouTube',
        description: 'Полноценный клиент YouTube: тренды, поиск, видео и каналы + воспроизведение в 4K через cobalt',
        component: COMPONENT,
        onContextMenu: function () {
            return {
                name: 'YouTube',
                description: 'Тренды, поиск, каналы'
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
