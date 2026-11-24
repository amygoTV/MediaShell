// v1.13.7 诊断 2：真实鼠标点击能否命中浮层按钮。
// 对比 focusable:false 与 focusable:true 两种浮层参数下的真实点击结果。
// 用 Electron 的 webContents.sendInputEvent 模拟真实鼠标事件（走渲染进程输入管线）。
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const APP_DIR = path.join(__dirname, '..');
const OVERLAY_W = 196, OVERLAY_H = 50, OVERLAY_MARGIN = 12;

let main = null, carrier = null, overlay = null;
let mainGot = null;
ipcMain.on('live-overlay-action', (_e, action) => { mainGot = action; });

app.disableHardwareAcceleration();

function makeOverlay(focusable) {
  const o = new BrowserWindow({
    width: OVERLAY_W, height: OVERLAY_H,
    frame: false, transparent: true, backgroundColor: '#00000000',
    show: false, skipTaskbar: true, hasShadow: false,
    resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, focusable: focusable, roundedCorners: false,
    parent: main,
    webPreferences: { contextIsolation: false, nodeIntegration: true, backgroundThrottling: false },
  });
  o.setAlwaysOnTop(true, 'screen-float');
  o.loadFile(path.join(APP_DIR, 'overlay.html'));
  return o;
}

// 在浮层页面里装一个「真实指针事件」监听器，验证鼠标事件是否落到按钮上
async function armPointerProbe(o) {
  await o.webContents.executeJavaScript(`
    window.__pointer = { mousedown:0, mouseup:0, click:0, lastTarget:'' };
    document.addEventListener('mousedown', e => { window.__pointer.mousedown++; window.__pointer.lastTarget = e.target && e.target.id; }, true);
    document.addEventListener('mouseup',   e => { window.__pointer.mouseup++; }, true);
    document.addEventListener('click',     e => { window.__pointer.click++;   window.__pointer.lastTarget = e.target && e.target.id; }, true);
    'armed'
  `);
}

// 用 sendInputEvent 发真实鼠标按下/抬起（坐标相对浮层内容区）
async function realClickAt(o, x, y) {
  const base = { x: Math.round(x), y: Math.round(y) };
  o.webContents.sendInputEvent({ type: 'mouseMove', ...base });
  await new Promise(r => setTimeout(r, 120));
  o.webContents.sendInputEvent({ type: 'mouseDown', ...base, button: 'left', clickCount: 1 });
  await new Promise(r => setTimeout(r, 80));
  o.webContents.sendInputEvent({ type: 'mouseUp', ...base, button: 'left', clickCount: 1 });
  await new Promise(r => setTimeout(r, 400));
}

app.whenReady().then(async () => {
  try {
    main = new BrowserWindow({
      width: 1360, height: 860, show: true, frame: false, backgroundColor: '#0d0f14',
      skipTaskbar: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    main.loadURL('data:text/html,<body>main</body>');
    await new Promise(r => setTimeout(r, 500));

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

    console.log('=== 真实鼠标点击对比测试 ===');
    for (const focusable of [false, true]) {
      if (overlay && !overlay.isDestroyed()) overlay.destroy();
      overlay = makeOverlay(focusable);
      const expX = Math.round(cb.x + stage.relX) + Math.round(stage.width) - OVERLAY_W - OVERLAY_MARGIN;
      const expY = Math.round(cb.y + stage.relY) + Math.round(stage.height) - OVERLAY_H - OVERLAY_MARGIN;
      overlay.setBounds({ x: expX, y: expY, width: OVERLAY_W, height: OVERLAY_H });
      overlay.showInactive();
      await new Promise(r => setTimeout(r, 1200));
      await armPointerProbe(overlay);

      // 按钮位置（相对浮层内容区）：btnFull 在 x=26,y=8,w=75,h=34
      const rect = await overlay.webContents.executeJavaScript(`
        var b=document.getElementById('btnFull'); var r=b.getBoundingClientRect();
        JSON.stringify({x:r.x+r.width/2, y:r.y+r.height/2});
      `);
      const p = JSON.parse(rect);

      mainGot = null;
      await realClickAt(overlay, p.x, p.y);

      const ptr = JSON.parse(await overlay.webContents.executeJavaScript('JSON.stringify(window.__pointer)'));
      console.log(`  focusable=${String(focusable).padEnd(5)} → 指针事件 ${JSON.stringify(ptr)} | 主进程收到: ${mainGot === null ? '❌ 无' : '✅ ' + mainGot}`);
    }
    console.log('');
    console.log('  说明：focusable=false 若指针事件为 0 → 真实鼠标点不到浮层按钮（就是「按钮无效」的根因）');
  } catch (e) {
    console.log('诊断异常:', e && e.stack || e);
  }
  setTimeout(() => { try { app.quit(); } catch (e) { process.exit(0); } }, 500);
});
