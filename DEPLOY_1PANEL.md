# 1Panel 部署说明

推荐使用 Docker Compose 部署。SQLite 数据保存在项目的 `data/` 目录，compose 已经把它挂载为持久化目录。

## 1. 准备域名

把域名解析到服务器公网 IP，例如：

```text
stock.example.com -> 你的服务器 IP
```

## 2. 上传项目

在 1Panel 的“文件”里创建目录，例如：

```text
/opt/stock-dashboard
```

上传整个项目目录内容，至少包含：

```text
Dockerfile
docker-compose.yml
.env.example
server/
public/
package.json
```

不要上传本地 `data/dashboard.sqlite`，除非你明确要把本机数据迁移到服务器。

## 3. 创建环境变量文件

在服务器项目目录里复制 `.env.example` 为 `.env`，并修改：

```text
APP_PORT=3000
ACCESS_USERNAME=admin
ACCESS_PASSWORD=你的强密码
SESSION_SECRET=一串至少32位随机字符
TENCENT_SECRET_ID=你的腾讯云SecretId
TENCENT_SECRET_KEY=你的腾讯云SecretKey
TENCENT_REGION=ap-guangzhou
TENCENT_OCR_ACTION=GeneralAccurateOCR
```

如果暂时不用截图识别，可以先留空腾讯云 OCR 配置。也可以改用 `OPENAI_API_KEY` 或自定义 `OCR_API_URL`。

`ACCESS_PASSWORD` 只用于首次创建管理员账号；管理员在页面里修改密码后，后续部署和容器重启不会再用 `.env` 覆盖页面里设置的密码。

## 4. 在 1Panel 创建编排

进入：

```text
容器 -> 编排 -> 创建编排
```

工作目录选择项目目录，使用项目里的 `docker-compose.yml`，然后启动。

启动后容器会监听：

```text
服务器本机端口 127.0.0.1:3000
```

## 5. 创建网站反向代理

进入：

```text
网站 -> 创建网站
```

选择反向代理方式，把域名代理到：

```text
http://127.0.0.1:3000
```

如果 1Panel 的反向代理在容器网络中无法访问 `127.0.0.1`，可改用服务器内网 IP 或在 1Panel 里选择对应容器 upstream。

## 6. 配置 HTTPS

在 1Panel 的网站证书功能里申请或绑定证书。

建议开启 HTTPS，因为添加到主屏幕 / PWA 安装体验通常需要安全来源。

## 7. 更新系统

以后更新代码：

1. 上传替换项目文件。
2. 在 1Panel 编排里重新构建并重启。
3. 页面会检测到系统版本变化，并提示用户刷新到最新版。

只改 `public/` 前端静态文件时，理论上无需重启 Node 服务；但使用 Docker 部署后，文件在镜像里，通常仍按“重新构建并重启编排”发布，最稳。

## 8. 让 Codex 后续自动同步正式版本

项目已提供自动部署脚本：

```text
scripts/deploy-1panel.sh
```

首次使用前，在本地复制：

```bash
cp .env.deploy.example .env.deploy
```

填写服务器信息：

```text
DEPLOY_HOST=你的服务器IP或域名
DEPLOY_USER=root
DEPLOY_PORT=22
DEPLOY_PATH=/opt/stock-dashboard
DEPLOY_SSH_KEY=/Users/你的用户名/.ssh/你的私钥
DEPLOY_COMPOSE_CMD="docker compose"
DEPLOY_HEALTH_PATH=/api/app-version
DEPLOY_BACKUP_KEEP=10
```

以后 Codex 修改完代码后，可以执行：

```bash
./scripts/deploy-1panel.sh
```

脚本会做这些事：

1. 通过 SSH 连接服务器。
2. 在服务器创建发布备份。
3. 同步当前项目代码到 `DEPLOY_PATH`。
4. 不覆盖服务器上的 `.env`。
5. 不覆盖服务器上的 `data/` 数据目录。
6. 在服务器执行 `docker compose build`。
7. 在服务器执行 `docker compose up -d`。
8. 请求 `DEPLOY_HEALTH_PATH` 做健康检查。
9. 健康检查失败时，自动恢复本次发布前的代码和 `.env`，并重新启动旧版本。

注意：首次部署时，如果服务器项目目录里没有 `.env`，脚本会自动复制 `.env.example` 为 `.env` 并停止。你需要先在服务器上修改 `.env` 里的密码、`SESSION_SECRET` 和 OCR 配置，然后再重新执行部署。

为了安全，不要把服务器密码、OpenAI Key、`.env`、`.env.deploy` 提交或发给别人。

## 9. 备份

部署脚本每次发布前会自动备份：

```text
/opt/stock-dashboard/backups/env-发布时间
/opt/stock-dashboard/backups/data-发布时间/dashboard.sqlite
/opt/stock-dashboard/backups/code-发布时间.tgz
```

默认保留最近 10 份，可通过 `.env.deploy` 修改：

```text
DEPLOY_BACKUP_KEEP=10
```

重点数据仍然是：

```text
/opt/stock-dashboard/data/dashboard.sqlite
/opt/stock-dashboard/.env
```

`data/dashboard.sqlite` 保存用户、自选股、成本和持仓。建议后续再加服务器级定时备份，把这两个文件同步到对象存储或另一台机器。
