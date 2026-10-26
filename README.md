# 报销助手

把报销要用的材料整理成能直接打印的 A4 页：发票拼版、发票信息表、行程轨迹图。识别、拼版、导出全部在设备本地完成，不上传发票与截图。

提供三个平台：Android APK、Windows 免安装 exe、macOS 免安装 zip（Apple 芯片 / Intel）。

## 下载

所有产物都在 [Releases](https://github.com/m0ba/reimbursement-assistant/releases) 页面，同一次发布包含三个平台：

| 平台 | 文件 | 说明 |
|---|---|---|
| Android | `reimbursement-<版本>.apk` | 安装时需允许「安装未知来源应用」 |
| Windows | `reimbursement-<版本>-win.exe` | 单文件免安装，双击即用；首次运行如被 SmartScreen 拦，点「更多信息 → 仍要运行」 |
| macOS（Apple 芯片） | `reimbursement-<版本>-mac-arm64.zip` | 解压双击即用，无需拖进应用程序 |
| macOS（Intel） | `reimbursement-<版本>-mac-x64.zip` | 同上；首次打开如被拦截，右键 →「打开」 |

桌面版与手机版功能一致，数据各自保存在本机，互不影响。

## 功能

**发票整理**

- 一次导入多张 PDF 发票，文件名不参与判断，按文件生成时间排序
- 导入即出 A4 拼版：每页 2 张或 4 张可选，8mm 页边距、中间浅灰裁切线
- 每页 4 张时每张旋转 90°、长边朝内，两两对称，裁开是四张等大的 A6
- 读 PDF 文字层识别类型（住宿 / 火车 / 打车 / 其他）、号码、开票时间、销售方、金额，按号码去重
- 火车票额外提取出发站、到达站、车次，以及带年月日的乘车时间（如 `2026-08-08 15:10`）
- 二维码校验只比对号码与金额，结果分「一致 / 不一致 / 无法校验」
- 信息表含开票时间列，可复制、导出 CSV / PDF，表尾按四类小计
- 草稿自动保存，可「继续导入」追加发票，完成后锁定并允许导出

**轨迹图**

- 只识别截图内应用头部的完整年月日，跳过手机状态栏，不读文件名与 EXIF
- 识别不到不会乱填：可选时间、排到最后或恢复；卡片位置固定，不支持拖动
- 每页 20 / 15 / 12 张三档可选，等比缩放不裁剪，导出 PDF 或 Word

**采购清单**

- 一次维护一份清单，只填写这次实际用到的分类：一行一个物品，名称列固定，可直接改名称/单位/数量/单价
- 不需要的分类可以直接留空，至少填写 1 项就能完成清单；完成入口固定在底部操作区
- 规格、链接、备注、优先级与图片在条目详情里补充；自动保存，完成后可「打回修改」，删除需二次确认
- 导出 Excel：采购清单（公式、分类小计、超链接）+ 规格与图片（图片直接嵌入），横向 A4、适应一页宽

**其他**

- 材料库：内置表格（贴签单）、导入历史、已生成成品
- 任务队列：单任务、可取消、离开页面继续跑
- 导出直接写入系统「下载」目录，完成后弹「已保存」，可直接打开文件
- 检查更新：读取 GitHub 公开版本信息，按平台选择对应安装包；GitHub 慢时可走加速线路，或填自定义加速前缀（如 `https://github.akams.cn/`），检测通过后直接下载
- 设置：OCR 模型下载 / 切换 / 删除、清空本机数据

## 数据位置

- Android：应用私有存储（IndexedDB），卸载即清除
- macOS：`~/Library/Application Support/reimbursement-desktop`
- Windows：`%APPDATA%\reimbursement-desktop`
- 导出文件：系统「下载」目录

## 本地开发

```bash
npm install
npm run dev          # 开发模式，Vite 默认 http://localhost:5173
npm run build        # 产出 dist/
node server.mjs      # 以 dist/ 起本地静态服务，默认 4173，可用 PORT 覆盖
```

手机与电脑在同一 Wi-Fi 时访问 `http://电脑IP:4173`，Safari 里「添加到主屏幕」即可当网页应用使用。

### 桌面版（Electron）

```bash
npm run build
mkdir -p desktop/app && cp -R dist/. desktop/app/
cd desktop && npm install
npm start            # 本地调试
npm run dist:mac     # 打 macOS zip（x64 + arm64，含 ad-hoc 签名）
npm run dist:win     # 打 Windows 免安装 exe
```

### Android

需要 JDK 21 与 Android SDK 36。

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleRelease
# 产物：android/app/build/outputs/apk/release/app-release.apk
```

本地没有签名密钥时会回退到 debug 签名；正式发布由 CI 用固定密钥签名，保证后续版本可覆盖安装。

## 发布流程

推 `v*` 标签即触发 `.github/workflows/android.yml`：

1. `build`：构建 APK 并签名
2. `desktop`：在 macOS 与 Windows 上分别打包桌面版
3. `release`：汇总三端产物，创建 GitHub Release

签名相关 Secrets：

| 名称 | 内容 |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | keystore 文件的 base64 |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 密码 |
| `ANDROID_KEY_ALIAS` | 密钥别名 |
| `ANDROID_KEY_PASSWORD` | 密钥密码 |

## 项目结构

```
src/lib/merge.ts       发票 A4 拼版（2 张 / 4 张）
src/lib/parse.ts       文字层解析、四类判定、火车行程
src/lib/qr.ts          二维码解码与两项比对
src/lib/ocr.ts         轨迹头部 OCR 与模型预热
src/lib/layout.ts      轨迹 PDF（20 / 15 / 12 张每页）
src/lib/exports.ts     信息表 PDF / CSV、轨迹 Word
src/lib/tasks.ts       单任务队列、取消、断点
src/screens/           首页与各功能页
public/tessdata        OCR 模型
public/fonts           PDF 内嵌中文字体
android/               Capacitor 原生工程
desktop/               Electron 桌面壳（Windows / macOS）
```

## 隐私

发票与截图只在设备上解析和生成，不发起任何上传请求，也没有账号体系。检查更新只会读取公开的版本信息（版本号、更新说明、下载地址），不会发送本机任何内容。

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。
