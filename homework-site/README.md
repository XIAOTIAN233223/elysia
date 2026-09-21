# 作业发布墙

一个可直接部署到 Netlify 的作业发布站点，包含两个页面：

- **展示页**（`/`）——展示图片与文字信息，可按文件夹分类浏览，支持评论区（评论前需设置昵称）。
- **上传页**（`/upload.html`）——上传图片与文字说明，选择分类文件夹。

数据与图片保存在 **Netlify Blobs**（持久化存储），通过一个无服务器函数（Netlify Function）读写。

## 项目结构

```
homework-site/
├─ public/                    # 静态页面
│  ├─ index.html              # 展示页
│  ├─ upload.html             # 上传页
│  ├─ css/style.css
│  └─ js/index.js, upload.js
├─ netlify/functions/api.mjs  # API（读取 Netlify Blobs）
│  └─ lib/_api.mjs            # 核心逻辑
├─ scripts/dev-server.mjs     # 本地预览服务器（可选）
├─ netlify.toml               # 部署配置
└─ package.json
```

## 功能

- 展示图片与文字信息（卡片式布局，点图片放大查看）。
- 文件夹分类：可新建、重命名文件夹，点击文件夹筛选内容。
- 评论区：每条作业下方可评论；**首次评论需先起一个昵称**（昵称仅保存在当前浏览器 localStorage）。
- 上传页：支持多图上传（最多 12 张）、文字说明、选择文件夹。

## 本地预览（可选）

```bash
npm install
npm run dev
```

打开 http://localhost:8787 即可。本地数据存放在 `.dev/blobs`（不会提交）。

## 部署到 Netlify

### 方式一：Git 仓库部署（推荐）

1. 将 `homework-site` 目录推送到 GitHub / GitLab / Bitbucket 仓库。
2. 在 Netlify 选择 “Import from Git” 导入该仓库。
3. 构建命令与发布目录使用 `netlify.toml` 中配置的默认值即可（`publish = "public"`，函数目录 `netlify/functions`）。
4. 点击 Deploy。

### 方式二：Netlify CLI（手动部署）

```bash
npm install -g netlify-cli
npm ci
netlify login
netlify init          # 选择 "Create & configure a new site"
netlify deploy --prod
```

### 方式三：Netlify Drop（拖拽）

把 `homework-site` 整个文件夹拖到 [Netlify Drop](https://app.netlify.com/drop) 即可快速发布**静态页面**。

> 注意：评论、发布、文件夹、图片存储依赖后端的 Netlify Function 与 Netlify Blobs。拖拽方式只发布静态文件，不包含函数，因此这些功能在拖拽站点上不可用。要获得完整功能，请使用上面的 Git 部署或 CLI 部署。
## 数据说明

- 所有作业、文件夹、评论与图片均保存于站点的 Netlify Blobs 存储（store 名：`homework`）。
- 由于使用 Netlify Blobs，数据是站点级持久化的（跨部署保留），无需额外数据库或对象存储配置。

## 容量与限制

- 单条作业：文字 ≤ 5000 字，图片 ≤ 12 张。
- 文件夹名 ≤ 40 字符，昵称 ≤ 24 字符，评论 ≤ 1000 字。
- 图片格式：jpg / png / gif / webp / avif。单个文件建议控制在约 4 MB 以内（受 Netlify Functions 请求体上限影响）。