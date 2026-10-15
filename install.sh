#!/bin/sh
# Установка podkop-sub (CLI + LuCI) на OpenWrt.
#   sh install.sh            установить или обновить (настройки сохраняются)
#   sh install.sh uninstall  удалить (настройки /etc/config/podkop_sub остаются)
#   sh install.sh purge      удалить вместе с настройками и HWID
#
# Собранный build.sh файл содержит архив с файлами после строки __PAYLOAD__.

set -e

VERSION="@VERSION@"
LIST=/usr/share/podkop-sub/files.list

say() { echo "podkop-sub: $*"; }
fail() { echo "podkop-sub: ОШИБКА: $*" >&2; exit 1; }

reload_luci() {
	rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache
	/etc/init.d/rpcd reload >/dev/null 2>&1 || true
}

do_uninstall() {
	[ -f "$LIST" ] || fail "podkop-sub не установлен"
	/etc/init.d/podkop_sub stop >/dev/null 2>&1 || true
	/etc/init.d/podkop_sub disable >/dev/null 2>&1 || true
	local f
	while read -r f; do
		[ "$f" = /etc/config/podkop_sub ] && [ "$1" != purge ] && continue
		rm -f "$f"
	done < "$LIST"
	rm -f "$LIST"
	rmdir /usr/share/podkop-sub /www/luci-static/resources/view/podkop_sub 2>/dev/null || true
	[ "$1" = purge ] && rm -rf /etc/podkop_sub
	reload_luci
	say "удалён${1:+ ($1)}"
}

do_install() {
	[ -f /etc/openwrt_release ] || fail "это не OpenWrt"
	[ -x /etc/init.d/podkop ] || fail "Podkop не установлен: сначала поставьте itdoginfo/podkop"

	if ! command -v curl >/dev/null 2>&1; then
		say "ставлю curl"
		if command -v apk >/dev/null 2>&1; then
			apk update >/dev/null && apk add curl
		else
			opkg update >/dev/null && opkg install curl
		fi
	fi

	local tmp
	tmp="$(mktemp -d /tmp/podkop-sub-install.XXXXXX)"
	trap 'rm -rf "$tmp"' EXIT

	grep -q '^__PAYLOAD__$' "$0" 2>/dev/null || fail "в файле нет архива: запускайте собранный dist/podkop-sub-install.sh"
	sed '1,/^__PAYLOAD__$/d' "$0" | base64 -d | tar -xzf - -C "$tmp" || fail "архив повреждён"

	# настройки пользователя не перезаписываем
	[ -f /etc/config/podkop_sub ] && rm -f "$tmp/etc/config/podkop_sub"

	(cd "$tmp" && find . -type f | sed 's#^\.##') > "$tmp.list"
	local f
	# файлы прошлой версии, которых нет в новой
	if [ -f "$LIST" ]; then
		while read -r f; do
			[ "$f" = /etc/config/podkop_sub ] && continue
			grep -qxF "$f" "$tmp.list" || rm -f "$f"
		done < "$LIST"
	fi
	while read -r f; do
		mkdir -p "${f%/*}"
		cp "$tmp$f" "$f"
	done < "$tmp.list"
	# в списке и конфиг, чтобы purge его удалял
	grep -qx /etc/config/podkop_sub "$tmp.list" || echo /etc/config/podkop_sub >> "$tmp.list"
	mkdir -p "${LIST%/*}"
	mv "$tmp.list" "$LIST"
	echo "$VERSION" > /usr/share/podkop-sub/version

	chmod 755 /usr/bin/podkop-sub /etc/init.d/podkop_sub
	/etc/init.d/podkop_sub enable
	/etc/init.d/podkop_sub start
	reload_luci

	say "версия $VERSION установлена"
	say "LuCI: Службы -> Podkop: подписки (обновите страницу браузера)"
}

case "$1" in
	uninstall|purge) do_uninstall "$1" ;;
	''|install) do_install ;;
	*) sed -n '2,6s/^# \{0,1\}//p' "$0"; exit 2 ;;
esac
exit 0
