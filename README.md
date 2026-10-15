# podkop-sub — подписки для Podkop (OpenWrt 25.x)

Расширение для [Podkop](https://github.com/itdoginfo/podkop): скачивает подписки провайдеров
(с HWID, как приложения-клиенты) и записывает серверы в секции Podkop (`urltest_proxy_links`).
Вкладка в LuCI: **Службы → Podkop: подписки**.

- несколько подписок, каждая в свою секцию Podkop (или несколько в одну, с объединением и удалением дублей)
- ручные ссылки, которые всегда добавляются к секции
- фильтры: протоколы (vless, ss, trojan, hysteria2, socks), транспорты (tcp, ws, grpc, xhttp),
  «без РФ» по названию, максимальный пинг, include/exclude по названию, маркер конца списка (`sss.ss`), исключение хостов-заглушек
- при ошибке или заглушках остаётся прошлый список; Podkop перезапускается только при изменениях
- статус: время обновления, число серверов, трафик и срок подписки (`Subscription-Userinfo`)
- ночное обновление (Podkop перезагружается только при изменении состава серверов) и проверка живых серверов через Clash API (каждый сервер отдельно) каждые N минут с внеплановым обновлением, если живых меньше порога

## Установка

Нужны OpenWrt 25.x и установленный [Podkop](https://github.com/itdoginfo/podkop). На роутере:

```sh
wget -O /tmp/podkop-sub-install.sh https://github.com/tmsevast-arch/podkop-sub/releases/latest/download/podkop-sub-install.sh && sh /tmp/podkop-sub-install.sh
```

Затем выйдите из LuCI и войдите заново: появится **Службы → Podkop: подписки**.

Та же команда обновляет до последней версии, настройки сохраняются.
Удаление: `sh /tmp/podkop-sub-install.sh uninstall` (настройки остаются) или `purge` (вместе с настройками и HWID).

Без интернета на роутере: соберите `sh build.sh` → `dist/podkop-sub-install.sh`, скопируйте `scp -O` и запустите так же.

До первого обновления задайте роутеру имя хоста (**Система → Система → Имя хоста**) или поле «Имя устройства»:
под ним роутер зарегистрируется у провайдера.

## CLI

```
podkop-sub update [подписка]   обновить и применить к Podkop
podkop-sub preview <подписка>  что пройдёт фильтры (без записи)
podkop-sub check               проверить живые серверы, при нехватке обновить
podkop-sub apply               применить ручные ссылки и настройки без загрузки
podkop-sub diag <подписка>     диагностика ответа провайдера
podkop-sub status              состояние в JSON
```
Подписка указывается по названию или id секции. Логи: `logread -e podkop-sub`.
Коды выхода: 0 ок, 1 ошибка подписки, 2 ошибка конфигурации, 3 уже запущено.

## Структура

```
podkop-sub/files/          backend: /usr/bin/podkop-sub, filter.awk, UCI-конфиг, init.d (cron)
luci-app-podkop-sub/       LuCI: view/podkop_sub/main.js, меню, ACL
install.sh                 установщик (шаблон; build.sh дописывает архив)
build.sh, VERSION          сборка dist/podkop-sub-install.sh
```

## Важно про провайдера

- Без заголовка `x-hwid` и User-Agent `sing-box/...` провайдер отдаёт заглушки `0.0.0.0:1`.
- HWID хранится в `/etc/config/podkop_sub` и занимает слот устройства. Новый HWID — новый слот.

## Выпуск версии

```sh
# поднять VERSION, затем
sh build.sh
gh release create vX.Y.Z -R tmsevast-arch/podkop-sub dist/podkop-sub-install.sh --title vX.Y.Z --notes "..."
```

## Дальше

- [ ] Обновление при поднятии WAN (hotplug), экспорт/импорт настроек
- [ ] Кнопка «Обновить расширение» в LuCI
