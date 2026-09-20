/**
 * ============================================================================
 *  Plugin: Country Filter (Фильтр стран)
 * ----------------------------------------------------------------------------
 *  Прячет карточки контента из выбранных стран во всех списках Lampa
 *  (каталоги, рекомендации, поиск, история и т.д.) — карточка создаётся,
 *  но не отображается.
 *
 *  Страны по умолчанию: Корея, Китай, Турция, Индия, Пакистан, Афганистан.
 *  Каждую страну можно отдельно включить/выключить в настройках.
 *
 *  Настройки: Настройки -> Фильтр стран
 *  (после изменения настроек необходимо перезайти в лампу)
 *
 *  Определение страны:
 *    - origin_country         (['KR','US'])
 *    - production_countries   ([{iso_3166_1:'IN'}])
 *    - production_country/country ('TR')
 *    - original_language      ('ko','zh','tr','hi','fa') — резервный сигнал,
 *      отключается отдельной настройкой
 * ============================================================================
 */
(function () {
    'use strict';

    if (window.country_filter_plugin) return;
    window.country_filter_plugin = true;

    var COMPONENT = 'country_filter';

    // Группы стран: коды ISO-3166-1 + язык оригинала
    var GROUPS = {
        cf_korea:       { title: 'Корея',        codes: ['KR', 'KP'], lang: 'ko' },
        cf_china:       { title: 'Китай',        codes: ['CN', 'HK', 'TW'], lang: 'zh' },
        cf_turkey:      { title: 'Турция',       codes: ['TR'], lang: 'tr' },
        cf_india:       { title: 'Индия',        codes: ['IN'], lang: 'hi' },
        cf_pakistan:    { title: 'Пакистан',     codes: ['PK'], lang: 'ps' },
        cf_afghanistan: { title: 'Афганистан',   codes: ['AF'], lang: 'fa' }
    };

    var blCache = null;

    function enabled() {
        return Lampa.Storage.get('cf_enabled', true);
    }

    function useLang() {
        return Lampa.Storage.get('cf_lang', true);
    }

    // Чёрный список: { codes: {'KR':true}, langs: {'ko':true}, count: N }
    function blacklist() {
        if (blCache) return blCache;

        var codes = {};
        var langs = {};
        var count = 0;

        for (var key in GROUPS) {
            if (Object.prototype.hasOwnProperty.call(GROUPS, key) && Lampa.Storage.get(key, true)) {
                GROUPS[key].codes.forEach(function (code) {
                    if (!codes[code]) count++;
                    codes[code] = true;
                });
                langs[GROUPS[key].lang] = true;
            }
        }

        blCache = { codes: codes, langs: langs, count: count };

        return blCache;
    }

    function blocked(element) {
        if (!enabled()) return false;
        if (!element || typeof element !== 'object') return false;

        var bl = blacklist();

        if (!bl.count) return false;

        // origin_country: ['KR','US']
        var countries = element.origin_country;

        if (countries && typeof countries.length === 'number') {
            for (var i = 0; i < countries.length; i++) {
                if (bl.codes[countries[i]]) return true;
            }
        }

        // production_countries: [{iso_3166_1:'IN', name:'India'}]
        var prod = element.production_countries;

        if (prod && typeof prod.length === 'number') {
            for (var j = 0; j < prod.length; j++) {
                var p = prod[j];
                if (p && p.iso_3166_1 && bl.codes[p.iso_3166_1]) return true;
            }
        }

        // одиночное поле страны
        var single = element.production_country || element.country;

        if (single && bl.codes[single]) return true;

        // язык оригинала как резервный сигнал
        if (useLang()) {
            var lang = element.original_language;
            if (lang && bl.langs[lang]) return true;
        }

        return false;
    }

    function hideHtml(html) {
        if (!html) return;

        try {
            // jQuery-объект
            if (typeof html.hide === 'function') {
                html.hide();
                return;
            }
        } catch (e) {}

        try {
            // DOM-элемент
            if (html.style) {
                html.style.display = 'none';
                return;
            }

            // массив/jQuery-подобный объект
            if (html.length && html[0] && html[0].style) {
                html[0].style.display = 'none';
            }
        } catch (e) {}
    }

    // --- ПЕРЕХВАТ СОЗДАНИЯ КАРТОЧЕК -----------------------------------------

    function wrapCreateInstance() {
        try {
            var origin = Lampa.Utils.createInstance;

            if (!origin || origin.__cf_wrapped) return;

            var wrapper = function (BaseClass, element) {
                var item = origin.apply(this, arguments);

                try {
                    if (item && blocked(element)) {
                        // html уже мог быть создан
                        hideHtml(item.html);

                        // либо создастся позже — патчим create
                        if (typeof item.create === 'function' && !item.create.__cf_patched) {
                            var origCreate = item.create;

                            var patched = function () {
                                var result = origCreate.apply(this, arguments);

                                try {
                                    hideHtml(this.html);
                                } catch (e) {}

                                return result;
                            };

                            patched.__cf_patched = true;

                            item.create = patched;
                        }
                    }
                } catch (e) {}

                return item;
            };

            wrapper.__cf_wrapped = true;

            Lampa.Utils.createInstance = wrapper;
        } catch (e) {}
    }

    // --- НАСТРОЙКИ -----------------------------------------------------------

    function addSettings() {
        Lampa.SettingsApi.addComponent({
            component: COMPONENT,
            icon: "<svg height=\"36\" viewBox=\"0 0 38 36\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n                <rect x=\"2\" y=\"4\" width=\"34\" height=\"28\" rx=\"3\" stroke=\"white\" stroke-width=\"3\"/>\n                <path d=\"M19 4v28M2 18h34\" stroke=\"white\" stroke-width=\"3\"/>\n                <path d=\"M9 12l2 2 4-4\" stroke=\"white\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>\n                <path d=\"M25 22h5M27.5 19.5v5\" stroke=\"white\" stroke-width=\"3\" stroke-linecap=\"round\"/>\n            </svg>",
            name: 'Фильтр стран'
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT,
            param: {
                name: 'cf_enabled',
                type: 'trigger',
                default: true
            },
            field: {
                name: 'Включить фильтр',
                description: 'Прятать карточки контента из выбранных стран'
            },
            onChange: function () {
                blCache = null;
                Lampa.Noty.show('Необходимо перезайти в лампу');
            }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT,
            param: {
                name: 'cf_lang',
                type: 'trigger',
                default: true
            },
            field: {
                name: 'Фильтровать по языку оригинала',
                description: 'Дополнительно: контент на корейском, китайском, турецком, хинди, персидском'
            },
            onChange: function () {
                blCache = null;
                Lampa.Noty.show('Необходимо перезайти в лампу');
            }
        });

        for (var key in GROUPS) {
            if (!Object.prototype.hasOwnProperty.call(GROUPS, key)) continue;

            (function (groupKey, group) {
                Lampa.SettingsApi.addParam({
                    component: COMPONENT,
                    param: {
                        name: groupKey,
                        type: 'trigger',
                        default: true
                    },
                    field: {
                        name: group.title,
                        description: group.codes.join(', ')
                    },
                    onChange: function () {
                        blCache = null;
                        Lampa.Noty.show('Необходимо перезайти в лампу');
                    }
                });
            })(key, GROUPS[key]);
        }
    }

    // --- СТАРТ ---------------------------------------------------------------

    Lampa.Manifest.plugins = {
        type: 'video',
        version: '1.0.0',
        name: 'Фильтр стран',
        description: 'Прячет контент из выбранных стран (Корея, Китай, Турция и др.)',
        component: COMPONENT,
        onContextMenu: function () {
            return {
                name: 'Фильтр стран',
                description: 'Настройки фильтра стран'
            };
        },
        onContextLauch: function () {
            try {
                Lampa.Activity.push({
                    url: '',
                    title: 'Фильтр стран',
                    component: 'settings_' + COMPONENT,
                    page: 1
                });
            } catch (e) {}
        }
    };

    try {
        addSettings();
    } catch (e) {}

    try {
        wrapCreateInstance();
    } catch (e) {}
})();
