# 学生实践平台

面向教学实践的课程、实验、作业、考试与成绩管理平台。项目提供教师端课程建设、学生端实验与作业提交、受限终端环境、自动评测及成绩同步能力。

## 本地运行

要求 Node.js 18 或更高版本：

```bash
npm install
npm start
```

默认访问地址为 `http://127.0.0.1:4173/portal.html`。

## 测试

```bash
npm test
```

## 目录说明

- `portal.*`：教师与学生工作台页面
- `app.js`、`index.html`：实验运行页面
- `local-server.js`：本地 HTTP API、认证、文件与成绩数据服务
- `terminal-gateway.js`、`terminal/`：受限实验终端与容器环境
- `backend/`：Java 后端示例模块
- `scripts/`：课程、账号和数据维护脚本
- `deploy/`：部署与运维配置
- `tests/`：自动化测试

运行数据、账号会话、上传文件、发布包和服务器交付资料均不会提交到本仓库。
