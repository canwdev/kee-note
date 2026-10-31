# KeeNote Web

[English](README.md) | **简体中文**

一款安全、本地优先的浏览器记事 & 密码管理器，基于
[KeePass KDBX](https://keepass.info/help/kb/kdbx_4.html) 文件与
[kdbxweb](https://github.com/keeweb/kdbxweb) 构建。全部逻辑在客户端运行 ——
没有服务器，也没有遥测。你的 `.kdbx` 数据库永远不会离开本机。

- 代码仓库：<https://github.com/canwdev/kee-note>
- 前端说明：[frontend/README.md](frontend/README.md)

## 功能特性

### 数据库与安全

- **支持 KDBX 3 / KDBX 4** —— 打开已有的 KeePass 数据库，或新建 KDBX4 数据库
  （Argon2 由 `hash-wasm` 在 Web Worker 中计算）。
- **密码 + 密钥文件** 两种凭据，并支持随机生成密钥文件。
- **内存内编辑** —— 整个数据库保存在内存中，仅在保存时（`Ctrl+S` / 保存按钮）
  才写回磁盘。
- **未保存修改保护** —— `beforeunload` 离开确认，锁定前提示保存；`Ctrl+L`
  可锁定数据库。
- **打开历史（IndexedDB）** —— 保存 *加密* 的 KDBX 快照、密钥文件与文件引用，
  即使文件权限失效也能快速重新打开。从不保存密码，且可随时开关。
- **跨标签页安全** —— 跨标签页文件锁，并仅对打开 / 新建 / 保存这三个文件操作
  显示全局加载状态。

### 笔记

- 分组与条目支持图标、前景/背景色，可从侧边栏树或顶部菜单管理分组。
- 条目字段：标题、用户名、密码、URL、Markdown **备注**，以及附件。
- **Markdown 编辑** 由 HyperMD / CodeMirror 驱动，带实时语法高亮、TeX 数学
  模式以及大量主题可选。
- **富文本预览** 使用 `marked` + KaTeX 渲染（数学公式输出为 MathML）。
- **附件预览** 支持图片、视频、音频以及文本类 MIME 类型，可上一项/下一项切换
  并下载。
- 支持回收站（软删除，按住 `Shift` 永久删除）。

### 视图与导航

- **列表视图** —— 按分组展示条目，支持搜索与排序。
- **日历视图** —— 以月历网格展示笔记创建日期，可配置每周起始日、可选的农历
  与中国节假日（`solarlunar` + `holiday-cn`），以及所选日期的小型列表。
- **数据搜索** —— 独立的全局搜索窗口。
- **数据可视化** —— 笔记活跃度年度热力图（ECharts），点击可跳转到对应日期。
- **多窗口工作区** —— 停靠 + 堆叠窗口管理（`vgo-ui`），可同时打开并排列多个
  笔记。
- 基于 hash 的路由，带“数据库未打开”路由守卫与 404 页面。

### 外观与交互

- 浅色 / 深色 / 跟随系统主题，可自定义主题色。
- 可折叠侧边栏，界面设置持久化（Pinia + localStorage）。
- Toast / 对话框反馈工具、剪贴板工具与右键菜单。

### 文件与宿主集成

- **File System Access API** —— 对选中的 `.kdbx` 文件进行真实读写
  （Chrome/Edge 86+，需 HTTPS 或 localhost）。
- **FileLite 集成** —— 当 `window.fileLiteSDK` 存在时，优先使用它进行
  打开/保存对话框、文件读写以及 `onOpen` / `getLaunch` 启动。
- 独立的文件访问层（`src/core/file-access.ts`），为测试或其他宿主提供钩子。

## FileLite 插件

可作为 [FileLite](https://github.com/canwdev/file-lite) 插件使用。



1. 从 [Releases](https://github.com/canwdev/kee-note/releases) 下载 `kee-note-web.zip`。
2. 解压后将 `dist` 目录（可重命名为 `kee-note`）放入 FileLite 的插件目录
   `file-lite/plugins/`。
3. 刷新 FileLite 自动启用 KeeNote 插件，即可打开并编辑 `.kdbx` 数据库。

## 相关链接

- 源码与问题反馈：<https://github.com/canwdev/kee-note>
- 前端 / 架构说明：[frontend/README.md](frontend/README.md)
- UI 组件库：[vgo-ui](https://github.com/canwdev/vgo-ui)
