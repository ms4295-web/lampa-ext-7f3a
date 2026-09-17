(function () {
    'use strict';

    /**
     * Минимальный каркас плагина для Lampa / Lampac NextGen.
     *
     * Точка входа — функция startPlugin(), она вызывается один раз
     * при загрузке файла плагином Lampa (Settings -> Plugins -> URL).
     *
     * Репозиторий: https://github.com/ms4295-web/ms4295-plugin
     */

    var PLUGIN_KEY = 'ms4295_plugin';

    function startPlugin() {
        // Флаг, чтобы плагин не инициализировался дважды
        window[PLUGIN_KEY] = true;

        console.log(PLUGIN_KEY, 'loaded');

        // --- 1. Локализация -------------------------------------------------
        // Переводы доступны через Lampa.Lang.translate(PLUGIN_KEY + '_name')
        Lampa.Lang.add({
            ms4295_plugin_name: {
                ru: 'Мой плагин',
                en: 'My plugin',
                uk: 'Мій плагін',
                be: 'Мой плагін'
            },
            ms4295_plugin_enable: {
                ru: 'Включить плагин',
                en: 'Enable plugin',
                uk: 'Увімкнути плагін',
                be: 'Уключыць плагін'
            },
            ms4295_plugin_description: {
                ru: 'Пустой шаблон плагина для Lampa / Lampac NextGen',
                en: 'Empty plugin template for Lampa / Lampac NextGen',
                uk: 'Порожній шаблон плагіна для Lampa / Lampac NextGen',
                be: 'Пусты шаблон плагіна для Lampa / Lampac NextGen'
            }
        });

        // --- 2. Раздел в настройках Lampa -----------------------------------
        var icon = '<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">'
                 + '<rect x="2" y="2" width="32" height="32" rx="6" stroke="currentColor" stroke-width="3"/>'
                 + '<path d="M11 18h14M18 11v14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'
                 + '</svg>';

        Lampa.SettingsApi.addComponent({
            component: PLUGIN_KEY,
            icon: icon,
            name: 'ms4295_plugin_name'
        });

        Lampa.SettingsApi.addParam({
            component: PLUGIN_KEY,
            param: {
                name: PLUGIN_KEY + '_enabled',
                type: 'trigger',
                default: false
            },
            field: {
                name: 'ms4295_plugin_enable',
                desc: 'ms4295_plugin_description'
            }
        });

        // Пример параметра-строки (раскомментируйте при необходимости):
        // Lampa.SettingsApi.addParam({
        //     component: PLUGIN_KEY,
        //     param: {
        //         name: PLUGIN_KEY + '_url',
        //         type: 'input',
        //         default: ''
        //     },
        //     field: {
        //         name: 'URL'
        //     }
        // });

        // --- 3. Чтение настроек ---------------------------------------------
        function isEnabled() {
            return Lampa.Storage.field(PLUGIN_KEY + '_enabled') === true;
        }

        // --- 4. Хуки Lampa ---------------------------------------------------
        // 'full' — открывается карточка фильма/сериала
        // e.type: 'start' | 'complite' | 'destroy'
        Lampa.Listener.follow('full', function (e) {
            if (!isEnabled()) return;

            if (e.type === 'complite') {
                // e.object.activity.render() — DOM карточки
                // TODO: ваша логика
            }
        });

        // 'app' — жизненный цикл самого приложения (e.type: 'ready')
        Lampa.Listener.follow('app', function (e) {
            if (!isEnabled()) return;

            if (e.type === 'ready') {
                // TODO: логика при старте приложения
            }
        });
    }

    if (!window[PLUGIN_KEY]) {
        startPlugin();
    }
})();
