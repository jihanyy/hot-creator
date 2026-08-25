# React + TypeScript + Vite

## AI 模型配置

后端从 `backend/.env` 读取 AI 配置，业务代码中没有固定模型：

```env
AI_BASE_URL=https://openrouter.ai/api/v1
AI_API_KEY=replace-with-your-ai-api-key
AI_MODEL=replace-with-provider-model-id
```

- 在同一个服务商内切换模型：修改 `AI_MODEL`，然后重启后端。
- 切换 AI 服务商：同时修改 `AI_BASE_URL`、`AI_API_KEY` 和 `AI_MODEL`。
- 启动日志只显示模型、接口地址和 Key 是否配置，不打印 Key 内容。

## Docker 部署

镜像使用多阶段构建，将 React 前端和 FastAPI 后端打包到同一个容器，通过 `8000` 端口提供页面和 API。

构建镜像：

```bash
docker build -t hot-creator:latest .
```

使用现有环境变量文件运行：

```bash
docker run -d \
  --name hot-creator \
  --restart unless-stopped \
  --env-file backend/.env \
  -p 8000:8000 \
  hot-creator:latest
```

启动后访问 `http://localhost:8000`。健康检查状态可通过下面的命令查看：

```bash
docker inspect --format='{{json .State.Health}}' hot-creator
```

`backend/.env` 已排除在镜像构建上下文之外，AI 和热点接口密钥只在容器运行时注入。

### Docker Compose

复制根目录示例配置并填写真实密钥：

```bash
cp .env.example .env
```

启动服务：

```bash
docker compose up -d --build
```

Compose 从与 `docker-compose.yml` 同目录的 `.env` 注入环境变量，并将宿主机 `20001` 端口映射到容器的 `8000` 端口。启动后访问 `http://localhost:20001`。

停止服务：

```bash
docker compose down
```

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
