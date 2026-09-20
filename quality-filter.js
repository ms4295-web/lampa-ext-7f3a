/**
 * ============================================================================
 *  Plugin: Quality Filter (Фильтр качества)
 * ----------------------------------------------------------------------------
 *  Отсекает качество видео ниже выбранного порога (по умолчанию 1080p):
 *
 *    1) убирает низкие качества из списка качеств плеера (Lampa.Player.play)
 *       — работает для всех источников: встроенный онлайн, плагины, IPTV;
 *    2) прячет карточки видео в списках онлайн-компонентов, у которых
 *       качество ниже порога (если в списке останется хотя бы одна карточка).
 *
 *  Настройки: Настройки -> Фильтр качества
 *  (после изменения настроек необходимо перезайти в лампу)
 *
 *  Качества: 360p (LD), 480p (SD), 720p (HD), 1080p (FHD),
 *            1440p (2K), 2160p (4K/UHD)
 * ============================================================================
 */
(function () {
    'use strict';

    if (window.quality_filter_plugin) return;
    window.quality_filter_plugin = true;

    var COMPONENT = 'qfilter';

    // Ранг качества: больше = лучше. Незнакомые значения не фильтруем (ранг 0).
    var RANK = {
        '360p': 1, 'ld': 1,
        '480p': 2, 'sd': 2,
        '720p': 3, 'hd': 3,
        '1080p': 4, 'fhd': 4,
        '1440p': 5, '2k': 5,
        '2160p': 6, '4k': 6, 'uhd': 6
    };

    function rankOf(value) {
        if (value === undefined || value === null) return 0;

        var text = String(value).trim().toLowerCase();

        if (RANK[text]) return RANK[text];

        // "1080p" / "720P" внутри строки, например "FHD 1080p"
        var match = text.match(/(\d{3,4})\s*p/);

        if (match) {
            var rank = RANK[match[1] + 'p'];
            if (rank) return rank;
        }

        return 0;
    }

    function enabled() {
        return Lampa.Storage.get('qf_enabled', true);
    }

    function limitRank() {
        return rankOf(Lampa.Storage.get('qf_level', '1080p')) || RANK['1080p'];
    }

    // --- 1. ФИЛЬТР КАЧЕСТВ В ПЛЕЕРЕ -----------------------------------------

    function filterPlayerQuality(data) {
        if (!data || typeof data !== 'object') return;

        var quality = data.quality;

        if (!quality || typeof quality !== 'object' || Object.prototype.toString.call(quality) === '[object Array]') return;

        var keys = [];

        for (var key in quality) {
            if (Object.prototype.hasOwnProperty.call(quality, key)) keys.push(key);
        }

        if (keys.length <= 1) return; // один вариант качества — не трогаем

        var limit = limitRank();
        var keep = [];

        keys.forEach(function (key) {
            var rank = rankOf(key);
            if (rank === 0 || rank >= limit) keep.push(key); // незнакомые оставляем
        });

        // Всё ниже порога — не ломаем воспроизведение, оставляем как есть
        if (keep.length === 0 || keep.length === keys.length) return;

        var filtered = {};

        keep.forEach(function (key) {
            filtered[key] = quality[key];
        });

        data.quality = filtered;

        try {
            console.log('QualityFilter', 'качества:', keys.join(','), '->', keep.join(','));
        } catch (e) {}
    }

    function wrapPlayer() {
        try {
            var origin = Lampa.Player.play;

            if (!origin || origin.__qf_wrapped) return;

            var wrapper = function (data) {
                try {
                    if (enabled()) filterPlayerQuality(data);
                } catch (e) {}

                return origin.apply(this, arguments);
            };

            wrapper.__qf_wrapped = true;

            Lampa.Player.play = wrapper;
        } catch (e) {}
    }

    // --- 2. ФИЛЬТР КАРТОЧЕК В СПИСКАХ ---------------------------------------

    function cardRank(card) {
        var badge = card.querySelector('.season-episode__quality');

        return rankOf(badge ? badge.textContent : '');
    }

    function filterCards() {
        if (!enabled()) return;

        var limit = limitRank();
        var cards = document.querySelectorAll('.season-episode:not(.qf-hidden)');

        if (!cards || !cards.length) return;

        var seen = [];

        Array.prototype.forEach.call(cards, function (card) {
            var container = card.parentNode;

            if (!container) return;

            if (seen.indexOf(container) !== -1) return;

            seen.push(container);

            var list = Array.prototype.slice.call(container.querySelectorAll('.season-episode:not(.qf-hidden)'));
            var toHide = [];

            list.forEach(function (item) {
                var rank = cardRank(item);
                if (rank > 0 && rank < limit) toHide.push(item);
            });

            // Прячем, только если в списке останется хотя бы одна карточка
            if (toHide.length && toHide.length < list.length) {
                toHide.forEach(function (item) {
                    item.classList.add('qf-hidden');
                });
            }
        });
    }

    var filterTimer = null;

    function scheduleFilter() {
        if (filterTimer) return;

        filterTimer = setTimeout(function () {
            filterTimer = null;

            try {
                filterCards();
            } catch (e) {}
        }, 200);
    }

    function startObserver() {
        if (typeof MutationObserver === 'undefined') return;

        try {
            var observer = new MutationObserver(function (mutations) {
                for (var i = 0; i < mutations.length; i++) {
                    if (mutations[i].addedNodes && mutations[i].addedNodes.length) {
                        scheduleFilter();
                        return;
                    }
                }
            });

            observer.observe(document.body || document.documentElement, {
                childList: true,
                subtree: true
            });
        } catch (e) {}
    }

    // --- 3. НАСТРОЙКИ --------------------------------------------------------

    function addSettings() {
        Lampa.SettingsApi.addComponent({
            component: COMPONENT,
            icon: "<svg height=\"36\" viewBox=\"0 0 38 36\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n                <rect x=\"2\" y=\"8\" width=\"34\" height=\"21\" rx=\"3\" stroke=\"white\" stroke-width=\"3\"/>\n                <line x1=\"9\" y1=\"22\" x2=\"9\" y2=\"14\" stroke=\"white\" stroke-width=\"3\" stroke-linecap=\"round\"/>\n                <line x1=\"15\" y1=\"22\" x2=\"15\" y2=\"14\" stroke=\"white\" stroke-width=\"3\" stroke-linecap=\"round\"/>\n                <line x1=\"9\" y1=\"18\" x2=\"15\" y2=\"18\" stroke=\"white\" stroke-width=\"3\" stroke-linecap=\"round\"/>\n            </svg>",
            name: 'Фильтр качества'
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT,
            param: {
                name: 'qf_enabled',
                type: 'trigger',
                default: true
            },
            field: {
                name: 'Включить фильтр',
                description: 'Скрывать качество видео ниже порога'
            },
            onChange: function () {
                Lampa.Noty.show('Необходимо перезайти в лампу');
            }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT,
            param: {
                name: 'qf_level',
                type: 'select',
                values: {
                    '720p': '720p (HD)',
                    '1080p': '1080p (FullHD)',
                    '1440p': '1440p (2K)',
                    '2160p': '2160p (4K)'
                },
                default: '1080p'
            },
            field: {
                name: 'Минимальное качество',
                description: 'Качество ниже этого будет скрыто'
            },
            onChange: function () {
                Lampa.Noty.show('Необходимо перезайти в лампу');
            }
        });
    }

    // --- 4. СТАРТ ------------------------------------------------------------

    function start() {
        try {
            var style = document.createElement('style');

            style.textContent = '.qf-hidden{display:none !important}';
            (document.head || document.body || document.documentElement).appendChild(style);
        } catch (e) {}

        try {
            addSettings();
        } catch (e) {}

        try {
            wrapPlayer();
        } catch (e) {}

        try {
            startObserver();
        } catch (e) {}

        try {
            filterCards();
        } catch (e) {}
    }

    Lampa.Manifest.plugins = {
        type: 'video',
        version: '1.0.0',
        name: 'Фильтр качества',
        description: 'Скрывает качество видео ниже 1080p',
        component: COMPONENT,
        onContextMenu: function () {
            return {
                name: 'Фильтр качества',
                description: 'Настройки фильтра качества видео'
            };
        },
        onContextLauch: function () {
            try {
                Lampa.Activity.push({
                    url: '',
                    title: 'Фильтр качества',
                    component: 'settings_' + COMPONENT,
                    page: 1
                });
            } catch (e) {}
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
