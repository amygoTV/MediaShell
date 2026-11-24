// v1.13.7：用 CDP 驱动真实 MediaShell 做端到端验证。
// 流程：进直播页 → 触发内嵌播放 → 读 live-overlay-info → 输出浮层状态。
// 用法：node tools/cdp_drive.js <cdpPort>
const http = require('http');

const PORT = parseInt(process.argv[2] || '9222', 10);

function httpJson(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
      let b = '';
      res.on('data', (c) => b += c);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function findMainTarget() {
  for (let i = 0; i < 30; i++) {
    try {
      const list = await httpJson('/json/list');
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl && !/devtools/i.test(t.url || ''));
      if (page) return page;
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 700));
  }
  throw new Error('未找到主窗口 CDP target');
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.ready = new Promise((res, rej) => {
      this.ws.addEventListener('open', () => res());
      this.ws.addEventListener('error', (e) => rej(new Error('WS 错误')));
    });
    this.ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }
  send(method, params) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(method + ' 超时')); } }, 30000);
    });
  }
  async evalJs(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true, userGesture: true,
    });
    if (r.exceptionDetails) throw new Error('JS 异常: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
    return r.result ? r.result.value : undefined;
  }
}

(async () => {
  const target = await findMainTarget();
  console.log('CDP target:', target.url);
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.ready;
  console.log('WS 已连接');

  // 1) 进直播页
  await cdp.evalJs(`(() => { const b=document.querySelector('.tab[data-view="live"]'); if(b){b.click(); return 'clicked live tab';} return 'no live tab'; })()`);
  await new Promise((r) => setTimeout(r, 2500));
  console.log('当前视图:', await cdp.evalJs(`(document.querySelector('.tab.active')||{}).dataset ? document.querySelector('.tab.active').dataset.view : '?'`));

  // 2) 触发内嵌播放（直接调内部函数，走 live-embed 全链路）
  const playRes = await cdp.evalJs(`(async () => {
    try {
      const ch = liveState.channels && liveState.channels[0];
      if (!ch) return 'no channels: ' + JSON.stringify({n: liveState.channels && liveState.channels.length, err: liveState.dataErr || ''});
      livePlayChannel(ch, 0);
      return 'play invoked: ' + ch.name;
    } catch (e) { return 'ERR ' + e.message; }
  })()`);
  console.log('播放触发:', playRes);
  await new Promise((r) => setTimeout(r, 6000));

  // 3) 读浮层状态
  const info = await cdp.evalJs(`(async () => {
    const r = await MS.liveOverlayInfo();
    return JSON.stringify(r);
  })()`);
  console.log('\n=== live-overlay-info ===');
  console.log(info);
  const parsed = JSON.parse(info);
  if (parsed.exists) {
    const b = parsed.bounds;
    console.log('\n浮层屏幕坐标:', JSON.stringify(b));
    console.log('按钮屏幕坐标(浮层内 btnFull 中心):', Math.round(b.x + 26 + 75/2), Math.round(b.y + 8 + 34/2));
  }
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
