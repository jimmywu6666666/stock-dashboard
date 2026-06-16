# 股市信息综合看板 H5

一个 PC 和手机兼容的个人股市信息看板，包含行情、金十重要事件、热门股票、自选股，以及自选股对应的东方财富股吧热门帖子。

## 启动

当前工作区没有系统 npm，本项目先提供零安装可运行版本：

```bash
/Users/jimmywu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --experimental-sqlite server/index.js
```

访问：

```text
http://localhost:3000
```

默认用户：

```text
用户名：admin
密码：change-me
```

生产部署首次初始化时请设置：

```bash
ACCESS_USERNAME=admin ACCESS_PASSWORD=你的强密码 PORT=3000 node --experimental-sqlite server/index.js
```

`ACCESS_PASSWORD` 只用于首次创建管理员账号；管理员账号创建后，请在页面内修改密码，后续重启/部署不会覆盖已修改的密码。

截图识别自选股需要服务端 OCR。正式上线前请配置其中一种，优先推荐腾讯云 OCR：

```bash
TENCENT_SECRET_ID=你的腾讯云SecretId
TENCENT_SECRET_KEY=你的腾讯云SecretKey
TENCENT_REGION=ap-guangzhou
TENCENT_OCR_ACTION=GeneralAccurateOCR
```

或使用 OpenAI：

```bash
OPENAI_API_KEY=你的OpenAIKey
```

或接入自己的 OCR 服务：

```bash
OCR_API_URL=https://你的OCR接口 OCR_API_KEY=可选
```

如需开放注册，可设置：

```bash
ALLOW_SIGNUP=true
```

如果希望只有知道注册码的人可以注册：

```bash
SIGNUP_CODE=你的注册码
```

## 1Panel 部署

服务器已安装 1Panel 时，推荐使用 Docker Compose 部署。项目已提供 `Dockerfile`、`docker-compose.yml`、`.env.example`、`.env.deploy.example`、`scripts/deploy-1panel.sh` 和 `DEPLOY_1PANEL.md`。

具体步骤见 [DEPLOY_1PANEL.md](./DEPLOY_1PANEL.md)。

默认管理员账号是 `ACCESS_USERNAME` 指定的用户。管理员登录后可以：

- 开设新账号
- 重置任意用户密码
- 通过顶部“查看”切换到不同用户的数据视角

热门股票使用东方财富热度榜；自选股帖子当前只展示东方财富股吧数据。

## 说明

- 数据优先使用免费公开源，第三方站点限制或失败时返回缓存/降级数据。
- 用户和每个用户自己的自选股保存在 `data/dashboard.sqlite`，不同用户的自选股互相隔离。
- 普通账号支持到期时间；管理员账号不设置到期限制。系统记录最后活跃时间，即最近一次登录或数据接口交互时间。
- 自选股可维护成本和持仓，系统按现价计算市值、今日盈亏、今日盈亏比、总盈亏、总盈亏比。
- 上传截图识别只生成候选清单；需要在页面二次确认后才会新增或更新自选股，并会自动去重。
- 页面内有“使用手册”模块；后续新增或修改用户可见功能时，需要同步更新该手册，保持说明与实际功能一致。
- 开发维护记录见 [DEVELOPMENT_LOG.md](./DEVELOPMENT_LOG.md)，发布前应同步补充本轮用户可见功能和部署变更。
- `package.json` 保留了 React/Vite/Express/SQLite 依赖声明，后续有 npm 后可逐步迁移到标准工具链；当前版本使用 Node 内置 HTTP 与 `node:sqlite`，避免安装依赖阻塞使用。
