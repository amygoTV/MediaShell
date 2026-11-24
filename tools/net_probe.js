// v1.13.6 诊断：用 MediaShell 真实使用的 Electron net 模块复现各站点请求。
// Electron 的 net.request 与 Node 的 urllib 行为不同（证书处理、HTTP/2、代理继承），
// 这才是应用里 httpGet 的真实链路。
const { app, net } = require('electron');
const path = require('path');

const APIS = {
  '光速影视': 'https://api.guangsuapi.com/api.php/provide/vod/',
  '虎牙采集': 'https://www.huyaapi.com/api.php/provide/vod/',
  '虎牙HLS': 'https://www.huyaapi.com/api.php/provide/vod/from/hym3u8',
  '红牛影视': 'https://www.hongniuzy2.com/api.php/provide/vod/',
  '淘片采集': 'https://taopianapi.com/cjapi/mc/vod/json.html',
  '量子资源': 'https://lzizy1.com/api.php/provide/vod/',
  '闪电影视': 'http://sdzyapi.com/api.php/provide/vod/',
};

app.disableHardwareAcceleration();

function get(url, timeout) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const req = net.request({
      url, method: 'GET', redirect: 'follow',
      headers: { 'User-Agent': 'okhttp/3.15', 'Accept': 'application/json,text/plain,*/*' },
    });
    let buf = [], done = false;
    const fin = (o) => { if (!done) { done = true; resolve(o); } };
    req.on('response', (res) => {
      res.on('data', (c) => buf.push(c));
      res.on('end', () => {
        const body = Buffer.concat(buf).toString('utf8');
        fin({ ok: true, status: res.statusCode, ms: Date.now() - t0, len: body.length, body });
      });
      res.on('error', (e) => fin({ ok: false, err: String(e && e.message || e), ms: Date.now() - t0 }));
    });
    req.on('error', (e) => fin({ ok: false, err: String(e && e.message || e), ms: Date.now() - t0 }));
    // 注意：Electron 的 net.ClientRequest 没有 setTimeout 方法，用外部定时器 + abort
    const timer = setTimeout(() => { try { req.abort(); } catch (e) {} fin({ ok: false, err: 'TIMEOUT', ms: Date.now() - t0 }); }, timeout);
    req.on('close', () => clearTimeout(timer));
    req.end();
  });
}

app.whenReady().then(async () => {
  console.log('=== Electron net 模块实测（与 MediaShell httpGet 同链路）===');
  for (const [name, api] of Object.entries(APIS)) {
    const url = api + (api.includes('?') ? '&' : '?') + 'ac=videolist&pg=1';
    // 5s 超时，与 MediaShell 探测站点时的 5000ms 一致
    const r = await get(url, 12000);
    if (r.ok) {
      let info = '';
      try {
        const d = JSON.parse(r.body);
        const L = Array.isArray(d.list) ? d.list : [];
        info = `total=${d.total != null ? d.total : '-'} list=${L.length}` +
          (L[0] ? ` 首条="${String(L[0].vod_name).slice(0, 14)}"` : '');
      } catch (e) { info = '非JSON: ' + r.body.slice(0, 50); }
      console.log(`  ${name.padEnd(8)} [OK  ] http=${r.status} ${String(r.ms).padStart(5)}ms ${String(r.len).padStart(7)}B  ${info}`);
    } else {
      console.log(`  ${name.padEnd(8)} [FAIL] ${String(r.ms).padStart(5)}ms  ${r.err}`);
    }
  }
  setTimeout(() => { try { app.quit(); } catch (e) { process.exit(0); } }, 300);
});
