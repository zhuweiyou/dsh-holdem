const INSTALL_COMMAND = 'dsh plugin --profile desktop add dsh-holdem-p2p'

export interface JoinPageOptions {
  prefix: string
  code: string
  invite: string
  role: 'sit' | 'watch'
  shareable: boolean
}

export function joinPageHtml(options: JoinPageOptions): string {
  const target = `/?dsh-panel=holdem-p2p&code=${encodeURIComponent(options.code)}&invite=${encodeURIComponent(options.invite)}&role=${options.role}#/`
  const roleText = options.role === 'watch' ? '观战' : '入座'
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>加入德州扑克 · ${escapeHtml(options.code)}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    background: #101418; color: #e9ecf2; padding: 24px;
    background-image: radial-gradient(circle at 50% 0%, #17352c 0%, #101418 60%);
  }
  .card { width: min(460px, 100%); background: #181c22; border: 1px solid #2a313a; border-radius: 16px; padding: 24px; box-shadow: 0 24px 60px rgba(0,0,0,.45); }
  h1 { font-size: 19px; margin: 0 0 4px; }
  .meta { color: #93a0b1; font-size: 13px; margin-bottom: 18px; }
  .code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 26px; letter-spacing: 4px; color: #e8c15a; margin: 8px 0 18px; }
  ul { list-style: none; margin: 0 0 18px; padding: 0; }
  li { border: 1px solid #2a313a; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; background: #141a20; }
  li .title { font-weight: 600; }
  li .state { float: right; font-size: 12px; color: #93a0b1; }
  li[data-status="ok"] .state { color: #4cc38a; }
  li[data-status="missing"] .state { color: #e06c75; }
  a { color: #6fb3ff; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #0f1318; border: 1px solid #262d36; border-radius: 6px; padding: 2px 6px; font-size: 12px; }
  .cmd { display: flex; gap: 8px; align-items: center; margin-top: 6px; }
  .cmd code { flex: 1; min-width: 0; padding: 8px 10px; white-space: pre-wrap; overflow-wrap: anywhere; }
  button { font: inherit; border-radius: 10px; border: 1px solid transparent; padding: 10px 16px; cursor: pointer; }
  .primary { width: 100%; background: #2f9c76; color: #06130f; font-weight: 700; }
  .primary:disabled { opacity: .55; cursor: progress; }
  .ghost { background: transparent; color: #93a0b1; border-color: #2a313a; font-size: 12px; padding: 6px 10px; }
  .hint { color: #93a0b1; font-size: 12px; margin: 0 0 12px; }
  .error { color: #e06c75; font-size: 12px; margin: 0 0 12px; }
  .ok { color: #4cc38a; }
</style>
</head>
<body>
<div class="card">
  <h1>加入德州扑克牌桌</h1>
  <div class="meta">房主即服务端 · 点对点 · 娱乐筹码</div>
  <div class="code" id="code">${escapeHtml(options.code)}</div>
  <ul>
    <li data-status="pending" id="req-dsh">
      <span class="state" id="state-dsh">检测中…</span>
      <div class="title">1. DeepSeek Harness</div>
      <div class="meta">需要在本机运行 <code>dsh web</code>，并且用同一套 Harness 打开邀请。</div>
    </li>
    <li data-status="pending" id="req-plugin">
      <span class="state" id="state-plugin">检测中…</span>
      <div class="title">2. dsh-holdem-p2p 插件</div>
      <div class="meta">当前 Harness 还没装这个插件时，先执行：</div>
      <div class="cmd">
        <code id="install">${escapeHtml(INSTALL_COMMAND)}</code>
        <button class="ghost" type="button" id="copy">复制</button>
      </div>
    </li>
  </ul>
  <p class="hint" id="hint">准备以「${roleText}」身份进入房间。</p>
  <p class="error" id="error" hidden></p>
  <button class="primary" type="button" id="enter" disabled>正在检测环境…</button>
  <noscript><p class="error">这个加入页需要 JavaScript。</p></noscript>
</div>
<script>
(function () {
  var target = ${JSON.stringify(target)};
  var prefix = ${JSON.stringify(options.prefix)};
  var code = ${JSON.stringify(options.code)};
  var invite = ${JSON.stringify(options.invite)};
  var role = ${JSON.stringify(options.role)};
  var enter = document.getElementById('enter');
  var hint = document.getElementById('hint');
  var error = document.getElementById('error');
  var ready = false;

  function mark(id, ok, text) {
    var li = document.getElementById('req-' + id);
    var state = document.getElementById('state-' + id);
    li.setAttribute('data-status', ok ? 'ok' : 'missing');
    state.textContent = text;
  }

  function probeDsh() {
    return fetch('/', { credentials: 'same-origin', headers: { accept: 'text/html' } })
      .then(function (response) {
        if (!response.ok) return false;
        return response.text().then(function (html) {
          return html.indexOf('__DSH_BOOT__') >= 0 || html.indexOf('__ModuleLoader__') >= 0;
        });
      })
      .catch(function () { return false; });
  }

  function probePlugin() {
    return fetch(prefix + '/api/ready', { credentials: 'same-origin' })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (body) { return !!body && body.ok === true && body.plugin === 'dsh-holdem-p2p'; })
      .catch(function () { return false; });
  }

  function preview() {
    return fetch(prefix + '/api/preview?code=' + encodeURIComponent(code) + '&invite=' + encodeURIComponent(invite) + '&role=' + encodeURIComponent(role), { credentials: 'same-origin' })
      .then(function (response) { return response.ok ? response.json() : null; })
      .catch(function () { return null; });
  }

  Promise.all([probeDsh(), probePlugin()]).then(function (results) {
    var dsh = results[0];
    var plugin = results[1];
    mark('dsh', dsh, dsh ? '已就绪' : '未检测到');
    mark('plugin', plugin, plugin ? '已就绪' : '未安装');
    ready = dsh && plugin;
    if (ready) {
      enter.disabled = false;
      enter.textContent = '进入牌桌';
      return preview().then(function (room) {
        if (!room) { hint.textContent = '房间可能已解散，请向房主要一个新链接。'; return; }
        hint.innerHTML = '房间「' + room.title + '」· ' + room.seated + '/' + room.settings.blindLevel + ' · ' + room.phase;
      });
    }
    enter.disabled = false;
    enter.textContent = '我已完成安装';
    if (!dsh) {
      error.hidden = false;
      error.textContent = '没有检测到 DeepSeek Harness。请先安装并运行 dsh web，再用它打开这个链接。';
    } else if (!plugin) {
      error.hidden = false;
      error.textContent = '当前 Harness 没有安装 dsh-holdem-p2p。装完后重启 dsh web，再点下方按钮。';
    }
  });

  document.getElementById('copy').addEventListener('click', function () {
    if (navigator.clipboard) navigator.clipboard.writeText(${JSON.stringify(INSTALL_COMMAND)});
  });

  enter.addEventListener('click', function () {
    if (!ready) { location.reload(); return; }
    enter.disabled = true;
    enter.textContent = '正在进入…';
    location.replace(target);
  });
})();
</script>
</body>
</html>`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char] ?? char)
}
