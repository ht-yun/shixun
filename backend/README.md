# CloudLab 本地核心服务

该服务已实现不依赖云资源的课程与实验模板数据接口，并使用本地 H2 文件数据库保存数据。

## 已有接口

- `GET/POST /api/courses`：查询、创建课程
- `GET/PUT/DELETE /api/courses/{id}`：读取、更新、删除课程
- `GET/POST /api/labs`：查询、创建实验模板（可用 `courseId` 筛选）
- `GET/PUT/DELETE /api/labs/{id}`：读取、更新、删除实验模板；其中 `evaluationConfig` 用于保存测试集和评分规则
- `GET /api/health`：服务健康状态
- `GET /api/cloud/adapter-status`：云资源适配器状态；未配置云账号时仍可正常使用其余功能

## 启动

在本目录执行：

```powershell
& 'D:\dev\maven\apache-maven-3.9.12\bin\mvn.cmd' spring-boot:run
```

默认地址为 `http://localhost:8080`，H2 控制台为 `http://localhost:8080/h2-console`。

部署时把 `application.yml` 的 H2 数据源替换为 PostgreSQL，并实现云资源适配器即可。

## 无依赖本地体验

若首次 Maven 下载较慢，可在项目根目录执行 `node local-server.js`，再在浏览器打开 `http://127.0.0.1:4173/portal.html`。该本地服务提供页面和同样的课程/实验模板 JSON 接口，数据保存至项目根目录的 `local-data.json`；它仅用于开发体验，不替代正式后端。
