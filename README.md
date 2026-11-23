# 影视舱 MediaShell

一个适合**电脑大屏观看**的影视资源桌面壳软件，基于 Electron + 原生 JS 实现，内置本仓库的影视仓/电视直播配置，开箱即用。

## 版本

### v1.13.4
- **修复「资源点进去跟海报对不上」**：详情接口参数用错了——苹果CMS 查详情的标准参数是 `ids`，旧代码传的是 `id`，站点会**直接忽略该参数**、返回首页最新 20~30 条，于是取 `list[0]` 拿到的是完全不相干的第一条（实测搜索「仙侠」5 条，点进去全部显示「代考风暴」）。改为主用 `ids`、回退 `id`，并**校验返回的 `vod_id` 与请求一致**；详情确实取不到时明确提示「详情加载失败」，不再拿首页数据冒充。该修复同时作用于首页/分类/搜索所有入口。
- 实测修复前后：旧逻辑正确率 0/5，新逻辑 5/5。
- `smoke_test.js` 新增 2 条断言（详情用 ids + id 一致性校验 / 失败不冒充），共 **44/44** 通过。

### v1.13.3
- **修复「搜索找不到资源」**：旧版只搜当前选中站点，默认站（api.guangsuapi.com）整站返回空时就显示「没有找到」，而其它站其实有结果也不去搜。改为**在所有可用 CMS 站并发搜索**（当前站优先、按 api 去重、逐站超时 8s、整体 12s 上限），汇总去重后展示，每条结果记住来源站，点海报用对应站打开详情。实测「仙侠」：光速/虎牙空、红牛 5 条、淘片 2 条，新版能全部汇总出来。
- **直播「全屏 / 小窗」按钮真正移到播放区下方**：`style.css` 里旧的 `.live-tools{position:absolute;top:14px}` 规则覆盖了文档流布局，把按钮拽回被 mpv 窗口遮住的右上角；删除该冲突规则。
- `smoke_test.js` 新增 3 条断言（多站搜索 / 来源站打开 / 直播工具栏无 absolute 覆盖），共 **42/42** 通过。

### v1.13.2
- **修复点播播放器初始化失败**（`option.contextmenu.0.html require 'string' or 'Element' type`）：v1.13.0 加右键菜单时只传了 `name`，而 ArtPlayer 的 contextmenu schema 要求 `html`（string|Element）必填，`name` 只是可选显示名——构造函数在 option 校验阶段直接抛错，导致点播完全起不来。改为传 `html: '打开系统播放器'`。
- **点播「全屏 / 小窗」按钮移到播放区下方**：从顶栏 `player-actions` 移到播放区下方的独立工具栏（`.player-tools`），与直播页布局一致，避免和 ArtPlayer 自带控制栏的全屏按钮重叠。绑定不变。
- `smoke_test.js` 新增 contextmenu 合法性与按钮位置断言，共 **39/39** 通过。

### v1.13.1
- **修复直播页「全屏 / 小窗」按钮消失**：v1.12 做 mpv 内嵌时把播放区内的按钮全移走（原生 mpv 子窗口会盖住区内 DOM），但区外没补回来——`bindLiveControls()` 绑定的 `#btnLiveFullscreen`/`#btnLivePiP` 在 HTML 里根本不存在，等于绑了个空气。本次在播放区**下方**（区外、不会被原生窗口盖住）新增一行工具栏放这两个按钮。
- **小窗改成真正的画中画**：内嵌 mpv 下 `#liveVideo` 是隐藏的、没在播，HTML video PiP 用不了。改为主进程把 mpv 的**承载窗口置顶 + 缩到屏幕右下角**（480×270），mpv 子窗口跟着缩放、画面连续不重启；再点「小窗」还原。小窗期间暂停播放区坐标同步，避免主窗口移动把小窗拉回；全屏时若在小窗模式会先自动还原。
- `smoke_test.js` 新增小窗用例，共 **37/37** 通过；store 11/11。

### v1.13.0
- **点播播放器换成 ArtPlayer 5.4（参考 TVBox Desktop 的内置播放器）**：原生 `<video>` + 自写控制条改为 ArtPlayer，获得完整控制栏（播放/进度/时间/音量/网页全屏/全屏）+ 设置菜单（倍速/画面比例/翻转）+ 快捷键（空格暂停、方向键快进/音量）+ 右键菜单（含「打开系统播放器」）。弹幕层、选集切换、观看进度写历史、右上角系统播放器按钮全部保留；旧自写控制条隐藏但代码保留可回退。新增依赖 `vendor/artplayer.min.js`（134KB，本地打包不依赖 CDN）。
- **HLS 加载优化（移植 TVBox `makeM3u8Loader`）**：`abrEwmaDefaultEstimate=4e6`（多档源不再从最低码率起播糊好几秒）；`MANIFEST_PARSED` 时按 `height*1e6+bitrate` 手动选最高档，起播即高清；fatal 错误分级恢复（网络错误 `startLoad()`、媒体错误 `recoverMediaError()`，限 2 次）；`xhrSetup` 注入 Referer 应对采集站防盗链。保留原有「大缓冲抗抖动」（maxBufferLength 24 / maxMaxBufferLength 60）。
- **直播线路体检增强（TVBox `live-health` 思路）**：探测结果按 URL 缓存 6 小时（`ms_live_health_v1`）；点频道时若该频道无新鲜缓存，只现场探这一条频道的几条线路（懒体检）而非全量；启动失败自动切下一条可用线路（标记坏线 → 按 good 优先递归重试），全部失败才停留错误提示。「检测线路」按钮仍强制全量重探。
- **直播 mpv 内嵌播放链路未改动**：FLV/TS 仍需 mpv 硬解，ArtPlayer 只用于点播，不碰 `--wid` 内嵌承载窗口。
- `smoke_test.js` 新增 5 个用例，共 **36/36** 通过。

### v1.12.0
- **直播画面内嵌到壳内播放区，不再弹出 mpv 独立窗口**：改用 mpv 的 `--wid=<HWND>` 把视频窗口挂成 Electron 原生子窗口，承载窗口尺寸/位置与播放区实时对齐（跟随主窗口移动、缩放、最大化）。实现要点：
  - **承载窗口必须 `transparent: true` 且绝不能 `loadURL`**。一旦加载任何页面，Chromium 会在承载窗口里创建 `Chrome_RenderWidgetHostHWND` 渲染层，它会盖住 mpv 的原生子窗口 → 播放区全黑。用 4 变体并行对照（A 普通 / B 透明+about:blank / C 透明+不加载 / D 离屏）实测确认：**只有「透明 + 不加载任何 URL」能让 mpv 视频窗口直接可见**。
  - **坐标系修正**：`getBoundingClientRect()` 返回的是相对**客户区**的 CSS 像素，而窗口坐标原点在边框左上角 —— 原用 `getBounds()` 导致整体偏移一个标题栏（实测 x=8 / y=31），改为 `getContentBounds()` 后画面精确贴合播放区。
  - **鼠标穿透**：承载窗口 `setIgnoreMouseEvents(true, {forward:true})`，点击落到主窗口渲染层，再通过 mpv IPC 管道（`--input-ipc-server`）转发 `pause` / `fullscreen` 等命令，单击暂停、双击全屏照常可用。
  - **状态条移到播放区外**：原生承载窗口会盖住播放区内所有 DOM，因此播放状态提示改放到区外一行（「▶ 播放中 · mpv 硬解内嵌」/「⏸ 已暂停」），暂停瞬间的画面文字提示交给 mpv 自己的 OSD（`show-text`）。
  - **状态双向同步**：壳内每 1.5s 通过 IPC `get_property` 读 mpv 的真实 `fullscreen` / `pause`，用户按 ESC 退全屏后状态条立刻跟着变，不会误导。
  - **键位自定义**：改用 `--input-conf` 保留 mpv 内置键位（ESC 退出全屏、空格暂停），同时禁掉 `q`/`Q` 直接退出进程（避免误关整条直播），并让 `MBTN_LEFT_DBL` 切换全屏。
- **硬解与格式支持不变**：仍走 mpv `--hwdec=auto-safe --vo=gpu`（实测 d3d11va 硬解生效），FLV / TS 等 Chromium 解不了的格式照常可播；VLC / PotPlayer 不支持 `--wid`，自动回退到独立窗口。
- **单实例与退出清理**：切台/换线先关掉旧的承载窗口与 mpv 进程（`taskkill /T /F`），退出应用不残留后台声音。
- **排障能力**：mpv 每次启动写一份带时间戳的日志（`%TEMP%\MediaShell\mpv-embed-*.log`，只保留最近 5 份）+ 参数摘要（`mpv-embed-index.log`）；新增 `live-embed-info` 接口可查承载窗口句柄与位置。注意日志必须落纯 ASCII 路径 —— mpv 用 ANSI 文件 API，路径含中文会静默失败。
- `smoke_test.js` 新增 5 个内嵌播放用例（播放区几何采集 / 状态条 / OSD 反馈 / 双击全屏恢复播放），共 **31/31** 通过。

### v1.9.5
- **修复选线算法**：`pickBestLine` 原纯按响应速度排序，导致 sites=1 的空壳垂直线路（短剧/课堂/赛事，体积小、CDN 命中快 ~180ms）总比主线路（~280ms）快而被选中 → 站点列表几乎为空、直播源指向失效的 `PlatformLive.txt`/旧 TXT → 表现为「多仓解析混乱 + 直播无法播放」。改为**质量优先**：站点数降序 → 有效直播源（非 PlatformLive 的 m3u/txt）降序 → 速度升序。实测连续 3 轮稳定选中 sites=107 的摸鱼儿主线路。
- `smoke_test.js` 测试框架改为串行（共享 mock 不再互相覆盖），新增 2 个选线用例，共 **17/17**。

### v1.9.4
- **修复 M3U 直播源同名频道拆成多条**：订阅直播源现为 `TVLives_v2.m3u`，一个 `#EXTINF` 后跟多条 URL（同频道多线路）。原 `parseM3U` 每遇一条 URL 就新建一个 item，导致 CCTV-1 变成 4 个同名频道、左下角无法切换线路、超时切流失效。重写 `parseM3U`：连续 URL 归到同一频道的多线路、按 `group-title` 分组（央视/卫视/港澳台/影视轮播/体育）、容错上游字节截断造成的畸形组名。实测 187 频道/389 线路/5 组，同名频道合并恢复正常，左下角切线和超时自动换线恢复生效。

### v1.9.3
- **支持影视仓多级索引订阅**：导入 `zheteng.json` 等主索引不再报「配置中没有 sites」。影视仓配置是三级结构（`storeHouse` 多仓 → `urls` 多线路 → 末级 `api.json` 含 sites），原壳只认顶层 sites。新增 `expandSubscription()` 逐级展开：多仓取首个可达仓库、多线路并发测速选最快可用线路（避免合并 500+ 站拖垮启动测速），末级直接返回。展开只在导入时做一次并持久化，启动读缓存不影响。实测三级索引 656ms 完成展开选线。

### v1.9.2
- **修复便携版外壳 exe 没图标**：真根因是 `signAndEditExecutable:false` 让 electron-builder 跳过了对自解压外壳的图标注入（`afterPack` 只改到内层程序，用户双击不到）。⚠️ **绝不能对最终 exe 直接跑 rcedit**——会丢掉尾部 NSIS payload（66MB→410KB，程序报废）。新增 `scripts/inject_icon_keep_overlay.py`：只对 PE 主体注入图标再把 overlay 原样拼回；`afterAllArtifactBuild` 钩子自动调用。验证：大小不变、7/7 图标命中、真实启动可自解压运行。

### v1.9.1
- **分类栏多行显示**：`.cat-bar` 改为 `flex-wrap` 自动换行，不再横向溢出看不到后面的标签；超过 12 个的分类收进「更多 N 个 ⌄」可展开/收起。
- **父类分类兜底聚合**：电影/连续剧/综艺/动漫/短剧等父类在苹果 CMS 里 `total=0`（内容都在子类），新增 `PARENT_GROUPS` 语义归组 + `fetchCategoryByName()`：先走原有精确匹配，查不到才展开子类并发抓取合并去重，**不破坏原机制**。「全部」在首页无缓存时也能进入完整分页列表。
- **目录版 EXE 图标**：新增 `scripts/deploy_dir.py`，把 `electron.exe` 改名 `MediaShell.exe` 并用 rcedit 注入图标；便携版 PE 资源已含 7 尺寸图标（看不到多为 Windows 图标缓存，需刷新）。

### v1.9.0
- **空壳首启架构**：应用不再内置任何影视资源；新增 `user-store.js` 把订阅与设置存 `DATA_DIR`。首次启动空壳引导、不发网络请求，导入一次后自动加载；新增 9 个用户配置 IPC（导入/导出备份/设置/重置等）。
- **播放器体验**：单击画面暂停/恢复、双击全屏，移除中央常驻播放按钮；新增全屏/小窗(PiP)/弹幕按钮与自定义控制条。
- **弹幕**：总开关 + 按源 URL 哈希独立记忆开关；主题明暗两套（持久化的 CSS 变量）；历史显示点播进度并可续播；重置弹框二次确认。
- 新增 `scripts/smoke_test.js`（10 项）与 `scripts/store_test.js`（11 项），均全绿。

### v1.8.0
- **新增应用图标**：新增 `build/icon.ico`（16/24/32/48/64/128/256 七尺寸）与 `build/icon.png`（512×512）。设计为「圆角电视屏底板 + 品牌渐变播放三角 + 直播信号弧」，配色取自界面主题（强调色 `#ff5c7a`、次强调 `#6ea8ff`、底色 `#0d0f14`）。
- 图标由 `scripts/make_icon.py` **纯标准库生成**（不依赖 PIL/图像库），可重复构建：`python scripts/make_icon.py`。
- `electron-builder.yml` 的 `win.icon` 指向 `build/icon.ico`；`main.js` 的 `BrowserWindow.icon` 指向 `icon.png`（随 asar 打包，任务栏/窗口标题栏均显示图标）。

### v1.7.0
- 直播源改为影视仓/TVBox 标准 TXT（UTF-8 BOM + CRLF、一行一条线路、同名频道合并为多线路），本地内置 `TVLives.txt` / `BiliLive.txt` / `LiveSports.txt` 全部刷新到最新版本。
- 站点配置切到永久固定地址链：`zheteng_v2.json`（主 cdn + 备 gcore）→ `aizheteng_v2.json` → `YSCv3/` → `TVLives_v2.m3u`。
- 修复：`parseTVLines` 按频道名合并同名行（此前同一频道会显示成多条重名条目），并剥离 BOM、兼容 `,` 与 `#` 两种地址分隔。


当前 **v1.12.0**（开发日志见独立仓库 [MediaShell-DevLog](https://github.com/amygoTV/MediaShell-DevLog)）。

### 单文件便携版（推荐）

发布页 `MediaShell便携版.exe`（约 66MB）——双击即用，自解压到本机临时目录运行，无需 bat 启动器、无需散落 dll。启动后如需持久化收藏/历史，可设置环境变量 `MSHELL_DATA` 指向固定目录（默认随解压目录）。

### 直播页

左侧可折叠频道分类栏（同名频道去重、多源线路合并），右侧播放器预览；画面左下角切换线路，支持超时自动换线、解码方式（硬件/软件/自动）与播放器（内置 / mpv / VLC / PotPlayer，自动检测本机安装）选择。检测到 mpv 时优先用其硬件解码，显著降低直播卡顿。

直播流经**主进程本地代理**（`127.0.0.1:19871`）转发：绝大多数 IPTV 源不返回 CORS 头，浏览器直连会被拦截，代理负责拉取 m3u8、重写分片地址并透传 TS 字节流。右上角「🔍 检测线路」可并发实测每条线路是否可播，侧栏显示 `可用/总数`，点击频道时自动优先选用已验证可用的线路。

直播页性能：频道量已达 2800+，用 Map 索引 + 事件委托 + 分组按需渲染（默认每组 60 个，可展开），实测 DOM 节点 3004 → 391、渲染 135ms → 4ms。本地源毫秒级先渲染，远程赛事源后台追加（首屏 13.3s → 0.12s）。

## 启动

### 已部署成品（D 盘）

双击 `D:\MediaShell\Start MediaShell.bat` 即可启动。程序和数据都在 D 盘：

- 程序：`D:\MediaShell\electron.exe`
- 配置：`D:\MediaShell\resources\app.asar` 内的 `config/`
- 数据（历史/收藏/播放列表）：`D:\MediaShell\userdata\`

> 启动器已自动清除 `ELECTRON_RUN_AS_NODE` / `NODE_OPTIONS` 环境变量，避免与开发工具的 Node 环境冲突。请勿直接双击 `electron.exe`，用 bat 启动。
>
> 注意：Electron 必须在**应用目录内**启动（bat 里的 `cd /d "%~dp0"` 就是为此）。若用 `electron.exe <应用路径>` 的方式传入路径参数，Electron 会忽略该参数，导致配置不加载、界面空白。

### 从源码重建

```bat
cd DesktopShell
npm install --registry https://registry.npmmirror.com
npm install electron@28.3.3 asar --save-dev --registry https://registry.npmmirror.com
build.bat
```

`build.bat` 会把源码打包为 `app.asar`，并复制到 `..\MediaShellApp\resources\app.asar`。

## 功能

| 模块 | 说明 |
|---|---|
| 采集站 | 内置 `YSCSites.json` 的 19 个站点（9 个 CMS + 10 个插件源），侧栏切换；启动时自动测速并选最快的可用站，CMS 站（http api）可用，`csp_*` 插件站会灰显并提示（桌面端无法运行影视仓 jar 插件） |
| 首页 | **电视主页风格**：顶部大图 Banner 自动轮播（热播推荐，带标题/播放按钮）、横向分类标签栏、每个分类一行横向滚动海报（鼠标悬停左右滑动）；点分类标签即切换下方横排内容，点「更多」进入完整分页网格。**多站竞速**取数（并发 3 站，先回先用）+ 骨架屏 + 5 分钟缓存，实测首屏 95ms 出 32 张海报、203ms 分类就绪（45 个） |
| 分类 | 自动解析站点真实 `type_id`（`ac=list`），按分类拉海报，支持分页；首页横排「更多」与分类标签联动 |
| 搜索 | 顶部搜索框回车，在当前 CMS 站按 `wd=` 搜索 |
| 详情 | 海报、简介、主演、多播放源、选集；鼠标悬停海报即后台预取详情，点击秒开（实测 1.1s） |
| 播放 | 内嵌 `video` + hls.js 播放 m3u8/mp4；支持「系统播放器」用 PotPlayer/VLC 打开 |
| 直播 | 读取 `TVLives.txt` / `BiliLive.txt`（由 GitHub Actions 每天重建并验证，央视 CCTV1-17 + 31 省卫视 + 深圳卫视保底）及赛事 M3U，按分组展示频道；同名频道合并多线路，经主进程流媒体代理播放 |
| 自动选站 | 侧栏「⚡ 自动选站」并发测速全部 CMS 站，一键切到最快可用站 |
| 收藏/历史 | 本地保存（localStorage，位于 D 盘 userdata） |
| 导入订阅 | 侧栏「导入订阅」可填任意影视仓 JSON 地址覆盖当前站点配置 |
| 重载配置 | 侧栏「重载配置」重新读取内置配置 |

## 直播源自动重建

`scripts/build_live_sources.py` 是直播源的统一筛选流水线，每 6 小时由 `.github/workflows/LiveSources.yml` 自动执行：

1. 拉取多个上游 m3u（实测可播率：huyayqk 94% / douyuyqk 95% / yylunbo 95% / IPTV-V4 85% / CNTV-V4 82% / bililive 15%）
2. 规则过滤广告台（频道名特征 + 广告/图床域名 + 静态录像后缀）
3. **逐条实测可播性**（并发探测，只保留真正返回 m3u8 的线路）
4. 修正错台（一条流被标成多个台名 → 只保留一个；同名不同 URL → 合并为多线路）
5. 名称归一 + 同名合并，输出 `TVLives.txt` / `BiliLive.txt`

跑完会自动校验格式与广告残留，不通过则不提交。上游缺失的频道（如 CCTV6）由脚本内置的「保底线路」补齐。

手动执行：

```bash
python3 scripts/build_live_sources.py                    # 全量
python3 scripts/build_live_sources.py --probe-limit 60    # 快速通道
```

## 技术说明

- **跨域**：渲染进程不能直接请求 CMS 接口，所有网络请求走主进程 `http-get` IPC 代理，支持重定向与 GBK 解码。
- **安全防护**：实测部分采集站域名过期后被拍卖，会 302 跳转到博彩类域名。主进程 HTTP 与流媒体代理均对重定向目标做黑名单校验，命中即拒绝跟随；这类被劫持的站点已从配置移除。
- **超时语义**：主进程 `http-get` 的 `timeout` 为**总预算**（含自动重试），渲染层全部超时收敛在 5~9 秒，避免「以为 8s 实际等 15s」。
- **自动自检**：`electron.exe --selftest`（或 `MSHELL_SELFTEST=1`）会输出 `userdata/selftest.json`（首页取数耗时、直播目录、代理抽样）与 `selftest-ui.json`（首屏海报数/分类数），便于回归验证。
- **数据源**：所有请求直连采集站/CMS，壳本身不托管任何影视内容，仅提供浏览与播放界面。
- **不写 C 盘**：Electron `userData` 通过 `app.setPath` 指向应用目录下的 `userdata/`，历史收藏、播放列表、会话数据全部落在 D 盘。
- **兼容性**：仅支持苹果 CMS `provide/vod` 接口（type=1 的 http 站）；影视仓专用 Spider 插件站（`csp_*`，需 jar）在桌面端不可用，需使用安卓影视仓。
- **HLS**：hls.js 随包内置（`vendor/hls.min.js`），无需联网加载播放器。

## 目录结构

```
DesktopShell/
  main.js          Electron 主进程：窗口、配置读取、HTTP 代理、外部播放器
  preload.js       contextBridge 安全暴露 IPC
  index.html       页面结构
  style.css        深色大屏样式
  app.js           渲染逻辑：站点/分类/海报墙/搜索/详情/直播/播放
  config/          内置配置（YSCSites.json、三份直播 txt 等）
  vendor/hls.min.js  HLS 播放器
  build.bat         打包脚本
  .gitignore
```

## 许可

MIT。影视资源来自公开采集站，请遵守当地法律法规，仅作个人学习研究使用。
