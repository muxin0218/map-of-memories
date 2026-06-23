# Map of Memories

Map of Memories 是一个本地优先的回忆地图应用。它使用 Next.js 16 App Router、React 19 和 Tailwind 4，数据全部保存在本地，不依赖任何外部服务。

## 功能

- 密码入口页，输入站点密码后进入地图。
- 中国地图、省份详情、城市回忆、照片展示、编辑和删除。
- 日常打卡记录，在回忆记录页整合展示。
- 设置页可管理站点密码、沿途天气城市、登录页照片和文案。
- 设置页支持完整备份导出、导入恢复、清空数据。

## 初始密码

**首次运行的初始密码：**

```text
进入密码：1234
管理员密码：admin1234
```

第一次打开请用上面的初始密码登录。进入后请尽快改成自己的：

- 进入 **设置 → 密码设置**（需先用管理员密码开启管理员模式）。
- **进入密码**建议填一个你记得住的 4 位数字。
- **管理员密码**自己设置。

技术说明：本地认证配置保存在 `data/auth.local.json` 文件中。在设置页改密码会直接写回这个文件。若启动环境显式设置了 `SITE_PASSWORD`、`ADMIN_PASSWORD` 或 `AUTH_COOKIE_SECRET`，则优先使用环境变量。

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 打开浏览器访问
open http://localhost:3000
```

## 数据保存位置

所有数据默认保存在项目目录：

```text
data/localMemories.private.json
data/cityAssets.private.json
data/loginPhotos.private.json
data/auth.local.json
```

可用环境变量覆盖数据目录：

```text
MAP_OF_MEMORIES_DATA_DIR=/path/to/data
```

## 可自定义内容

在设置页开启管理员模式后，可以自定义：

- 站点密码。
- 首页"沿途天气"的城市。
- 登录页九宫格照片。
- 登录页每张照片的城市名和标签文案。
- 城市地标图。

这些设置会随完整备份一起导出。登录页照片、城市地标和回忆照片以本地数据形式保存。

## 备份和迁移

在设置页使用"导出备份"保存完整备份文件。文件名会包含日期。

换电脑或重装后：

1. 启动项目，输入站点密码进入地图。
2. 进入设置页，用管理员密码开启管理员模式。
3. 导入备份文件。

导入会恢复回忆、城市地标、登录照片、天气城市，以及地点收藏、纪念日页面、时光宝盒等辅助数据。

## 目录速览

```text
app/                     App Router 页面和 API 路由
components/              地图、入口页、回忆页和设置页组件
data/                    省份、城市、进度和浏览器侧数据工具
lib/                     地理数据、隐私模式和服务端存储工具
lib/server/              服务端存储与认证逻辑
public/logo/             logo 占位图
public/photos/           默认照片素材
public/sprites/          城市地标、图标和像素素材
docs/                    数据库 Schema 文档
scripts/                 SQL 初始化脚本和数据迁移工具
```


