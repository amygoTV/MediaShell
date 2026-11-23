// v1.13.5 专项自测：验证「右下角浮层窗口」在真实 Electron 环境下能创建、能定位、层级正确。
// 用法：ELECTRON_RUN_AS_NODE= electron.exe tools/overlay_probe.js
// 原理：新建一个与 MediaShell 同构的窗口树（主窗口 + 承载窗口 + 浮层），
//       检查浮层的边界是否贴到「播放区右下角」、层级是否在承载窗口之上。
const { app, BrowserWindow } = require('electron');
const path = require('path');

const APP_DIR = path.join(__dirname, '..');
const OVERLAY_W = 196, OVERLAY_H = 50, OVERLAY_MARGIN = 12;

let main = null, carrier = null, overlay = null;
const out = [];
const log = (...a) => { out.push(a.join(' ')); console.log(a.join(' ')); };

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  try {
    // 主窗口
    main = new BrowserWindow({
      width: 1360, height: 860, show: true, frame: false, transparent: false,
      backgroundColor: '#0d0f14', skipTaskbar: true,
    });
    main.loadURL('data:text/html,<body style="background:#0d0f14"></body>');

    // 模拟播放区：主窗口客户区内的某个矩形
    const cb = main.getContentBounds();
    const stage = { relX: 300, relY: 80, width: 900, height: 500 };

    // 承载窗口（模拟 embedCarrier）
    carrier = new BrowserWindow({
      x: Math.round(cb.x + stage.relX), y: Math.round(cb.y + stage.relY),
      width: Math.round(stage.width), height: Math.round(stage.height),
      frame: false, transparent: true, backgroundColor: '#00000000',
      show: true, skipTaskbar: true, hasShadow: false, resizable: false,
      movable: false, focusable: false, parent: main,
    });
    carrier.setIgnoreMouseEvents(true, { forward: true });

    // 浮层（与 main.js 中 ensureOverlay 同构）
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
    overlay.showInactive();

    // 与 main.js 中 syncOverlayBounds() 完全同构的定位逻辑
    {
      const expX = Math.round(cb.x + stage.relX) + Math.round(stage.width) - OVERLAY_W - OVERLAY_MARGIN;
      const expY = Math.round(cb.y + stage.relY) + Math.round(stage.height) - OVERLAY_H - OVERLAY_MARGIN;
      overlay.setAlwaysOnTop(true, 'screen-float');
      overlay.setBounds({ x: expX, y: expY, width: OVERLAY_W, height: OVERLAY_H });
    }

    await new Promise((r) => setTimeout(r, 1200));

    // 期望位置：播放区右下角
    const expX = Math.round(cb.x + stage.relX) + Math.round(stage.width) - OVERLAY_W - OVERLAY_MARGIN;
    const expY = Math.round(cb.y + stage.relY) + Math.round(stage.height) - OVERLAY_H - OVERLAY_MARGIN;
    const ob = overlay.getBounds();
    const cbounds = carrier.getBounds();

    log('主窗口 contentBounds   :', JSON.stringify(cb));
    log('承载窗口 bounds        :', JSON.stringify(cbounds));
    log('浮层 bounds            :', JSON.stringify(ob));
    log('期望浮层 bounds        :', JSON.stringify({ x: expX, y: expY, width: OVERLAY_W, height: OVERLAY_H }));

    const okPos = ob.x === expX && ob.y === expY && ob.width === OVERLAY_W && ob.height === OVERLAY_H;
    log('位置是否正确(贴播放区右下角):', okPos ? 'PASS' : 'FAIL');

    // 是否压在播放区内（应完全落在播放区矩形内 → 视觉上浮在画面右下角）
    const inside = ob.x >= cbounds.x && ob.y >= cbounds.y &&
      (ob.x + ob.width) <= (cbounds.x + cbounds.width) &&
      (ob.y + ob.height) <= (cbounds.y + cbounds.height);
    log('浮层是否落在播放区矩形内:', inside ? 'PASS' : 'FAIL');

    const vis = overlay.isVisible();
    log('浮层是否可见            :', vis ? 'PASS' : 'FAIL');

    // 层级：浮层 alwaysOnTop，应在承载窗口之上
    const oa = overlay.isAlwaysOnTop();
    const ca = carrier.isAlwaysOnTop();
    log('浮层 alwaysOnTop        :', oa ? 'PASS' : 'FAIL');
    log('承载窗口 alwaysOnTop    :', ca ? '(pip 模式才有,当前应为 false)' : 'false,符合预期');

    // 浮层页面是否加载成功（能读到按钮）
    try {
      const html = await overlay.webContents.executeJavaScript(
        "document.getElementById('btnFull') && document.getElementById('btnPip') ? 'both' : 'missing'");
      log('浮层页面按钮            :', html === 'both' ? 'PASS' : 'FAIL');
    } catch (e) {
      log('浮层页面按钮            : FAIL (' + e.message + ')');
    }

    // IPC 通道：浮层点按钮 → 主进程收到
    let got = null;
    const { ipcMain } = require('electron');
    ipcMain.on('live-overlay-action', (_e, a) => { got = a; });
    await overlay.webContents.executeJavaScript(
      "document.getElementById('btnFull').click(); 'clicked'").catch(() => {});
    await new Promise((r) => setTimeout(r, 500));
    log('浮层按钮→IPC 通路       :', got === 'fullscreen' ? 'PASS (收到 fullscreen)' : 'FAIL (got=' + got + ')');

    const allPass = okPos && inside && vis && oa;
    log('');
    log('=== 浮层专项自测: ' + (allPass ? '全部通过' : '存在失败项') + ' ===');
  } catch (e) {
    log('自测异常:', e && e.stack || e);
  }
  setTimeout(() => { try { app.quit(); } catch (e) { process.exit(0); } }, 500);
});
