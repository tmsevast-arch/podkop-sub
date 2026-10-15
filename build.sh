#!/bin/sh
# Собирает dist/podkop-sub-install.sh: install.sh + архив с файлами (base64).
# Запуск: sh build.sh (Git Bash / Linux)

set -e
cd "$(dirname "$0")"

VERSION="$(cat VERSION)"
STAGE=dist/stage
OUT=dist/podkop-sub-install.sh

rm -rf dist
mkdir -p "$STAGE/www"
cp -R podkop-sub/files/. "$STAGE/"
cp -R luci-app-podkop-sub/root/. "$STAGE/"
cp -R luci-app-podkop-sub/htdocs/. "$STAGE/www/"

# на роутер только LF
if grep -rlI "$(printf '\r')" "$STAGE" install.sh; then
	echo "ОШИБКА: в файлах выше есть CRLF" >&2
	exit 1
fi

sed "s/@VERSION@/$VERSION/" install.sh > "$OUT"
echo __PAYLOAD__ >> "$OUT"
tar -C "$STAGE" --owner=0 --group=0 -czf - . | base64 -w 0 >> "$OUT"
echo >> "$OUT"
rm -rf "$STAGE"

echo "готово: $OUT ($VERSION, $(wc -c < "$OUT") байт)"
