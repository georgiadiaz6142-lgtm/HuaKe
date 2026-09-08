# 画课（Huake）前端

画课是一款面向少儿美术教研与课程设计的 AI 工作台。本仓库提供产品的前端界面，覆盖课程需求梳理、课程蓝图、结构化教案、主范画、三联步骤图和课堂演示等工作流程。

## 技术栈

- Next.js
- React
- TypeScript
- Tailwind CSS

## 本地运行

需要 Node.js 20 或更高版本。

```bash
npm ci
cp .env.example .env.local
npm run dev
```

浏览器打开终端中显示的本地地址即可。

## API 配置

该仓库只包含前端源码，登录、课程数据和 AI 生成功能需要连接兼容的后端 API。

在 `.env.local` 中配置：

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```

请勿把真实密钥、登录码或私有部署配置提交到仓库。

## 常用命令

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

## 说明

本公开版本面向普通用户界面，不包含管理后台、内部流程预览、后端服务、模型提示词、内部产品文档、生产环境配置或任何访问凭证。仓库当前未附开源许可证。
