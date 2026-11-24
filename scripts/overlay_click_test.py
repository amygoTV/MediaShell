#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v1.13.7 诊断：对 MediaShell 直播页右下角浮层做**真实物理鼠标点击**。

为什么必须用真实点击：
  Electron 的 sendInputEvent 是进程内注入，绕过 Windows 窗口命中测试；
  而「按钮点不动」这类症状恰恰出在命中测试上（窗口是否接收真实鼠标输入）。
  所以这里用 Win32 SetCursorPos + mouse_event 做物理点击。

用法：
  python scripts/overlay_click_test.py <overlay_hwnd> <btn_x> <btn_y>
  其中 btn_x/btn_y 是**屏幕绝对坐标**（浮层内容区内的按钮中心）。
"""
import ctypes
import ctypes.wintypes as w
import sys
import time

u = ctypes.windll.user32

MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_ABSOLUTE = 0x8000
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004


def window_at_point(x, y):
    """命中测试：屏幕坐标处最顶层的窗口 hwnd。"""
    h = u.WindowFromPoint(w.POINT(int(x), int(y)))
    return h


def window_text(h):
    n = u.GetWindowTextLengthW(h)
    b = ctypes.create_unicode_buffer(n + 1)
    u.GetWindowTextW(h, b, n + 1)
    return b.value


def window_class(h):
    b = ctypes.create_unicode_buffer(256)
    u.GetClassNameW(h, b, 256)
    return b.value


def window_rect(h):
    r = w.RECT()
    u.GetWindowRect(h, ctypes.byref(r))
    return (r.left, r.top, r.right, r.bottom)


def is_ignoring_mouse(h):
    """WS_EX_TRANSPARENT(0x20) 会让窗口不参与命中测试。"""
    GWL_EXSTYLE = -20
    ex = u.GetWindowLongW(h, GWL_EXSTYLE)
    return bool(ex & 0x20)


def is_no_activate(h):
    """WS_EX_NOACTIVATE(0x08000000) —— Electron focusable:false 会带这个。"""
    GWL_EXSTYLE = -20
    ex = u.GetWindowLongW(h, GWL_EXSTYLE)
    return bool(ex & 0x08000000)


def click(x, y):
    u.SetCursorPos(int(x), int(y))
    time.sleep(0.25)
    u.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
    time.sleep(0.08)
    u.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
    time.sleep(0.25)


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        return 2
    overlay_hwnd = int(sys.argv[1])
    bx = int(sys.argv[2])
    by = int(sys.argv[3])

    print('=== 浮层真实点击诊断 ===')
    print('浮层 hwnd      :', overlay_hwnd)
    print('浮层 rect      :', window_rect(overlay_hwnd))
    print('浮层 class     :', window_class(overlay_hwnd))
    print('浮层 标题      :', repr(window_text(overlay_hwnd)))
    print('WS_EX_TRANSPARENT(不参与命中):', is_ignoring_mouse(overlay_hwnd))
    print('WS_EX_NOACTIVATE(不可聚焦) :', is_no_activate(overlay_hwnd))

    top = window_at_point(bx, by)
    print('')
    print('点击坐标        : (%d, %d)' % (bx, by))
    print('该点命中窗口    : hwnd=%d class=%r title=%r' % (top, window_class(top), window_text(top)[:40]))
    print('命中的是浮层吗  :', '✅ 是' if top == overlay_hwnd else '❌ 不是（被别的窗口挡住）')

    # 枚举该点附近的所有顶层窗口，看谁压在上面
    print('')
    print('--- 命中点处的窗口链（自顶向下）---')
    h = top
    depth = 0
    while h and depth < 8:
        print('  z%d hwnd=%-10d class=%-26r rect=%s' % (depth, h, window_class(h)[:26], window_rect(h)))
        h = u.GetWindow(h, 2)  # GW_HWNDPREV = 3? 用 GetParent 之外的方式，改用 GetTopWindowOfGroup
        # GetWindow(h, GW_HWNDPREV=3)
        break

    print('')
    print('--- 执行真实点击 ---')
    click(bx, by)
    print('已点击。请观察应用是否响应（全屏 / 小窗）。')


if __name__ == '__main__':
    sys.exit(main())
