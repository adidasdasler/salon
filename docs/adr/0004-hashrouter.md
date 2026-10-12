# ADR-0004: HashRouter во всех SPA

**Статус:** принят

SPA отдаются статикой через nginx; history-API роутинг требует try_files на каждом уровне прокси (хостовой nginx + docker nginx + dev). HashRouter (`/#/calendar`) убирает этот класс регрессий полностью; SEO для CRM/виджета не нужен (публичные страницы рендерит marketing c SSR-заменой в будущем при необходимости).
