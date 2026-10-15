'use strict';
'require view';
'require form';
'require fs';
'require ui';
'require uci';
'require poll';
'require dom';

var BIN = '/usr/bin/podkop-sub';

var PROTOCOLS = [
	['vless', 'VLESS'],
	['ss', 'Shadowsocks'],
	['trojan', 'Trojan'],
	['hysteria2', 'Hysteria2'],
	['socks', 'SOCKS']
];

var TRANSPORTS = [
	['tcp', 'TCP / RAW'],
	['ws', 'WebSocket'],
	['grpc', 'gRPC'],
	['xhttp', 'XHTTP (только сборка podkop-engine)']
];

function run(args) {
	return fs.exec(BIN, args).catch(function(e) {
		return { code: -1, stdout: '', stderr: String(e) };
	});
}

function parseJSON(s, def) {
	try { return JSON.parse(s); } catch (e) { return def; }
}

function gb(n) {
	return (n / 1073741824).toFixed(1) + ' ГБ';
}

function fmtTime(t) {
	return t ? new Date(t * 1000).toLocaleString('ru-RU') : '—';
}

// "upload=1; download=2; total=3; expire=1700000000"
function fmtUserinfo(s) {
	if (!s)
		return '—';
	var v = {};
	s.split(';').forEach(function(p) {
		var kv = p.trim().split('=');
		if (kv.length == 2)
			v[kv[0]] = +kv[1];
	});
	var parts = [], used = (v.upload || 0) + (v.download || 0);
	if (v.total)
		parts.push(gb(used) + ' из ' + gb(v.total));
	else if (used)
		parts.push(gb(used));
	if (v.expire)
		parts.push('до ' + new Date(v.expire * 1000).toLocaleDateString('ru-RU'));
	return parts.length ? parts.join(', ') : '—';
}

function showOutput(title, res) {
	var text = (res.stdout || '').trim();
	if (!text)
		text = (res.stderr || '').trim() || 'Нет вывода (код ' + res.code + ')';
	ui.showModal(title, [
		E('pre', { 'style': 'white-space:pre-wrap; max-height:60vh; overflow:auto; font-size:90%' }, [ text ]),
		E('div', { 'class': 'right' }, [
			E('button', { 'class': 'btn', 'click': ui.hideModal }, [ 'Закрыть' ])
		])
	]);
}

function runModal(title, args) {
	ui.showModal(title, [ E('p', { 'class': 'spinning' }, [ 'Запрос к провайдеру…' ]) ]);
	return run(args).then(function(res) { showOutput(title, res); });
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('podkop').catch(function() {}),
			uci.load('podkop_sub'),
			run([ 'sections' ]),
			run([ 'status' ])
		]);
	},

	renderStatus: function(st) {
		var rows = uci.sections('podkop_sub', 'subscription').map(function(s) {
			var x = (st.subs || {})[s['.name']] || {};
			var result;
			if (!x.time)
				result = E('em', [ 'ещё не обновлялась' ]);
			else if (x.ok)
				result = E('span', { 'style': 'color:#2a2' }, [ 'OK' ]);
			else
				result = E('span', { 'style': 'color:#c33' }, [ x.error ]);
			var h = s.section && (st.health || {})[s.section];
			var sec = '—';
			if (s.section) {
				sec = s.section + ': ' + ((st.links || {})[s.section] || 0) + ' в Podkop';
				if (h)
					sec += ', живых ' + h.alive + ' (' + new Date(h.time * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + ')';
			}
			return [
				(s.name || s['.name']) + (s.enabled == '0' ? ' (выкл.)' : ''),
				sec,
				fmtTime(x.time),
				x.time ? x.kept + ' из ' + x.total : '—',
				fmtUserinfo(x.userinfo),
				result
			];
		});

		var table = E('table', { 'class': 'table' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				'Подписка', 'Секция', 'Обновлена', 'Серверов', 'Трафик / срок', 'Результат'
			].map(function(h) { return E('th', { 'class': 'th' }, [ h ]); }))
		]);
		cbi_update_table(table, rows, E('em', [ 'Подписок пока нет' ]));

		return E([], [
			E('p', {}, [
				'sing-box: ',
				st.sing_box ? E('strong', { 'style': 'color:#2a2' }, [ 'работает' ])
					: E('strong', { 'style': 'color:#c33' }, [ 'не запущен' ]),
				' · последний запуск: ', fmtTime(st.last_run),
				st.running ? E('span', { 'class': 'spinning', 'style': 'margin-left:1em' }, [ 'идёт обновление…' ]) : ''
			]),
			table
		]);
	},

	refreshStatus: function() {
		return run([ 'status' ]).then(L.bind(function(res) {
			var st = parseJSON(res.stdout, {});
			dom.content(this.statusNode, this.renderStatus(st));
			if (this.updateBtn && !st.running && Date.now() - this.updateStarted > 4000)
				this.updateBtn.disabled = false;
		}, this));
	},

	handleUpdateNow: function(ev) {
		var btn = ev.currentTarget;
		btn.disabled = true;
		this.updateBtn = btn;
		this.updateStarted = Date.now();
		return run([ 'update-bg' ]).then(L.bind(this.refreshStatus, this));
	},

	render: function(data) {
		var sections = parseJSON(data[2].stdout, []);
		var status = parseJSON(data[3].stdout, {});
		var m, s, o;

		// секции, указанные в подписках, но пропавшие из Podkop, тоже показываем
		var known = sections.slice();
		uci.sections('podkop_sub').forEach(function(x) {
			if (x.section && known.indexOf(x.section) < 0)
				known.push(x.section);
		});
		function addSections(o) {
			if (!known.length)
				o.value('', 'нет секций Podkop с типом «Прокси»');
			known.forEach(function(n) {
				o.value(n, sections.indexOf(n) < 0 ? n + ' (нет в Podkop)' : n);
			});
		}

		m = new form.Map('podkop_sub', 'Podkop: подписки',
			'Загрузка серверов из подписок в секции Podkop. Список серверов (URLTest) в выбранной секции ' +
			'перезаписывается при каждом обновлении, поэтому не редактируйте его в интерфейсе Podkop. ' +
			'«Применить» сразу пересобирает секции из уже скачанных списков и ручных ссылок; ' +
			'новые подписки и фильтры скачиваются кнопкой «Обновить сейчас» или по расписанию.');

		// подписки
		s = m.section(form.GridSection, 'subscription', 'Подписки');
		s.addremove = true;
		s.anonymous = true;
		s.sortable = true;
		s.nodescriptions = true;
		s.modaltitle = function(id) {
			return 'Подписка: ' + (uci.get('podkop_sub', id, 'name') || 'новая');
		};
		s.tab('basic', 'Основное');
		s.tab('filtering', 'Фильтры');

		o = s.taboption('basic', form.Flag, 'enabled', 'Вкл.');
		o.default = '1';
		o.rmempty = false;
		o.editable = true;

		o = s.taboption('basic', form.Value, 'name', 'Название');
		o.rmempty = false;
		o.placeholder = 'provider';

		o = s.taboption('basic', form.Value, 'url', 'URL подписки');
		o.password = true;
		o.rmempty = false;
		o.modalonly = true;
		o.validate = function(id, v) {
			return /^https?:\/\/\S+$/.test(v) || 'Нужна ссылка вида https://…';
		};

		o = s.taboption('basic', form.ListValue, 'section', 'Секция Podkop',
			'Только секции с типом подключения «Прокси». Режим секции переключится на URLTest.');
		addSections(o);
		o.rmempty = false;

		o = s.taboption('filtering', form.MultiValue, 'protocols', 'Протоколы',
			'Что умеет Podkop. Ничего не выбрано — все.');
		PROTOCOLS.forEach(function(p) { o.value(p[0], p[1]); });
		o.default = [ 'vless', 'ss', 'trojan', 'hysteria2', 'socks' ];
		o.modalonly = true;

		o = s.taboption('filtering', form.MultiValue, 'transports', 'Транспорты (VLESS/Trojan)',
			'XHTTP работает только с альтернативной сборкой podkop-engine. Ничего не выбрано — TCP, WS, gRPC.');
		TRANSPORTS.forEach(function(t) { o.value(t[0], t[1]); });
		o.default = [ 'tcp', 'ws', 'grpc' ];
		o.modalonly = true;

		o = s.taboption('filtering', form.Flag, 'exclude_russia', 'Без РФ',
			'Исключить серверы с флагом 🇷🇺 или словами «Россия», «Москва», Russia, Moscow, RU в названии.');
		o.default = '0';
		o.editable = true;

		o = s.taboption('filtering', form.Value, 'max_ping', 'Макс. пинг, мс',
			'Время TCP-соединения с роутера до сервера. Медленнее и недоступные исключаются. 0 или пусто — не проверять. Hysteria2 (UDP) не проверяется.');
		o.datatype = 'uinteger';
		o.placeholder = '0';
		o.modalonly = true;

		o = s.taboption('filtering', form.Value, 'include_regex', 'Только с названием',
			'Регулярное выражение по названию сервера, например <code>Европа|Нидерланды|🇳🇱</code>. Пусто — все.');
		o.modalonly = true;

		o = s.taboption('filtering', form.Value, 'exclude_regex', 'Исключить по названию',
			'Регулярное выражение, например <code>Обход|LTE</code>.');
		o.modalonly = true;

		o = s.taboption('filtering', form.Value, 'cut_marker', 'Маркер конца списка',
			'Серверы после записи с этим хостом отбрасываются.');
		o.placeholder = 'sss.ss';
		o.modalonly = true;

		o = s.taboption('filtering', form.DynamicList, 'exclude_hosts', 'Исключить хосты',
			'Заглушки и реклама. Пусто — 0.0.0.0 и 228.228.228.228.');
		o.placeholder = '0.0.0.0';
		o.datatype = 'host';
		o.modalonly = true;

		o = s.option(form.Button, '_preview', 'Проверка');
		o.inputtitle = 'Проверить';
		o.inputstyle = 'action';
		o.modalonly = false;
		o.editable = true;
		o.onclick = function(ev, id) {
			return runModal('Проверка подписки', [ 'preview', id ]);
		};

		o = s.option(form.Button, '_diag', ' ');
		o.inputtitle = 'Диагностика';
		o.inputstyle = 'neutral';
		o.modalonly = false;
		o.editable = true;
		o.onclick = function(ev, id) {
			return runModal('Диагностика подписки', [ 'diag', id ]);
		};

		// ручные ссылки
		s = m.section(form.TypedSection, 'manual', 'Ручные ссылки',
			'Всегда добавляются к серверам из подписок в выбранной секции.');
		s.addremove = true;
		s.anonymous = true;

		o = s.option(form.ListValue, 'section', 'Секция Podkop');
		addSections(o);
		o.rmempty = false;

		o = s.option(form.DynamicList, 'link', 'Ссылки');
		o.placeholder = 'vless://…';
		o.validate = function(id, v) {
			return !v || /^(vless|ss|trojan|hysteria2|hy2|socks[45a]*):\/\/\S+$/.test(v) ||
				'Поддерживаются vless://, ss://, trojan://, hysteria2://, socks://';
		};

		// настройки
		s = m.section(form.NamedSection, 'settings', 'settings', 'Настройки');

		o = s.option(form.Flag, 'enabled', 'Автообновление',
			'Раз в сутки подписки скачиваются заново. Podkop перезагружается, только если изменился состав серверов ' +
			'(порядок и названия не учитываются): при перезагрузке на несколько секунд рвутся все соединения через прокси.');
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.ListValue, 'update_hour', 'Время обновления');
		for (var h = 0; h < 24; h++)
			o.value(String(h), (h < 10 ? '0' : '') + h + ':00');
		o.default = '4';
		o.depends('enabled', '1');

		o = s.option(form.ListValue, 'check_interval', 'Проверка серверов',
			'Podkop (sing-box) проверяет серверы каждой секции. Если живых меньше порога, подписки этой секции ' +
			'обновляются внепланово, но не чаще раза в час.');
		o.value('0', 'не проверять');
		[ 5, 10, 15, 30, 60 ].forEach(function(n) { o.value(String(n), 'каждые ' + n + ' мин'); });
		o.default = '10';
		o.depends('enabled', '1');

		o = s.option(form.Value, 'min_alive', 'Порог живых серверов');
		o.datatype = 'range(1,50)';
		o.placeholder = '1';
		o.depends('enabled', '1');

		o = s.option(form.Value, 'device_model', 'Имя устройства',
			'Как роутер называется у провайдера. Пусто — «имя хоста (модель)». ' +
			'Задайте до первого обновления: провайдер может запомнить имя при регистрации.');
		o.placeholder = 'имя хоста (модель)';

		o = s.option(form.Value, 'hwid', 'HWID',
			'Идентификатор роутера у провайдера, занимает один слот устройства. ' +
			'Создаётся при первом обновлении. Если очистить или изменить, займётся новый слот.');
		o.placeholder = 'создаётся автоматически';

		o = s.option(form.Value, 'user_agent', 'User-Agent',
			'С sing-box/… провайдер отдаёт список ссылок. С другими значениями может прийти JSON или заглушки.');
		o.placeholder = 'sing-box/1.12.0';

		return m.render().then(L.bind(function(mapNode) {
			this.updateBtn = null;
			this.statusNode = E('div', {}, [ this.renderStatus(status) ]);
			poll.add(L.bind(this.refreshStatus, this), 5);

			var statusSection = E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, [ 'Состояние' ]),
				this.statusNode,
				E('div', { 'class': 'right' }, [
					E('button', {
						'class': 'btn cbi-button-action',
						'click': ui.createHandlerFn(this, 'handleUpdateNow')
					}, [ 'Обновить сейчас' ])
				])
			]);
			// состояние сразу под заголовком страницы, перед секциями формы
			mapNode.insertBefore(statusSection, mapNode.querySelector(':scope > .cbi-section'));
			return mapNode;
		}, this));
	}
});
