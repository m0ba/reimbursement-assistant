# 报销助手

把报销要用的材料整理成能直接打印的 A4 页：发票拼版、发票信息表、行程轨迹图。全部在设备本地处理，不上传、不外发。

## 功能

**发票整理**

- 一次导入多张 PDF 发票，文件名不参与判断，按文件生成时间排序
- 导入瞬间生成 A4 拼版：每页 2 张或 4 张可选，留 5mm 边距、中间浅灰虚线，印完裁开即用
- 每页 4 张时每张旋转 90°、长边朝内，两两对称，裁开是四张等大的 A6
- 读 PDF 文字层识别类型（住宿 / 火车 / 打车 / 其他）、号码、日期、销售方、金额，按号码去重
- 火车票额外提取出发站、到达站、车次与发车时间
- 二维码校验只比对号码与金额，结果分「一致 / 不一致 / 无法校验」
- 信息表可复制、导出 CSV / PDF，表尾按四类小计

**轨迹图**

- 只识别截图内应用头部的完整年月日，跳过手机状态栏，不读文件名与 EXIF
- 识别不到不会乱填，由用户选时间或直接排到最后
- 每页 20 张（5 列 × 4 行），等比缩放不裁剪，导出 PDF 或 Word

**其他**

- 材料库：内置表格（贴签单）、导入历史、已生成成品
- 任务队列：单任务、可取消、离开页面继续跑、断点续跑
- 设置：OCR 模型下载 / 切换 / 删除、清空本机数据、检查更新

## 浏览器使用

```bash
npm install
npm run dev        # 开发模式 http://localhost:4173
npm run build      # 产出 dist/
node server.mjs    # 以 dist/ 起一个本地服务，默认 4173
```

手机与电脑在同一 Wi-Fi 时，访问 `http://电脑IP:4173`，Safari 里「添加到主屏幕」即可。

## Android 安装包

仓库已接入 Capacitor，`android/` 是原生工程。打 APK 有两种方式：

1. **GitHub Actions（推荐）**：推送 `v*` 标签即自动构建并发布 Release，产物为 `reimbursement-vX.Y.Z.apk`。
2. **本地构建**：需要 JDK 21 与 Android SDK 36。

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

APK 使用 debug 签名，可直接安装，安装时需允许「安装未知来源应用」。导出文件在原生端会调用系统分享面板，可保存到文件或发送到微信。

## 项目结构

```
src/lib/merge.ts       发票 A4 拼版（2 张 / 4 张）
src/lib/parse.ts       文字层解析、四类判定、火车行程
src/lib/qr.ts          二维码解码与两项比对
src/lib/ocr.ts         轨迹头部 OCR 与模型预热
src/lib/layout.ts      轨迹 20 张/页 PDF
src/lib/exports.ts     信息表 PDF / CSV、轨迹 Word
src/lib/tasks.ts       单任务队列、取消、断点
src/screens/           首页与四个功能页
public/tessdata        OCR 模型
public/fonts           PDF 内嵌中文字体
android/               Capacitor 原生工程
```

## 隐私

发票与截图只在设备上解析和生成，程序不发起任何外部网络请求，也没有账号体系。数据存在本机 IndexedDB，设置里可一键清空。

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。
