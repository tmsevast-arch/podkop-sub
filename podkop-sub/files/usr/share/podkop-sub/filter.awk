# Фильтр ссылок подписки. Вход: по одной ссылке в строке.
# Выход (TSV): статус(+/-) причина протокол транспорт хост порт имя ссылка
# Переменные (-v): protocols transports hosts cut inc exc no_ru statfile
# Запускать с LC_ALL=C: имена сравниваются побайтно (UTF-8).

function nz(s) { return s == "" ? "-" : s }

function hexval(c) { return index("0123456789abcdef", tolower(c)) - 1 }

function urldecode(s,   out, i, c, h1, h2) {
	out = ""
	for (i = 1; i <= length(s); i++) {
		c = substr(s, i, 1)
		if (c == "%" && i + 2 <= length(s)) {
			h1 = hexval(substr(s, i + 1, 1)); h2 = hexval(substr(s, i + 2, 1))
			if (h1 >= 0 && h2 >= 0) { out = out sprintf("%c", h1 * 16 + h2); i += 2; continue }
		}
		out = out c
	}
	return out
}

function param(q, k,   n, i, a) {
	n = split(q, a, "&")
	for (i = 1; i <= n; i++)
		if (index(a[i], k "=") == 1) return tolower(urldecode(substr(a[i], length(k) + 2)))
	return ""
}

function is_russian(name,   l) {
	l = tolower(name)
	# флаг 🇷🇺, «Россия» в любом регистре, Russia/Moscow, отдельное слово RU
	return index(name, "\360\237\207\267\360\237\207\272") ||
		name ~ /[Рр]осси|РОССИ|[Мм]оскв|МОСКВ/ ||
		l ~ /russia|moscow|(^|[^a-z])ru([^a-z]|$)/
}

BEGIN {
	n = split(protocols, a, " "); for (i = 1; i <= n; i++) P[a[i]] = 1
	n = split(transports, a, " "); for (i = 1; i <= n; i++) T[a[i]] = 1
	n = split(hosts, a, " "); for (i = 1; i <= n; i++) H[a[i]] = 1
	total = stubs = kept = 0
	inc_l = tolower(inc); exc_l = tolower(exc)
}

{ sub(/\r$/, ""); gsub(/^[ \t]+|[ \t]+$/, "") }

$0 == "" { next }

cut != "" && index($0, "@" cut ":") { exit }

{
	p = index($0, "://")
	if (!p) next
	total++
	link = $0
	scheme = tolower(substr(link, 1, p - 1))
	rest = substr(link, p + 3)

	name = ""; i = index(rest, "#")
	if (i) { name = urldecode(substr(rest, i + 1)); rest = substr(rest, 1, i - 1) }
	gsub(/\t/, " ", name)
	query = ""; i = index(rest, "?")
	if (i) { query = substr(rest, i + 1); rest = substr(rest, 1, i - 1) }
	i = index(rest, "/")
	if (i) rest = substr(rest, 1, i - 1)

	host = rest
	while ((i = index(host, "@"))) host = substr(host, i + 1)
	port = ""
	if (substr(host, 1, 1) == "[") {
		i = index(host, "]")
		port = substr(host, i + 2); host = substr(host, 2, i - 2)
	} else if (match(host, /:[0-9]+$/)) {
		port = substr(host, RSTART + 1); host = substr(host, 1, RSTART - 1)
	}

	proto = scheme
	if (proto == "hy2") proto = "hysteria2"
	if (proto ~ /^socks(4|4a|5)?$/) proto = "socks"

	tr = "-"
	if (proto == "vless" || proto == "trojan") {
		tr = param(query, "type")
		if (tr == "" || tr == "raw") tr = "tcp"
		if (tr == "splithttp") tr = "xhttp"
	}

	reason = ""
	if (host == "0.0.0.0") stubs++
	if (host in H) reason = "host"
	else if (!(proto in P)) reason = "protocol"
	else if (tr != "-" && !(tr in T)) reason = "transport"
	else if (no_ru && is_russian(name)) reason = "russia"
	else if (inc != "" && tolower(name) !~ inc_l) reason = "include"
	else if (exc != "" && tolower(name) ~ exc_l) reason = "exclude"

	# пустые поля как "-": read в shell склеивает подряд идущие табы
	if (reason == "") { kept++; st = "+"; reason = "-" } else st = "-"
	printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n", st, reason, proto, tr, nz(host), nz(port), nz(name), link
}

END {
	if (statfile != "") printf "total=%d\nstubs=%d\nkept=%d\n", total, stubs, kept > statfile
}
