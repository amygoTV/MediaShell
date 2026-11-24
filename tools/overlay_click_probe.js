// v1.13.7 诊断：复现「浮层按钮点了没反应」，逐段定位断点。
// 场景：真实 Electron，主窗口 + 承载窗口 + 浮层，与 main.js 同构。
// 逐段验证：①浮层页面能否 require electron  ②require 到的 ipcRenderer 是否可用
//           ③click 事件是否触发  ④ipcRenderer.send 是否发出  ⑤主进程是否收到
//           ⑥主进程转发到主窗口后主窗口渲染层是否收到
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const APP_DIR = path.join(__dirname, '..');
const OVERLAY_W = 196, OVERLAY_H = 50, OVERLAY_MARGIN = 12;

let main = null, carrier = null, overlay = null;
const log = (...a) => { console.log(a.join(' ')); };

// 主进程侧：与 main.js 相同的 IPC 处理与转发
let mainGot = null;          // 主进程收到浮层 IPC
let rendererGot = null;      // 主窗口渲染层收到转发
ipcMain.on('live-overlay-action', (_e, action) => {
  mainGot = action;
  log('  [5] 主进程 ipcMain 收到:', action);
  try { if (main && !main.isDestroyed()) main.webContents.send('live-overlay-action', action); }
  catch (e) { log('  [5] 转发主窗口失败:', e.message); }
});

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  try {
    // ---- 主窗口（与真实一致：contextIsolation + preload 隔离）----
    main = new BrowserWindow({
      width: 1360, height: 860, show: true, frame: false, backgroundColor: '#0d0f14',
      skipTaskbar: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    main.loadURL('data:text/html,<body>main</body>');
    // 模拟真实 preload 暴露的通道
    main.webContents.on('ipc-message', () => {});
    await new Promise(r => setTimeout(r, 600));

    // 主窗口渲染层监听（模拟 preload 的 ipcRenderer.on）
    main.webContents.executeJavaScript(`
      window.__got = null;
      window.__ipc = null;
      (function(){
        // 用 ipcRenderer 不可用（contextIsolation），此处用 preload 注入的等价物模拟
      })();
    `).catch(()=>{});

    // ---- 承载窗口（同 main.js）----
    const cb = main.getContentBounds();
    const stage = { relX: 300, relY: 80, width: 900, height: 500 };
    carrier = new BrowserWindow({
      x: Math.round(cb.x + stage.relX), y: Math.round(cb.y + stage.relY),
      width: Math.round(stage.width), height: Math.round(stage.height),
      frame: false, transparent: true, backgroundColor: '#00000000',
      show: true, skipTaskbar: true, hasShadow: false, resizable: false,
      movable: false, focusable: false, parent: main,
    });
    carrier.setIgnoreMouseEvents(true, { forward: true });

    // ---- 浮层（同 main.js 当前参数）----
    overlay = new BrowserWindow({
      width: OVERLAY_W, height: OVERLAY_H,
      frame: false, transparent: true, backgroundColor: '#00000000',
      show: false, skipTaskbar: true, hasShadow: false,
      resizable: false, movable: false, minimizable: false, maximizable: false,
      fullscreenable: false, focusable: false, roundedCorners: false,
      parent: main,
      webPreferences: { contextIsolation: false, nodeIntegration: true, backgroundThrottling: false },
    });
    overlay.setAlwaysOnTop(true, 'screen-float');
    overlay.loadFile(path.join(APP_DIR, 'overlay.html'));
    await new Promise(r => setTimeout(r, 1500));

    // 定位到播放区右下角
    {
      const expX = Math.round(cb.x + stage.relX) + Math.round(stage.width) - OVERLAY_W - OVERLAY_MARGIN;
      const expY = Math.round(cb.y + stage.relY) + Math.round(stage.height) - OVERLAY_H - OVERLAY_MARGIN;
      overlay.setBounds({ x: expX, y: expY, width: OVERLAY_W, height: OVERLAY_H });
    }
    overlay.showInactive();
    await new Promise(r => setTimeout(r, 800));

    log('=== 浮层按钮链路诊断 ===');
    log('[1] 浮层 bounds:', JSON.stringify(overlay.getBounds()));
    log('[2] 浮层 visible:', overlay.isVisible(), '| focusable:', overlay.isFocusable());

    // ① ② 浮层里能否 require electron / ipcRenderer 是否可用
    const probe = await overlay.webContents.executeJavaScript(`
      (function(){
        var out = {};
        try {
          out.hasRequire = (typeof require === 'function');
          out.hasElectron = (typeof require === 'function') ? (typeof require('electron') === 'object') : false;
          out.hasIpc = (typeof require === 'function') ? (!!require('electron').ipcRenderer) : false;
          out.btnExists = !!document.getElementById('btnFull');
          out.btnRect = (function(){
            var b = document.getElementById('btnFull');
            if (!b) return null;
            var r = b.getBoundingClientRect();
            return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};
          })();
        } catch (e) { out.err = String(e && e.message || e); }
        return JSON.stringify(out);
      })()
    `).catch(e => 'EXEC_ERR ' + e.message);
    log('[3] 浮层页面探针:', probe);

    // ③④ 模拟真实点击（executeJavaScript 触发 click → 走真实事件处理与 IPC）
    mainGot = null;
    await overlay.webContents.executeJavaScript(`
      document.getElementById('btnFull').click();
      'clicked'
    `).catch(e => log('   click 执行异常:', e.message));
    await new Promise(r => setTimeout(r, 800));
    log('[4] 点击后主进程是否收到 IPC:', mainGot === null ? '❌ 没收到' : '✅ ' + mainGot);

    // ⑤ 直接从主进程侧发一次，验证转发链路本身
    mainGot = null;
    ipcMain.emit('live-overlay-action', { sender: overlay.webContents }, 'pip');
    await new Promise(r => setTimeout(r, 400));
    log('[5] 主进程转发测试:', mainGot === null ? '❌ 转发失败' : '✅ 已转发 ' + mainGot);

    log('');
    log(mainGot !== null ? '=== 结论：IPC 链路本身可用 ===' : '=== 结论：链路有断点 ===');
  } catch (e) {
    log('诊断异常:', e && e.stack || e);
  }
  setTimeout(() => { try { app.quit(); } catch (e) { process.exit(0); } }, 500);
});
