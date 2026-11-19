/* 将“前后端代码补全与联调实训”课程、8 个实验和题库追加到 CloudLab 平台数据。 */
const fs = require('fs');
const path = require('path');

const PREFIX = 'frontend-backend-fill-';
const COURSE_ID = `${PREFIX}course`;
const createdAt = '2026-11-13T00:00:00.000Z';

const modules = [
  ['form', '去除标题两端空格', '认识字符串与 trim 方法', 30],
  ['fetch', '提取课程名称', '认识数组与 map 方法', 30],
  ['route', '判断标题是否填写', '认识比较运算与布尔值', 30],
  ['validation', '筛选指定课程任务', '认识数组与 filter 方法', 30],
  ['sqlite', '按条件查询数据库', '认识 SQL 的 WHERE 关键字', 30],
  ['auth', '判断教师身份', '认识对象属性与严格相等运算符', 30],
  ['integration', '把任务放入响应数据', '认识后端响应对象的 data 字段', 30],
  ['project', '把任务标记为已完成', '认识对象属性赋值', 30],
];

function evaluation(id, tests, options = {}) {
  return {
    passPolicy: 'score-threshold',
    scoringRule: 'weighted',
    passingScore: options.passingScore || 100,
    whitespacePolicy: 'trim-lines',
    caseSensitive: true,
    studentFiles: options.studentFiles || [],
    executionFile: '平台内置安全评测器',
    outputType: '文本结果',
    tests: tests.map((test, index) => ({ id: `${id}-test-${index + 1}`, required: true, ...test })),
    referenceAnswers: options.referenceAnswers || [],
  };
}

function checkpoint(id, name, values) {
  return {
    id, name, difficulty: values.difficulty || '初级', rewardExperience: values.rewardExperience || 120,
    maxExecutionSeconds: 30, objectives: values.objectives, description: values.description,
    knowledge: values.knowledge, requirements: values.requirements, testDescription: values.testDescription,
    evaluationConfig: values.evaluationConfig,
  };
}

function repository(message, files) {
  return { branch: 'main', defaultBranch: 'main', commitMessage: message, files };
}

function textFile(pathname, content, readOnly = false) {
  return { path: pathname, content, readOnly };
}

const beginnerCodeGuide = (file, comment = '//') => {
  const protectedContent = comment === '--' ? '已有建表语句、样例数据或 TODO 注释' : '已有函数、括号或 module.exports';
  return [
  `${comment} ===== 新手先看（按顺序操作） =====`,
  `${comment} 1. 本关只需要修改 ${file}；只在 TODO 下方补写代码，不要删除${protectedContent}。`,
  `${comment} 2. 一个 TODO 一个 TODO 地完成；每写完一处先点“保存”或按 Ctrl+S，不需要一次写完全部代码。`,
  `${comment} 3. 点击页面下方“自动测试”或运行 bash verify.sh；报错会提示还缺少哪一项。`,
  `${comment} 4. 卡住时先照着 TODO 中给出的“返回格式、字段名、错误文案”原样填写，不必从零设计。`,
  `${comment} 5. 写错可以继续改；README、verify.js、verify.sh 是只读的，不要尝试修改它们。`,
  `${comment} ====================================`,
  '',
  ];
};

const readme = (title, goal, files, steps, checks) => [
  `# ${title}`,
  '',
  '## 实验目标',
  goal,
  '',
  '## 待补全文件',
  ...files.map((file) => `- \`${file}\``),
  '',
  '## 填空方式',
  '- 右侧文件树中标注“填空文件”的文件可以编辑；README、verify.js 和 verify.sh 是只读的测试说明与测试程序。',
  '- 每个 `TODO[编号]` 下方就是需要填写代码的位置。请保留函数名和 `module.exports`，只补全 TODO 对应逻辑。',
  '- 点击“自动测试”会实际运行代码文件；测试结果的“实际结果”会保留语法错误、运行错误或断言失败信息，方便据此修改。',
  '',
  '## 新手操作（照着做即可）',
  '1. 在右侧文件树点击带“填空文件”标记的文件；不要编辑 README、verify.js 或 verify.sh。',
  '2. 从第一个 TODO 开始，在它的下一行填写代码。一次只完成一个 TODO，完成后点“保存”。',
  '3. 点击底部“自动测试”。出现红色提示不用慌：先看“实际结果”，它会告诉你是语法、返回值还是错误文案不符合要求。',
  '4. 按提示只修改对应 TODO，再次保存和测试；看到本关列出的 `xxx_OK` 标志就表示该项通过。',
  '5. 不需要安装软件、不需要新建项目，也不要求背下全部语法；题目已给出函数名、输入和期望返回格式。',
  '',
  '## 常见问题',
  '- `Unexpected token`：通常是少了括号、引号、逗号或分号，请从刚修改的 TODO 开始检查。',
  '- `xxx_OK` 没出现：检查 TODO 中的字段名、英文大小写和中文错误文案是否与题目完全一致。',
  '- 不知道从哪里写：先读本文件最上方“新手先看”和 TODO 注释，再只补当前 TODO，不要重写整个文件。',
  '',
  '## 操作步骤',
  ...steps.map((step, index) => `${index + 1}. ${step}`),
  '',
  '## 验收标准',
  ...checks.map((check) => `- ${check}`),
  '',
  '## 提交要求',
  '- 不修改 `verify.js`、`verify.sh` 与测试数据。',
  '- 保留 TODO 附近必要的函数导出，以便自动评测。',
  '- 运行 `bash verify.sh`，全部通过后再提交。',
  '',
].join('\n');

function legacyLabs() {
  return [
    {
      id: `${PREFIX}lab-form`, name: '实验 1：任务表单与浏览器校验', mode: '代码 + 命令行', duration: 120,
      builtIn: 'linux-permissions', techPlatform: 'Linux', language: 'JavaScript (Node.js)', runtimeProfile: 'node-web', publicScope: '本单位可用',
      skillTags: ['JavaScript', 'DOM', '表单校验'], state: '已发布',
      repository: repository('初始化表单校验代码补全实验', [
        textFile('README.md', readme('实验 1：任务表单与浏览器校验', '补全任务输入校验函数。真实页面会调用该函数决定是否允许提交表单。', ['frontend/validate-task.js'], ['阅读 TODO[01]～TODO[04]。', '补全函数后执行 `bash verify.sh`。'], ['空标题会被拒绝。', '描述不足 10 个字符会被拒绝。', '过去日期会被拒绝。', '合法任务返回 `{ valid: true }`。']), true),
        textFile('frontend/validate-task.js', [
          ...beginnerCodeGuide('frontend/validate-task.js'),
          '// ===== 实验要求与填写提示 =====',
          '// 目标：补全 validateTask，使页面只提交合法的任务数据。',
          '// 仅填写 TODO[01]～TODO[04] 对应逻辑；不要修改函数名、参数、导出或 verify 文件。',
          '// 提示 1：先用 String(value || "").trim() 处理标题和描述，避免空值调用 trim() 报错。',
          '// 提示 2：按“标题 → 描述 → 日期”顺序校验；失败时立即 return 指定的错误对象。',
          '// 提示 3：截止日期只需与 today 比较字符串（均为 YYYY-MM-DD 格式）。',
          '// 完成后：运行 bash verify.sh；通过时应看到 EMPTY_TITLE_OK、SHORT_DESCRIPTION_OK、PAST_DATE_OK、VALID_TASK_OK。',
          '// =================================',
          '',
          'function validateTask(input, today = "2026-11-13") {',
          '  // TODO[01]：读取 input.title 并去除首尾空格。',
          '  // TODO[02]：标题为空或超过 30 个字符时，返回 { valid: false, message: "任务标题长度应为 1～30 个字符" }。',
          '  // TODO[03]：描述不足 10 个字符时，返回 { valid: false, message: "任务描述至少需要 10 个字符" }。',
          '  // TODO[04]：截止日期早于 today 时，返回 { valid: false, message: "截止日期不能早于当天" }。',
          '  // 通过时返回 { valid: true, data: { title, description, dueDate } }。',
          '}',
          '',
          'module.exports = { validateTask };',
          '',
        ].join('\n')),
        textFile('verify.js', [
          'const { validateTask } = require("./frontend/validate-task");',
          'const expect = (condition, name) => { if (!condition) throw new Error(name); console.log(name); };',
          'const base = { title: "完成接口练习", description: "使用 Node.js 完成课程任务接口的编写与测试。", dueDate: "2026-11-20" };',
          'expect(!validateTask({ ...base, title: "   " }).valid, "EMPTY_TITLE_OK");',
          'expect(!validateTask({ ...base, description: "太短" }).valid, "SHORT_DESCRIPTION_OK");',
          'expect(!validateTask({ ...base, dueDate: "2026-11-12" }).valid, "PAST_DATE_OK");',
          'const result = validateTask({ ...base, title: "  完成接口练习  " });',
          'expect(result.valid && result.data.title === "完成接口练习", "VALID_TASK_OK");',
        ].join('\n'), true),
        textFile('verify.sh', '#!/usr/bin/env bash\nset -e\nnode verify.js\n', true),
      ]),
      checkpoints: [checkpoint(`${PREFIX}cp-form`, '补全任务输入校验', {
        objectives: '能把页面输入转换为可靠的任务对象，并在前端阻止明显非法数据提交。',
        description: '补全 validateTask，完成标题、描述和日期三类校验。',
        knowledge: '前端校验用于改善体验，但不能替代服务端校验。',
        requirements: [
          '可修改文件：仅编辑 frontend/validate-task.js；README、verify.js 与 verify.sh 为只读测试文件。',
          '在 TODO[01]～TODO[04] 处补全 validateTask，不要改动函数名、参数顺序或 module.exports。',
          '先对 title 去除首尾空格；空标题或长度超过 30 个字符时，返回题目指定的错误对象。',
          '描述少于 10 个字符、截止日期早于 today 时也必须分别拒绝，并保留指定错误文案。',
          '全部校验通过时返回 { valid: true, data: { title, description, dueDate } }，其中 title 必须是去空格后的值。',
          '完成后在命令行运行 bash verify.sh；出现语法错误或断言失败时，按“实际结果”提示回到对应 TODO 修改。',
          '验收标准：自动测试同时输出 EMPTY_TITLE_OK、SHORT_DESCRIPTION_OK、PAST_DATE_OK 与 VALID_TASK_OK。',
        ].join('\n'),
        testDescription: '公开测试验证空标题拒绝和合法数据的返回结构；隐藏测试继续验证描述长度、日期边界和标题去空格。测试不会接受仅“看起来能提交”的实现。',
        evaluationConfig: evaluation(`${PREFIX}cp-form`, [
          { name: '标题校验正确', visibility: 'public', ruleType: 'program-output-contains', target: 'verify.sh', expected: 'EMPTY_TITLE_OK', weight: 50 },
          { name: '边界条件校验正确', visibility: 'hidden', ruleType: 'program-output-contains', target: 'verify.sh', expected: 'PAST_DATE_OK', weight: 50 },
        ], { studentFiles: ['frontend/validate-task.js'], referenceAnswers: [{ id: `${PREFIX}answer-form`, name: '实现提示', content: '可先将 title 与 description 转为字符串并使用 trim()；按校验顺序提前返回错误对象。', deductionPercent: 10 }] }),
      })], createdAt, updatedAt: createdAt,
    },
    {
      id: `${PREFIX}lab-fetch`, name: '实验 2：请求课程与渲染列表', mode: '代码 + 命令行', duration: 120,
      builtIn: 'linux-permissions', techPlatform: 'Linux', language: 'JavaScript (Node.js)', runtimeProfile: 'node-web', publicScope: '本单位可用',
      skillTags: ['JavaScript', 'fetch', 'JSON'], state: '已发布',
      repository: repository('初始化课程请求代码补全实验', [
        textFile('README.md', readme('实验 2：请求课程与渲染列表', '补全异步请求函数。评测通过注入模拟 request 函数，检查成功与失败路径。', ['frontend/course-client.js'], ['补全 TODO[01]～TODO[04]。', '注意 response.json() 是异步操作。', '执行 `bash verify.sh`。'], ['成功响应返回课程数组。', '非 2xx 响应抛出易理解错误。', '错误时返回空数组并触发 onError。']), true),
        textFile('frontend/course-client.js', [
          ...beginnerCodeGuide('frontend/course-client.js'),
          '// ===== 实验要求与填写提示 =====',
          '// 目标：补全 loadCourses，让页面能安全读取课程列表并处理请求失败。',
          '// 仅填写 TODO[01]～TODO[05]；不要修改 request 的调用地址、函数签名、导出或 verify 文件。',
          '// 提示 1：request 和 response.json 都是异步操作，两个位置都需要 await。',
          '// 提示 2：response.ok 为 false 时先抛出 Error("课程加载失败")，后面的 catch 会统一处理。',
          '// 提示 3：成功数据只接受 payload.data 数组；其他结构返回 []，catch 中记得调用 onError(error.message)。',
          '// 完成后：运行 bash verify.sh；通过时应看到 FETCH_SUCCESS_OK 与 FETCH_ERROR_OK。',
          '// =================================',
          '',
          'async function loadCourses(request, onError = () => {}) {',
          '  try {',
          '    // TODO[01]：调用 request("/api/courses")，得到 response。',
          '    // TODO[02]：response.ok 为 false 时抛出 Error("课程加载失败")。',
          '    // TODO[03]：读取 response.json() 的结果 payload。',
          '    // TODO[04]：返回 payload.data；若不是数组则返回 []。',
          '  } catch (error) {',
          '    // TODO[05]：调用 onError(error.message)，并返回 []。',
          '  }',
          '}',
          '',
          'module.exports = { loadCourses };',
          '',
        ].join('\n')),
        textFile('verify.js', [
          'const { loadCourses } = require("./frontend/course-client");',
          'const expect = (condition, name) => { if (!condition) throw new Error(name); console.log(name); };',
          '(async () => {',
          '  const courses = await loadCourses(async (url) => ({ ok: url === "/api/courses", json: async () => ({ data: [{ id: 1, name: "Web" }] }) }));',
          '  expect(courses.length === 1 && courses[0].name === "Web", "FETCH_SUCCESS_OK");',
          '  let message = "";',
          '  const failed = await loadCourses(async () => ({ ok: false, json: async () => ({}) }), (value) => { message = value; });',
          '  expect(failed.length === 0 && message === "课程加载失败", "FETCH_ERROR_OK");',
          '})().catch((error) => { console.error(error.message); process.exit(1); });',
        ].join('\n'), true),
        textFile('verify.sh', '#!/usr/bin/env bash\nset -e\nnode verify.js\n', true),
      ]),
      checkpoints: [checkpoint(`${PREFIX}cp-fetch`, '处理课程请求的成功与失败', {
        objectives: '掌握 fetch 调用中的状态码判断、JSON 解析与异常处理。', description: '补全 loadCourses，使页面可以安全读取课程数据。',
        knowledge: '网络请求成功返回不等于业务处理成功；应先检查 response.ok，再解析 JSON。',
        requirements: [
          '可修改文件：仅编辑 frontend/course-client.js，不要修改 verify.js、verify.sh 或测试注入的 request 函数。',
          '在 TODO[01] 调用 request("/api/courses") 并使用 await 等待响应。',
          '在读取 JSON 前检查 response.ok；非 2xx 响应必须抛出 Error("课程加载失败")。',
          '成功时 await response.json()；仅当 payload.data 为数组时返回它，其他返回值统一降级为 []。',
          '请求抛错或解析失败时必须调用 onError(error.message)，并返回 []，不能把异常继续抛给页面。',
          '保留 async function loadCourses(request, onError) 的函数签名和 module.exports。',
          '完成后运行 bash verify.sh；验收时应看到 FETCH_SUCCESS_OK 和 FETCH_ERROR_OK。',
        ].join('\n'),
        testDescription: '公开测试验证正常 JSON 数据读取；隐藏测试验证非 2xx、request 抛错、回调文案和 payload.data 不是数组时的空数组降级。',
        evaluationConfig: evaluation(`${PREFIX}cp-fetch`, [
          { name: '课程数据读取正确', visibility: 'public', ruleType: 'program-output-contains', target: 'verify.sh', expected: 'FETCH_SUCCESS_OK', weight: 50 },
          { name: '失败请求处理正确', visibility: 'hidden', ruleType: 'program-output-contains', target: 'verify.sh', expected: 'FETCH_ERROR_OK', weight: 50 },
        ], { studentFiles: ['frontend/course-client.js'], referenceAnswers: [{ id: `${PREFIX}answer-fetch`, name: '实现提示', content: '在 try 中依次 await request、判断 ok、await response.json；catch 中调用回调。', deductionPercent: 10 }] }),
      })], createdAt, updatedAt: createdAt,
    },
    {
      id: `${PREFIX}lab-route`, name: '实验 3：编写课程查询接口', mode: '代码 + 命令行', duration: 120,
      builtIn: 'linux-permissions', techPlatform: 'Linux', language: 'JavaScript (Node.js)', runtimeProfile: 'node-web', publicScope: '本单位可用',
      skillTags: ['Node.js', 'REST API', '状态码'], state: '已发布',
      repository: repository('初始化课程接口代码补全实验', [
        textFile('README.md', readme('实验 3：编写课程查询接口', '补全一个类似 Express 控制器的函数，根据课程编号返回任务列表或 404。', ['backend/course-controller.js'], ['阅读数据结构与 TODO。', '补全后运行测试。'], ['存在课程返回 200。', '未知课程返回 404。', '响应结构统一为 success/data/message。']), true),
        textFile('backend/course-controller.js', [
          ...beginnerCodeGuide('backend/course-controller.js'),
          '// ===== 实验要求与填写提示 =====',
          '// 目标：实现按课程编号查询任务的接口控制器，并返回统一的 HTTP 响应对象。',
          '// 仅填写 TODO[01]～TODO[04]；不要改动 tasks 样例数据、函数名、导出或 verify 文件。',
          '// 提示 1：路径参数通常是字符串，先使用 Number(courseId) 再进行比较。',
          '// 提示 2：使用 tasks.filter(...) 获得某课程的所有任务；空数组表示课程不存在或暂无任务。',
          '// 提示 3：成功响应与失败响应都必须返回 { status, body }，字段名 success、data、message 不能改。',
          '// 完成后：运行 bash verify.sh；通过时应看到 ROUTE_FOUND_OK 与 ROUTE_NOT_FOUND_OK。',
          '// =================================',
          '',
          'const tasks = [',
          '  { id: 1, courseId: 1, title: "完成表单校验", status: "pending" },',
          '  { id: 2, courseId: 1, title: "完成接口请求", status: "done" },',
          '  { id: 3, courseId: 2, title: "完成数据库练习", status: "pending" },',
          '];',
          '',
          'function getCourseTasks(courseId) {',
          '  // TODO[01]：把 courseId 转为数字。',
          '  // TODO[02]：筛选对应课程的任务。',
          '  // TODO[03]：若没有任何任务，返回 { status: 404, body: { success: false, message: "课程不存在或暂无任务" } }。',
          '  // TODO[04]：否则返回 { status: 200, body: { success: true, data: courseTasks } }。',
          '}',
          '',
          'module.exports = { getCourseTasks };',
          '',
        ].join('\n')),
        textFile('verify.js', [
          'const { getCourseTasks } = require("./backend/course-controller");',
          'const expect = (condition, name) => { if (!condition) throw new Error(name); console.log(name); };',
          'const found = getCourseTasks("1");',
          'expect(found.status === 200 && found.body.success && found.body.data.length === 2, "ROUTE_FOUND_OK");',
          'const missing = getCourseTasks("999");',
          'expect(missing.status === 404 && !missing.body.success, "ROUTE_NOT_FOUND_OK");',
        ].join('\n'), true),
        textFile('verify.sh', '#!/usr/bin/env bash\nset -e\nnode verify.js\n', true),
      ]),
      checkpoints: [checkpoint(`${PREFIX}cp-route`, '返回正确的课程任务响应', {
        objectives: '理解路径参数、查询结果和 HTTP 状态码之间的对应关系。', description: '补全 getCourseTasks，实现课程任务查询。',
        knowledge: 'REST 接口应通过状态码表达结果；资源不存在通常返回 404。',
        requirements: [
          '可修改文件：仅编辑 backend/course-controller.js；不要改变文件顶部的 tasks 教学数据。',
          '在 TODO[01] 使用 Number(courseId) 将路径参数转换为数字，再用 TODO[02] 筛选对应课程任务。',
          '如果筛选结果为空，返回 status 为 404，body 中必须包含 success: false 和指定的 message。',
          '如果存在任务，返回 status 为 200，body 中必须包含 success: true 与完整的 data 数组。',
          '不要直接返回数组、不要把未知课程误判为成功，也不要改动 getCourseTasks 的导出名称。',
          '运行 bash verify.sh；验收标准是同时通过 ROUTE_FOUND_OK 与 ROUTE_NOT_FOUND_OK。',
        ].join('\n'),
        testDescription: '公开测试检查字符串课程编号能查询到两条任务及成功响应结构；隐藏测试检查未知编号是否返回 404 和稳定的失败结构。',
        evaluationConfig: evaluation(`${PREFIX}cp-route`, [
          { name: '课程任务查询正确', visibility: 'public', ruleType: 'program-output-contains', target: 'verify.sh', expected: 'ROUTE_FOUND_OK', weight: 50 },
          { name: '不存在课程返回 404', visibility: 'hidden', ruleType: 'program-output-contains', target: 'verify.sh', expected: 'ROUTE_NOT_FOUND_OK', weight: 50 },
        ], { studentFiles: ['backend/course-controller.js'], referenceAnswers: [{ id: `${PREFIX}answer-route`, name: '实现提示', content: '可用 Number(courseId) 转换参数，再使用 Array.filter 查询。', deductionPercent: 10 }] }),
      })], createdAt, updatedAt: createdAt,
    },
    {
      id: `${PREFIX}lab-validation`, name: '实验 4：创建任务与服务端校验', mode: '代码 + 命令行', duration: 120,
      builtIn: 'linux-permissions', techPlatform: 'Linux', language: 'JavaScript (Node.js)', runtimeProfile: 'node-web', publicScope: '本单位可用',
      skillTags: ['Node.js', '服务端校验', '中间件'], state: '已发布',
      repository: repository('初始化服务端校验代码补全实验', [
        textFile('README.md', readme('实验 4：创建任务与服务端校验', '补全服务端任务校验函数。即使前端已校验，后端仍必须验证请求数据。', ['backend/validate-task-input.js'], ['补全 4 个 TODO。', '运行 `bash verify.sh`。'], ['缺失字段返回明确错误。', '课程编号必须为正整数。', '合法请求可通过。']), true),
        textFile('backend/validate-task-input.js', [
          ...beginnerCodeGuide('backend/validate-task-input.js'),
          '// ===== 实验要求与填写提示 =====',
          '// 目标：在服务端拒绝非法任务请求，防止未校验的数据进入后续数据库流程。',
          '// 仅填写 TODO[01]～TODO[04]；保持函数签名、错误文案、返回对象字段和导出不变。',
          '// 提示 1：body 可能缺少字段，先把 title 和 description 转为字符串再 trim。',
          '// 提示 2：用 Number(courseId) 与 Number.isInteger(...) 判断正整数；不合法时尽早 return。',
          '// 提示 3：所有校验通过后，data.courseId 应为数字而非原始字符串。',
          '// 完成后：运行 bash verify.sh；通过时应看到 COURSE_ID_CHECK_OK、TITLE_CHECK_OK、SERVER_VALIDATION_OK。',
          '// =================================',
          '',
          'function validateTaskInput(body = {}) {',
          '  // TODO[01]：解构 courseId、title、description、dueDate，并将 title/description 转为去除首尾空格的字符串。',
          '  // TODO[02]：courseId 不是正整数时返回 { valid: false, message: "课程编号必须为正整数" }。',
          '  // TODO[03]：title 为空或超过 30 个字符时返回对应错误。',
          '  // TODO[04]：description 少于 10 个字符或 dueDate 为空时返回对应错误。',
          '  // 通过时返回 { valid: true, data: { courseId: Number(courseId), title, description, dueDate } }。',
          '}',
          '',
          'module.exports = { validateTaskInput };',
          '',
        ].join('\n')),
        textFile('verify.js', [
          'const { validateTaskInput } = require("./backend/validate-task-input");',
          'const expect = (condition, name) => { if (!condition) throw new Error(name); console.log(name); };',
          'const input = { courseId: "1", title: "发布联调任务", description: "完成前后端接口联调并截图记录测试结果。", dueDate: "2026-11-30" };',
          'expect(!validateTaskInput({ ...input, courseId: 0 }).valid, "COURSE_ID_CHECK_OK");',
          'expect(!validateTaskInput({ ...input, title: "" }).valid, "TITLE_CHECK_OK");',
          'const result = validateTaskInput(input);',
          'expect(result.valid && result.data.courseId === 1, "SERVER_VALIDATION_OK");',
        ].join('\n'), true),
        textFile('verify.sh', '#!/usr/bin/env bash\nset -e\nnode verify.js\n', true),
      ]),
      checkpoints: [checkpoint(`${PREFIX}cp-validation`, '补全服务端请求校验', {
        objectives: '理解服务端不能信任客户端输入，并能返回一致的错误对象。', description: '补全 validateTaskInput，确保非法请求无法进入数据库层。',
        knowledge: '前后端都应校验；服务端校验承担最终数据边界责任。',
        requirements: [
          '可修改文件：仅编辑 backend/validate-task-input.js，不修改 verify.js、verify.sh 或测试样例。',
          '解构 courseId、title、description、dueDate；title 和 description 都要安全转为字符串并去除首尾空格。',
          'courseId 必须是正整数；编号非法时立即返回题目指定的错误对象，不能继续进入后续逻辑。',
          '标题不能为空且最多 30 个字符；描述至少 10 个字符；dueDate 不能为空，分别返回对应错误。',
          '全部校验通过时，返回 valid: true，且 data.courseId 必须为 Number 类型并包含清理后的字段。',
          '保持 validateTaskInput(body = {}) 和 module.exports 不变；使用提前 return 保持错误路径清晰。',
          '运行 bash verify.sh；验收时应通过 COURSE_ID_CHECK_OK、TITLE_CHECK_OK 与 SERVER_VALIDATION_OK。',
        ].join('\n'),
        testDescription: '公开测试验证课程编号和标题；隐藏测试会检查空描述、短描述、空日期、空白字符以及成功返回的数据类型。',
        evaluationConfig: evaluation(`${PREFIX}cp-validation`, [
          { name: '必填字段校验正确', visibility: 'public', ruleType: 'program-output-contains', target: 'verify.sh', expected: 'TITLE_CHECK_OK', weight: 50 },
          { name: '服务端数据结构正确', visibility: 'hidden', ruleType: 'program-output-contains', target: 'verify.sh', expected: 'SERVER_VALIDATION_OK', weight: 50 },
        ], { studentFiles: ['backend/validate-task-input.js'], referenceAnswers: [{ id: `${PREFIX}answer-validation`, name: '实现提示', content: '用 Number.isInteger(Number(courseId)) 验证编号；校验失败后尽早 return。', deductionPercent: 10 }] }),
      })], createdAt, updatedAt: createdAt,
    },
    {
      id: `${PREFIX}lab-sqlite`, name: '实验 5：SQLite 持久化任务', mode: '代码 + 命令行', duration: 120,
      builtIn: 'linux-permissions', techPlatform: 'Linux', language: 'SQL / SQLite', runtimeProfile: 'node-web', publicScope: '本单位可用',
      skillTags: ['SQLite', 'SQL', '数据持久化'], state: '已发布',
      repository: repository('初始化 SQLite 代码补全实验', [
        textFile('README.md', readme('实验 5：SQLite 持久化任务', '补全 SQL，将一条任务写入数据库，并按课程编号查询任务。', ['backend/tasks.sql'], ['补全 INSERT 和 SELECT。', '使用 `?` 参数化思想在实际项目中传参；本实验使用固定教学数据验证查询。', '运行 `bash verify.sh`。'], ['任务被写入 tasks 表。', '查询只返回 course_id = 1 的记录。', '输出包含任务标题。']), true),
        textFile('backend/tasks.sql', [
          ...beginnerCodeGuide('backend/tasks.sql', '--'),
          '-- ===== 实验要求与填写提示 =====',
          '-- 目标：向 tasks 表写入一条任务，并仅查询指定课程的任务列表。',
          '-- 仅在 TODO[01]、TODO[02] 下方添加 SQL；保留建表语句和两条已有样例数据。',
          '-- 提示 1：新增任务使用 INSERT INTO tasks (course_id, title, status) VALUES (...);。',
          '-- 提示 2：查询使用 SELECT title, status FROM tasks WHERE course_id = 1 ORDER BY id ASC;。',
          '-- 提示 3：每条 SQL 都要以分号结束；不要删除 course_id = 2 的样例，它用于验证过滤条件。',
          '-- 完成后：运行 bash verify.sh；通过时应看到 SQL_EXISTING_OK、SQL_INSERT_OK、SQL_FILTER_OK。',
          '-- =================================',
          '',
          'CREATE TABLE tasks (',
          '  id INTEGER PRIMARY KEY AUTOINCREMENT,',
          '  course_id INTEGER NOT NULL,',
          '  title TEXT NOT NULL,',
          '  status TEXT NOT NULL',
          ');',
          '',
          "INSERT INTO tasks (course_id, title, status) VALUES (1, '完成表单校验', 'done');",
          "INSERT INTO tasks (course_id, title, status) VALUES (2, '完成数据库练习', 'pending');",
          '',
          '-- TODO[01]：插入一条 course_id 为 1、标题为“完成接口请求”、状态为 pending 的任务。',
          '-- TODO[02]：查询 course_id 为 1 的任务，输出 title 和 status，并按 id 升序排列。',
          '',
        ].join('\n')),
        textFile('verify.sh', [
          '#!/usr/bin/env bash',
          'set -e',
          'output="$(sqlite3 :memory: < backend/tasks.sql)"',
          'printf "%s\\n" "$output"',
          'printf "%s" "$output" | grep -q "完成表单校验|done" && echo SQL_EXISTING_OK',
          'printf "%s" "$output" | grep -q "完成接口请求|pending" && echo SQL_INSERT_OK',
          '! printf "%s" "$output" | grep -q "完成数据库练习|pending" && echo SQL_FILTER_OK',
        ].join('\n'), true),
      ]),
      checkpoints: [checkpoint(`${PREFIX}cp-sqlite`, '写入并查询 SQLite 任务数据', {
        objectives: '掌握 INSERT、SELECT、WHERE 与 ORDER BY 的基础用法。', description: '补全 tasks.sql 中的插入与按课程查询语句。',
        knowledge: '任务数据应由数据库持久化；真实项目应使用参数化查询避免 SQL 注入。',
        requirements: [
          '可修改文件：仅编辑 backend/tasks.sql；保留 CREATE TABLE 语句和两条已有样例 INSERT 数据。',
          '在 TODO[01] 新增一条任务：course_id 为 1，title 为“完成接口请求”，status 为 pending。',
          '在 TODO[02] 查询 course_id = 1 的任务，只输出 title 与 status，并按 id 升序排列。',
          '不要删除 course_id = 2 的样例；它用于验证 WHERE 条件是否真正过滤了其他课程。',
          'SQL 语句必须以分号结束，且查询结果应包含既有任务和新增任务，不得输出课程 2 的任务。',
          '在命令行运行 bash verify.sh；若提示 sqlite3 或 SQL 语法错误，请先修正 SQL 后重试。',
          '验收标准：输出 SQL_EXISTING_OK、SQL_INSERT_OK、SQL_FILTER_OK。',
        ].join('\n'),
        testDescription: '公开测试检查新增记录及输出格式；隐藏测试检查 WHERE course_id = 1 与 ORDER BY id ASC 是否生效，防止查询全表。',
        evaluationConfig: evaluation(`${PREFIX}cp-sqlite`, [
          { name: '新任务写入正确', visibility: 'public', ruleType: 'program-output-contains', target: 'verify.sh', expected: 'SQL_INSERT_OK', weight: 50 },
          { name: '按课程过滤正确', visibility: 'hidden', ruleType: 'program-output-contains', target: 'verify.sh', expected: 'SQL_FILTER_OK', weight: 50 },
        ], { studentFiles: ['backend/tasks.sql'], referenceAnswers: [{ id: `${PREFIX}answer-sqlite`, name: 'SQL 提示', content: '先 INSERT 一条 course_id=1 的记录，再 SELECT title, status FROM tasks WHERE course_id = 1 ORDER BY id ASC。', deductionPercent: 10 }] }),
      })], createdAt, updatedAt: createdAt,
    },
    {
      id: `${PREFIX}lab-auth`, name: '实验 6：登录与受保护接口', mode: '代码 + 命令行', duration: 120,
      builtIn: 'linux-permissions', techPlatform: 'Linux', language: 'JavaScript (Node.js)', runtimeProfile: 'node-web', publicScope: '本单位可用',
      skillTags: ['Node.js', '认证', '权限控制'], state: '已发布',
      repository: repository('初始化认证代码补全实验', [
        textFile('README.md', readme('实验 6：登录与受保护接口', '补全简化认证函数。教学中使用内置哈希函数，不在仓库中保存明文密码。', ['backend/auth.js'], ['补全登录、令牌解析和教师权限判断。', '运行测试。'], ['错误用户名与错误密码返回同样信息。', '教师可访问受保护操作。', '学生访问教师操作被拒绝。']), true),
        textFile('backend/auth.js', [
          ...beginnerCodeGuide('backend/auth.js'),
          '// ===== 实验要求与填写提示 =====',
          '// 目标：完成登录、教学 Token 解析和教师权限校验三个环节。',
          '// 仅填写 TODO[01]～TODO[05]；不要改动 users、hashPassword、指定错误文案或 verify 文件。',
          '// 提示 1：登录时先按 username 查找用户，再比较 hashPassword(password) 与 passwordHash。',
          '// 提示 2：用户名不存在和密码错误必须使用同一个错误文案，避免泄露账号是否存在。',
          '// 提示 3：Token 格式为“用户ID:角色”；requireTeacher 应调用 parseToken 后再检查 role。',
          '// 完成后：运行 bash verify.sh；通过时应看到 TEACHER_LOGIN_OK、STUDENT_DENIED_OK、INVALID_LOGIN_OK。',
          '// =================================',
          '',
          'const crypto = require("crypto");',
          'const hashPassword = (password) => crypto.createHash("sha256").update(String(password)).digest("hex");',
          'const users = [',
          '  { id: 1, username: "teacher", passwordHash: hashPassword("Teacher123"), role: "teacher" },',
          '  { id: 2, username: "student", passwordHash: hashPassword("Student123"), role: "student" },',
          '];',
          '',
          'function login(username, password) {',
          '  // TODO[01]：按 username 查找用户。',
          '  // TODO[02]：用户不存在或 hashPassword(password) 不匹配时，抛出 Error("用户名或密码错误")。',
          '  // TODO[03]：成功时返回 `${user.id}:${user.role}` 作为教学 Token。',
          '}',
          '',
          'function parseToken(token) {',
          '  // TODO[04]：解析“用户ID:角色”格式；非法 Token 抛出 Error("登录已失效")。',
          '}',
          '',
          'function requireTeacher(token) {',
          '  // TODO[05]：解析 Token；角色不是 teacher 时抛出 Error("没有教师权限")；成功时返回用户信息。',
          '}',
          '',
          'module.exports = { login, parseToken, requireTeacher };',
          '',
        ].join('\n')),
        textFile('verify.js', [
          'const { login, requireTeacher } = require("./backend/auth");',
          'const expect = (condition, name) => { if (!condition) throw new Error(name); console.log(name); };',
          'const token = login("teacher", "Teacher123");',
          'expect(token === "1:teacher" && requireTeacher(token).role === "teacher", "TEACHER_LOGIN_OK");',
          'let denied = false; try { requireTeacher(login("student", "Student123")); } catch (error) { denied = error.message === "没有教师权限"; }',
          'expect(denied, "STUDENT_DENIED_OK");',
          'let invalid = false; try { login("teacher", "wrong"); } catch (error) { invalid = error.message === "用户名或密码错误"; }',
          'expect(invalid, "INVALID_LOGIN_OK");',
        ].join('\n'), true),
        textFile('verify.sh', '#!/usr/bin/env bash\nset -e\nnode verify.js\n', true),
      ]),
      checkpoints: [checkpoint(`${PREFIX}cp-auth`, '实现登录与教师权限判断', {
        objectives: '理解密码校验、身份令牌与角色授权的基本关系。', description: '补全登录与 requireTeacher，使教师和学生拥有不同权限。',
        knowledge: '真实系统应使用带盐哈希和签名 Token；本实验为便于理解进行了简化。',
        requirements: [
          '可修改文件：仅编辑 backend/auth.js；不要改动 users 教学数据、hashPassword 或 verify.js。',
          '在 login 中按 username 查找用户，并用 hashPassword(password) 与 passwordHash 比较。',
          '用户名不存在和密码错误都必须抛出同一个 Error("用户名或密码错误")，避免泄露账号是否存在。',
          '登录成功返回“用户ID:角色”格式的教学 Token；parseToken 只接受该格式，非法值抛出 Error("登录已失效")。',
          'requireTeacher 必须复用 parseToken；角色不是 teacher 时抛出 Error("没有教师权限")，教师则返回解析出的用户信息。',
          '不要新增明文账号、不要修改指定错误文案、不要把学生账号提升为教师。',
          '运行 bash verify.sh；验收时应通过 TEACHER_LOGIN_OK、STUDENT_DENIED_OK、INVALID_LOGIN_OK。',
        ].join('\n'),
        testDescription: '公开测试验证教师登录与授权；隐藏测试验证学生越权、密码错误、Token 格式异常及统一错误文案。',
        evaluationConfig: evaluation(`${PREFIX}cp-auth`, [
          { name: '教师登录与授权正确', visibility: 'public', ruleType: 'program-output-contains', target: 'verify.sh', expected: 'TEACHER_LOGIN_OK', weight: 50 },
          { name: '权限边界处理正确', visibility: 'hidden', ruleType: 'program-output-contains', target: 'verify.sh', expected: 'STUDENT_DENIED_OK', weight: 50 },
        ], { studentFiles: ['backend/auth.js'], referenceAnswers: [{ id: `${PREFIX}answer-auth`, name: '实现提示', content: '先完成 login，再按冒号拆分 Token；教师权限检查应复用 parseToken。', deductionPercent: 15 }] }),
      })], createdAt, updatedAt: createdAt,
    },
    {
      id: `${PREFIX}lab-integration`, name: '实验 7：前后端联调与排错', mode: '代码 + 命令行', duration: 120,
      builtIn: 'linux-permissions', techPlatform: 'Linux', language: 'JavaScript (Node.js)', runtimeProfile: 'node-web', publicScope: '本单位可用',
      skillTags: ['前后端联调', 'HTTP', '异常处理'], state: '已发布',
      repository: repository('初始化联调排错实验', [
        textFile('README.md', readme('实验 7：前后端联调与排错', '修复前端响应解析和后端响应生成，让调用方能够得到正确任务列表。', ['frontend/task-client.js', 'backend/task-response.js'], ['先运行测试并阅读失败信息。', '补全两个文件的 TODO。', '再次运行测试。'], ['200 响应可读取 data。', '非 2xx 响应产生可读错误。', '后端返回统一 JSON 结构。']), true),
        textFile('frontend/task-client.js', [
          ...beginnerCodeGuide('frontend/task-client.js'),
          '// ===== 实验要求与填写提示 =====',
          '// 目标：让前端能识别后端成功/失败响应，并把任务数组或可读错误交给调用方。',
          '// 仅填写 TODO[01]～TODO[02]；不要改变函数名、导出、verify 文件或后端响应字段名。',
          '// 提示 1：无论成功或失败，response.json() 都是异步的，应使用 await 读取 body。',
          '// 提示 2：response.ok 为 false 时抛出 body.message；没有 message 时使用“任务加载失败”。',
          '// 提示 3：成功时只返回数组类型的 body.data，避免错误响应或异常结构导致页面崩溃。',
          '// 完成后：运行 bash verify.sh；重点观察 CLIENT_RESPONSE_OK 与 CLIENT_ERROR_OK。',
          '// =================================',
          '',
          'async function readTaskResponse(response) {',
          '  // TODO[01]：当 response.ok 为 false 时，先读取 JSON，再抛出其中 message 或“任务加载失败”。',
          '  // TODO[02]：当 response.ok 为 true 时，返回 JSON 中的 data 数组；不是数组则返回 []。',
          '}',
          '',
          'module.exports = { readTaskResponse };',
          '',
        ].join('\n')),
        textFile('backend/task-response.js', [
          ...beginnerCodeGuide('backend/task-response.js'),
          '// ===== 实验要求与填写提示 =====',
          '// 目标：补全后端响应构造函数，使其与 frontend/task-client.js 的读取规则完全匹配。',
          '// 仅填写 TODO[03]～TODO[04]；不要修改函数名、导出、verify 文件或响应字段名。',
          '// 提示 1：listTasksResponse 的成功状态码是 200，body 必须含 success: true 与传入的 tasks。',
          '// 提示 2：notFoundResponse 的失败状态码是 404，body 必须含 success: false 和“任务不存在”。',
          '// 提示 3：这里返回普通 JavaScript 对象，不要使用 console.log，也不要抛出错误。',
          '// 完成后：运行 bash verify.sh；通过时应看到 SERVER_RESPONSE_OK、CLIENT_RESPONSE_OK、CLIENT_ERROR_OK。',
          '// =================================',
          '',
          'function listTasksResponse(tasks) {',
          '  // TODO[03]：返回 { status: 200, body: { success: true, data: tasks } }。',
          '}',
          '',
          'function notFoundResponse() {',
          '  // TODO[04]：返回 { status: 404, body: { success: false, message: "任务不存在" } }。',
          '}',
          '',
          'module.exports = { listTasksResponse, notFoundResponse };',
          '',
        ].join('\n')),
        textFile('verify.js', [
          'const { readTaskResponse } = require("./frontend/task-client");',
          'const { listTasksResponse, notFoundResponse } = require("./backend/task-response");',
          'const expect = (condition, name) => { if (!condition) throw new Error(name); console.log(name); };',
          '(async () => {',
          '  const server = listTasksResponse([{ id: 1 }]);',
          '  expect(server.status === 200 && server.body.success, "SERVER_RESPONSE_OK");',
          '  const tasks = await readTaskResponse({ ok: true, json: async () => server.body });',
          '  expect(tasks.length === 1, "CLIENT_RESPONSE_OK");',
          '  let message = ""; try { await readTaskResponse({ ok: false, json: async () => notFoundResponse().body }); } catch (error) { message = error.message; }',
          '  expect(message === "任务不存在", "CLIENT_ERROR_OK");',
          '})().catch((error) => { console.error(error.message); process.exit(1); });',
        ].join('\n'), true),
        textFile('verify.sh', '#!/usr/bin/env bash\nset -e\nnode verify.js\n', true),
      ]),
      checkpoints: [checkpoint(`${PREFIX}cp-integration`, '修复任务列表前后端契约', {
        objectives: '能够根据前端预期与后端响应结构定位接口联调问题。', description: '补全响应构造与解析函数，统一成功和失败响应。',
        knowledge: '前后端必须共享接口契约；错误响应也应保持稳定结构。',
        requirements: [
          '可修改文件：frontend/task-client.js 与 backend/task-response.js；不要修改 verify.js、verify.sh 或文件导出名称。',
          '后端 listTasksResponse 必须返回 status: 200，body 固定包含 success: true 和传入的 tasks 数组。',
          '后端 notFoundResponse 必须返回 status: 404，body 固定包含 success: false 和 message: “任务不存在”。',
          '前端 readTaskResponse 无论成功还是失败都先 await response.json()；成功时仅返回 data 数组，否则返回 []。',
          '当 response.ok 为 false 时，抛出响应中的 message；没有 message 时使用“任务加载失败”。',
          '前后端字段名必须完全一致（success、data、message），不要用 console 输出替代返回值或抛错。',
          '先运行 bash verify.sh 观察失败项，修复后应通过 SERVER_RESPONSE_OK、CLIENT_RESPONSE_OK、CLIENT_ERROR_OK。',
        ].join('\n'),
        testDescription: '公开测试验证成功响应的构造和读取；隐藏测试验证 404 失败响应、错误文案回传以及成功 payload 中 data 非数组时的降级处理。',
        evaluationConfig: evaluation(`${PREFIX}cp-integration`, [
          { name: '成功响应契约正确', visibility: 'public', ruleType: 'program-output-contains', target: 'verify.sh', expected: 'CLIENT_RESPONSE_OK', weight: 50 },
          { name: '失败响应契约正确', visibility: 'hidden', ruleType: 'program-output-contains', target: 'verify.sh', expected: 'CLIENT_ERROR_OK', weight: 50 },
        ], { studentFiles: ['frontend/task-client.js', 'backend/task-response.js'], referenceAnswers: [{ id: `${PREFIX}answer-integration`, name: '实现提示', content: '成功和失败响应都先 await response.json()；后端成功响应固定包含 success 与 data。', deductionPercent: 10 }] }),
      })], createdAt, updatedAt: createdAt,
    },
    {
      id: `${PREFIX}lab-project`, name: '实验 8：综合实训——学习任务管理模块', mode: '代码 + 命令行', duration: 120,
      builtIn: 'linux-permissions', techPlatform: 'Linux', language: 'JavaScript (Node.js)', runtimeProfile: 'node-web', publicScope: '本单位可用',
      skillTags: ['综合实训', 'Node.js', '前后端'], state: '已发布',
      repository: repository('初始化学习任务管理综合实训', [
        textFile('README.md', readme('实验 8：综合实训——学习任务管理模块', '综合前七个实验：教师创建任务，学生查看任务并只能完成自己的任务。', ['backend/task-service.js'], ['补全创建、查询和状态更新三个函数。', '运行测试。', '使用 `git status` 和 `git add/commit` 完成代码提交。'], ['教师可创建任务。', '学生只能完成自己的任务。', '任务列表能按课程筛选。']), true),
        textFile('backend/task-service.js', [
          ...beginnerCodeGuide('backend/task-service.js'),
          '// ===== 实验要求与填写提示 =====',
          '// 目标：实现教师创建任务、按课程查询任务、学生完成自己任务的完整业务流程。',
          '// 仅填写 TODO[01]～TODO[06]；不要改动 tasks、nextId、函数名、导出或 verify 文件。',
          '// 提示 1：createTask 先检查 user.role，再构造任务并使用 nextId++ 生成递增编号。',
          '// 提示 2：listTasks 只返回 courseId 相同的任务，不能泄露其他课程数据。',
          '// 提示 3：completeTask 先检查任务存在，再检查 ownerId === user.id，最后把 status 改为 done。',
          '// 完成后：运行 bash verify.sh；通过时应看到 CREATE_AND_LIST_OK、OWNER_CHECK_OK、COMPLETE_TASK_OK。',
          '// =================================',
          '',
          'const tasks = [];',
          'let nextId = 1;',
          '',
          'function createTask(user, input) {',
          '  // TODO[01]：非 teacher 角色抛出 Error("没有教师权限")。',
          '  // TODO[02]：创建 { id, courseId, title, ownerId, status: "pending" } 并推入 tasks，返回新任务。',
          '}',
          '',
          'function listTasks(courseId) {',
          '  // TODO[03]：返回 courseId 对应的任务数组。',
          '}',
          '',
          'function completeTask(user, taskId) {',
          '  // TODO[04]：查找任务；不存在抛出 Error("任务不存在")。',
          '  // TODO[05]：任务 ownerId 与 user.id 不一致时抛出 Error("不能完成其他学生的任务")。',
          '  // TODO[06]：将 status 改为 done 并返回任务。',
          '}',
          '',
          'module.exports = { createTask, listTasks, completeTask };',
          '',
        ].join('\n')),
        textFile('verify.js', [
          'const { createTask, listTasks, completeTask } = require("./backend/task-service");',
          'const expect = (condition, name) => { if (!condition) throw new Error(name); console.log(name); };',
          'const teacher = { id: 1, role: "teacher" }; const alice = { id: 2, role: "student" }; const bob = { id: 3, role: "student" };',
          'const task = createTask(teacher, { courseId: 1, title: "完成综合实训", ownerId: 2 });',
          'expect(listTasks(1).length === 1 && task.status === "pending", "CREATE_AND_LIST_OK");',
          'let denied = false; try { completeTask(bob, task.id); } catch (error) { denied = error.message === "不能完成其他学生的任务"; }',
          'expect(denied, "OWNER_CHECK_OK");',
          'expect(completeTask(alice, task.id).status === "done", "COMPLETE_TASK_OK");',
        ].join('\n'), true),
        textFile('verify.sh', '#!/usr/bin/env bash\nset -e\nnode verify.js\n', true),
      ]),
      checkpoints: [checkpoint(`${PREFIX}cp-project`, '交付学习任务管理模块', {
        difficulty: '中级', rewardExperience: 200, objectives: '综合使用权限、数据建模和状态更新完成可测试业务模块。',
        description: '补全 task-service.js，使教师可发布任务，学生只能完成自己的任务。',
        knowledge: '综合功能应先明确角色、数据对象和状态流转，再编写代码和测试。',
        requirements: [
          '可修改文件：仅编辑 backend/task-service.js；保持 tasks、nextId、函数名与 module.exports 不变。',
          'createTask 只允许 teacher 角色创建任务；其他角色抛出 Error("没有教师权限")。',
          '新任务必须包含递增 id、courseId、title、ownerId 和初始 status: "pending"，写入 tasks 后返回该对象。',
          'listTasks(courseId) 只能返回指定课程的任务数组，不能返回其他课程的数据。',
          'completeTask 先处理任务不存在；再校验 user.id 与 ownerId，一致时才把 status 更新为 done 并返回任务。',
          '任何学生都不能完成他人的任务，错误文案必须与 TODO 中的要求一致；不要直接修改测试文件。',
          '运行 bash verify.sh，确认 CREATE_AND_LIST_OK、OWNER_CHECK_OK、COMPLETE_TASK_OK 全部通过；再执行 git status 查看修改内容。',
        ].join('\n'),
        testDescription: '公开测试验证教师创建任务与按课程查询；隐藏测试验证非教师创建、任务不存在、跨学生完成任务和完成后的状态变化。',
        evaluationConfig: evaluation(`${PREFIX}cp-project`, [
          { name: '任务创建与查询正确', visibility: 'public', ruleType: 'program-output-contains', target: 'verify.sh', expected: 'CREATE_AND_LIST_OK', weight: 50 },
          { name: '任务权限与完成状态正确', visibility: 'hidden', ruleType: 'program-output-contains', target: 'verify.sh', expected: 'COMPLETE_TASK_OK', weight: 50 },
        ], { studentFiles: ['backend/task-service.js'], referenceAnswers: [{ id: `${PREFIX}answer-project`, name: '实现提示', content: '先校验角色，再构造任务；状态更新前校验任务是否存在及 ownerId 是否匹配。', deductionPercent: 15 }] }),
      })], createdAt, updatedAt: createdAt,
    },
  ];
}

function simpleFillReadme(spec) {
  return [
    `# ${spec.title}`,
    '',
    '## 本关题目',
    spec.question,
    '',
    '## 只需完成 4 步',
    `1. 打开填空文件 \`${spec.path}\`。`,
    '2. 找到代码中唯一的 `__BLANK__`，只把这一处替换成答案。',
    '3. 点击“保存”或按 Ctrl+S。',
    '4. 点击页面下方“自动测试”；看到两个绿色通过标志即完成本关。',
    '',
    '## 提示',
    `- ${spec.hint}`,
    '- 如果出现 SyntaxError，通常是答案少了引号、括号或运算符。',
    '- 不要修改 README、verify.js、verify.sh，也不要重写整个文件。',
    '',
    '## 通过标志',
    ...spec.markers.map((marker) => `- \`${marker}\``),
    '',
  ].join('\n');
}

function simpleCodeHeader(spec, prefix = '//') {
  return [
    `${prefix} ==================== 本关题目 ====================`,
    `${prefix} ${spec.question}`,
    `${prefix} 要求：代码中只有一个填空，只替换下面唯一的待填写位置。`,
    `${prefix} 提示：${spec.hint}`,
    `${prefix} 填好后：保存文件，再点击页面下方“自动测试”。`,
    `${prefix} ================================================`,
    '',
  ];
}

function labs() {
  const specs = [
    {
      key: 'form', title: '实验 1：去除标题两端空格', path: 'frontend/title.js', language: 'JavaScript (Node.js)',
      tags: ['JavaScript', '字符串', 'trim'],
      question: '请补全字符串方法，让“  我的课程  ”变成“我的课程”。',
      hint: '去除字符串首尾空格的方法名是 trim，填写方法名即可，不需要写括号。', answer: 'trim',
      source: [
        'function cleanTitle(title) {',
        '  return String(title).__BLANK__(); // ← 在这里填入字符串方法名',
        '}',
        '',
        'module.exports = { cleanTitle };',
        '',
      ],
      verify: [
        'const { cleanTitle } = require("./frontend/title");',
        'const check = (ok, name) => { if (!ok) throw new Error(name); console.log(name); };',
        'check(cleanTitle("  我的课程  ") === "我的课程", "TITLE_TRIM_OK");',
        'check(cleanTitle("前端基础") === "前端基础", "TITLE_KEEP_OK");',
      ],
      markers: ['TITLE_TRIM_OK', 'TITLE_KEEP_OK'],
      objective: '学会调用 JavaScript 字符串的 trim 方法。', knowledge: '字符串方法 trim() 可以删除字符串首尾的空白字符。',
    },
    {
      key: 'fetch', title: '实验 2：提取课程名称', path: 'frontend/course-list.js', language: 'JavaScript (Node.js)',
      tags: ['JavaScript', '数组', 'map'],
      question: '请补全数组方法，把课程对象数组转换为课程名称数组。',
      hint: '把数组中的每一项转换成新内容使用 map 方法，填写方法名即可。', answer: 'map',
      source: [
        'function getCourseNames(courses) {',
        '  return courses.__BLANK__((course) => course.name); // ← 在这里填入数组方法名',
        '}',
        '',
        'module.exports = { getCourseNames };',
        '',
      ],
      verify: [
        'const { getCourseNames } = require("./frontend/course-list");',
        'const check = (ok, name) => { if (!ok) throw new Error(name); console.log(name); };',
        'const result = getCourseNames([{ name: "前端基础" }, { name: "后端基础" }]);',
        'check(result.join(",") === "前端基础,后端基础", "COURSE_MAP_OK");',
        'check(getCourseNames([]).length === 0, "EMPTY_LIST_OK");',
      ],
      markers: ['COURSE_MAP_OK', 'EMPTY_LIST_OK'],
      objective: '学会使用 map 从对象数组中提取字段。', knowledge: 'map() 会遍历数组，并把每一项转换成新数组中的一项。',
    },
    {
      key: 'route', title: '实验 3：判断标题是否填写', path: 'backend/title-check.js', language: 'JavaScript (Node.js)',
      tags: ['JavaScript', '比较运算', '布尔值'],
      question: '请补全比较运算符，标题长度大于 0 时返回 true。',
      hint: '“大于”使用 > 运算符，本题只填写一个符号。', answer: '>',
      source: [
        'function hasTitle(title) {',
        '  return String(title).trim().length __BLANK__ 0; // ← 在这里填入比较运算符',
        '}',
        '',
        'module.exports = { hasTitle };',
        '',
      ],
      verify: [
        'const { hasTitle } = require("./backend/title-check");',
        'const check = (ok, name) => { if (!ok) throw new Error(name); console.log(name); };',
        'check(hasTitle("课程任务") === true, "TITLE_PRESENT_OK");',
        'check(hasTitle("   ") === false, "TITLE_EMPTY_OK");',
      ],
      markers: ['TITLE_PRESENT_OK', 'TITLE_EMPTY_OK'],
      objective: '学会使用比较运算符得到 true 或 false。', knowledge: '表达式 a > b 用于判断 a 是否大于 b，结果是布尔值。',
    },
    {
      key: 'validation', title: '实验 4：筛选指定课程任务', path: 'backend/task-filter.js', language: 'JavaScript (Node.js)',
      tags: ['JavaScript', '数组', 'filter'],
      question: '请补全数组方法，只保留 courseId 相同的任务。',
      hint: '从数组中筛选符合条件的项目使用 filter 方法，填写方法名即可。', answer: 'filter',
      source: [
        'function findCourseTasks(tasks, courseId) {',
        '  return tasks.__BLANK__((task) => task.courseId === Number(courseId)); // ← 填入数组方法名',
        '}',
        '',
        'module.exports = { findCourseTasks };',
        '',
      ],
      verify: [
        'const { findCourseTasks } = require("./backend/task-filter");',
        'const check = (ok, name) => { if (!ok) throw new Error(name); console.log(name); };',
        'const tasks = [{ id: 1, courseId: 1 }, { id: 2, courseId: 2 }, { id: 3, courseId: 1 }];',
        'check(findCourseTasks(tasks, "1").length === 2, "TASK_FILTER_OK");',
        'check(findCourseTasks(tasks, "9").length === 0, "NO_TASK_OK");',
      ],
      markers: ['TASK_FILTER_OK', 'NO_TASK_OK'],
      objective: '学会使用 filter 筛选数组。', knowledge: 'filter() 会保留回调函数返回 true 的数组元素。',
    },
    {
      key: 'sqlite', title: '实验 5：按条件查询数据库', path: 'backend/tasks.sql', language: 'SQL / SQLite',
      tags: ['SQLite', 'SQL', 'WHERE'], sql: true,
      question: '请补全 SQL 关键字，只查询 course_id 等于 1 的任务。',
      hint: 'SQL 中用于添加查询条件的关键字是 WHERE，填写大写或小写均可。', answer: 'WHERE',
      source: [
        'CREATE TABLE tasks (id INTEGER, course_id INTEGER, title TEXT);',
        "INSERT INTO tasks VALUES (1, 1, '前端入门');",
        "INSERT INTO tasks VALUES (2, 2, '后端入门');",
        '',
        'SELECT title FROM tasks __BLANK__ course_id = 1; -- ← 在这里填入 SQL 关键字',
        '',
      ],
      verifyShell: [
        '#!/usr/bin/env bash',
        'set -e',
        'output="$(sqlite3 :memory: < backend/tasks.sql)"',
        'printf "%s\\n" "$output"',
        'printf "%s" "$output" | grep -q "前端入门" && echo SQL_WHERE_OK',
        '! printf "%s" "$output" | grep -q "后端入门" && echo SQL_FILTER_OK',
      ],
      markers: ['SQL_WHERE_OK', 'SQL_FILTER_OK'],
      objective: '学会使用 WHERE 为 SQL 查询添加条件。', knowledge: 'WHERE 后面填写条件，可以只返回符合条件的数据。',
    },
    {
      key: 'auth', title: '实验 6：判断教师身份', path: 'backend/permission.js', language: 'JavaScript (Node.js)',
      tags: ['JavaScript', '对象', '权限'],
      question: '请补全严格相等运算符，角色为 teacher 时返回 true。',
      hint: 'JavaScript 的严格相等运算符由三个等号组成。', answer: '===',
      source: [
        'function isTeacher(user) {',
        '  return user.role __BLANK__ "teacher"; // ← 在这里填入严格相等运算符',
        '}',
        '',
        'module.exports = { isTeacher };',
        '',
      ],
      verify: [
        'const { isTeacher } = require("./backend/permission");',
        'const check = (ok, name) => { if (!ok) throw new Error(name); console.log(name); };',
        'check(isTeacher({ role: "teacher" }) === true, "TEACHER_ALLOWED_OK");',
        'check(isTeacher({ role: "student" }) === false, "STUDENT_DENIED_OK");',
      ],
      markers: ['TEACHER_ALLOWED_OK', 'STUDENT_DENIED_OK'],
      objective: '学会读取对象属性并使用严格相等运算符。', knowledge: '=== 会同时比较值和数据类型。',
    },
    {
      key: 'integration', title: '实验 7：把任务放入响应数据', path: 'backend/task-response.js', language: 'JavaScript (Node.js)',
      tags: ['JavaScript', '对象', 'API 响应'],
      question: '请补全变量名，让响应对象的 data 字段保存传入的任务数组。',
      hint: '函数参数名是 tasks，data 字段应直接使用这个变量。', answer: 'tasks',
      source: [
        'function listTasksResponse(tasks) {',
        '  return {',
        '    status: 200,',
        '    body: { success: true, data: __BLANK__ } // ← 在这里填入变量名',
        '  };',
        '}',
        '',
        'module.exports = { listTasksResponse };',
        '',
      ],
      verify: [
        'const { listTasksResponse } = require("./backend/task-response");',
        'const check = (ok, name) => { if (!ok) throw new Error(name); console.log(name); };',
        'const tasks = [{ id: 1, title: "学习前端" }];',
        'const response = listTasksResponse(tasks);',
        'check(response.status === 200 && response.body.data === tasks, "RESPONSE_DATA_OK");',
        'check(response.body.success === true, "RESPONSE_SUCCESS_OK");',
      ],
      markers: ['RESPONSE_DATA_OK', 'RESPONSE_SUCCESS_OK'],
      objective: '学会把函数参数放入 API 响应对象。', knowledge: '响应对象中的 data 通常用于存放接口返回的数据。',
    },
    {
      key: 'project', title: '实验 8：把任务标记为已完成', path: 'backend/task-status.js', language: 'JavaScript (Node.js)',
      tags: ['JavaScript', '对象', '赋值'],
      question: '请补全字符串值，把任务状态从 pending 修改为 done。',
      hint: '字符串需要使用引号包围，本题填写 "done"（包含引号）。', answer: '"done"',
      source: [
        'function completeTask(task) {',
        '  task.status = __BLANK__; // ← 在这里填入表示“已完成”的字符串',
        '  return task;',
        '}',
        '',
        'module.exports = { completeTask };',
        '',
      ],
      verify: [
        'const { completeTask } = require("./backend/task-status");',
        'const check = (ok, name) => { if (!ok) throw new Error(name); console.log(name); };',
        'const task = { id: 1, status: "pending" };',
        'const result = completeTask(task);',
        'check(result.status === "done", "TASK_DONE_OK");',
        'check(result === task, "SAME_TASK_OK");',
      ],
      markers: ['TASK_DONE_OK', 'SAME_TASK_OK'],
      objective: '学会给对象属性赋予新的字符串值。', knowledge: '使用等号可以修改对象属性，例如 task.status = "done"。',
    },
  ];

  return specs.map((spec, index) => {
    const commentPrefix = spec.sql ? '--' : '//';
    const code = [...simpleCodeHeader(spec, commentPrefix), ...spec.source].join('\n');
    const verifyFiles = spec.sql
      ? [textFile('verify.sh', spec.verifyShell.join('\n'), true)]
      : [textFile('verify.js', [...spec.verify, ''].join('\n'), true), textFile('verify.sh', '#!/usr/bin/env bash\nset -e\nnode verify.js\n', true)];
    const [publicMarker, hiddenMarker] = spec.markers;
    return {
      id: `${PREFIX}lab-${spec.key}`, name: spec.title, mode: '代码 + 命令行', duration: 30,
      builtIn: 'linux-permissions', techPlatform: spec.sql ? '数据库' : 'Linux', language: spec.language,
      runtimeProfile: 'node-web', publicScope: '本单位可用', skillTags: spec.tags, state: '已发布',
      repository: repository(`初始化${spec.title}单空填空实验`, [
        textFile('README.md', simpleFillReadme(spec), true),
        textFile(spec.path, code),
        ...verifyFiles,
      ]),
      checkpoints: [checkpoint(`${PREFIX}cp-${spec.key}`, `补全唯一代码空格：${spec.title.replace(/^实验 \d+：/, '')}`, {
        difficulty: '入门', rewardExperience: 50,
        objectives: spec.objective,
        description: `${spec.question} 本关只有一个代码空格。`,
        knowledge: spec.knowledge,
        requirements: [
          `只修改 ${spec.path}。`,
          '代码中只有一个 __BLANK__，只替换这一处，不要删除其他代码。',
          `题目：${spec.question}`,
          `提示：${spec.hint}`,
          '填写后保存文件，并点击“自动测试”。',
          `通过标准：测试结果出现 ${spec.markers.join(' 和 ')}。`,
        ].join('\n'),
        testDescription: `系统会运行代码并检查两个基础结果。全部出现绿色通过标志即完成；失败时会显示真实语法或结果错误。`,
        evaluationConfig: evaluation(`${PREFIX}cp-${spec.key}`, [
          { name: '基础结果正确', visibility: 'public', ruleType: 'program-output-contains', target: 'verify.sh', expected: publicMarker, weight: 50 },
          { name: '另一种输入也正确', visibility: 'hidden', ruleType: 'program-output-contains', target: 'verify.sh', expected: hiddenMarker, weight: 50 },
        ], {
          studentFiles: [spec.path],
          referenceAnswers: [{ id: `${PREFIX}answer-${spec.key}`, name: '本关答案', content: `把 __BLANK__ 替换为：${spec.answer}`, deductionPercent: 10 }],
        }),
      })],
      createdAt, updatedAt: createdAt,
    };
  });
}

function questions() {
  const values = [
    ['单选题', '前端调用 fetch 后，判断 HTTP 响应是否为 2xx 的常用属性是？', ['response.ok', 'response.data', 'response.code', 'response.done'], ['A'], 'response.ok 在响应状态为 200～299 时为 true。'],
    ['判断题', '只要前端已经做了输入校验，服务端就不需要再次校验请求数据。', ['正确', '错误'], ['B'], '客户端输入不可信，服务端必须执行最终校验。'],
    ['单选题', '资源不存在时，REST 接口通常应返回哪个状态码？', ['200', '201', '404', '500'], ['C'], '404 表示请求的资源不存在。'],
    ['单选题', 'SQL 查询中使用 ? 占位符传参的主要目的是什么？', ['减少数据库文件大小', '避免 SQL 注入并正确处理数据', '让查询永远更快', '自动创建表'], ['B'], '参数化查询避免把用户输入直接拼接到 SQL 中。'],
    ['判断题', '401 一般表示尚未认证或登录凭证无效，403 一般表示已认证但没有权限。', ['正确', '错误'], ['A'], '401 与身份认证相关，403 与授权不足相关。'],
    ['多选题', '下列哪些属于前后端联调时应检查的内容？', ['请求地址与方法', '状态码', 'JSON 响应结构', '浏览器 Network 记录'], ['A', 'B', 'C', 'D'], '以上都是定位联调问题的重要信息。'],
    ['填空题', '在 JavaScript 中，将响应体解析为 JSON 的常用写法是 await response.______()。', [], ['json'], 'response.json() 返回解析 JSON 的 Promise。'],
    ['简答题', '说明为什么“学生只能完成自己的任务”需要在服务端校验，而不能只依赖前端隐藏按钮。', [], ['前端可以被绕过或伪造请求，服务端必须根据当前用户和任务归属进行权限判断。'], '前端限制只改善体验，服务端权限校验才是安全边界。'],
  ];
  return values.map(([type, stem, options, answers, explanation], index) => ({
    id: `${PREFIX}question-${index + 1}`, courseId: COURSE_ID, type, difficulty: index > 4 ? '中等' : '简单', stem,
    options: options.map((text, optionIndex) => ({ key: String.fromCharCode(65 + optionIndex), text })), answers, explanation,
    defaultScore: type === '简答题' ? 20 : type === '多选题' ? 15 : 10, tags: ['前端', '后端', '代码补全'], createdAt, updatedAt: createdAt,
  }));
}

function course() {
  const resources = modules.map(([key, title, content], index) => ({
    id: `${PREFIX}resource-${key}`, name: `${title}学习指引`, type: '教学资料', folder: `第 ${index + 1} 章`, subtasks: 1,
    description: `${content}。请先阅读实验 README，再进入代码补全实验。`, url: '', completionRule: '访问即完成', status: '已发布', version: 1, createdAt, updatedAt: createdAt,
  }));
  const lectures = modules.map(([key, title, content], index) => ({ id: `${PREFIX}lecture-${key}`, name: `第 ${index + 1} 讲 ${title}`, mode: '线上自主学习', description: content, order: index + 1 }));
  const knowledgePoints = modules.map(([key, title, content], index) => ({ id: `${PREFIX}kp-${key}`, name: title, code: `FB-${String(index + 1).padStart(2, '0')}`, description: content, prerequisiteId: index ? `${PREFIX}kp-${modules[index - 1][0]}` : '' }));
  const stages = modules.map(([key, title, content, minutes], index) => ({
    id: `${PREFIX}stage-${key}`, name: `第 ${index + 1} 章 ${title}`, type: '实践项目', description: content,
    objectives: `认识${content}，完成一个代码空格并通过自动测试。`,
    content: `本章是“一关一空”的入门练习。\n\n操作步骤\n1. 打开标注“填空文件”的代码文件。\n2. 阅读代码最上方的【本关题目】和【提示】。\n3. 找到唯一的 __BLANK__，只替换这一处。\n4. 保存文件，点击“自动测试”。\n5. 两项测试都显示通过后进入下一关。\n\n不需要从零写程序，也不要修改 README、verify.js 或 verify.sh。`,
    labId: `${PREFIX}lab-${key}`, lectureId: `${PREFIX}lecture-${key}`, resourceIds: [`${PREFIX}resource-${key}`], knowledgePointIds: [`${PREFIX}kp-${key}`],
    unlockRule: index ? '顺序解锁' : '自由学习', estimatedMinutes: minutes, visibility: '学生可见', order: index + 1,
  }));
  return {
    id: COURSE_ID, name: '前后端代码补全与联调实训', code: 'WEB-FILL-2026', category: '软件开发', difficulty: '入门', language: '中文', institution: '学生实践平台', term: '2026—2027 学年',
    startDate: '2026-11-13', endDate: '2027-07-31', totalHours: 4, credits: 0.5,
    learningObjectives: '通过 8 个“一关一空”练习，认识字符串、数组、条件判断、SQL、对象、权限和接口响应等前后端基础写法，并学会保存代码和运行自动测试。',
    summary: '面向零基础学生的 8 个可运行代码填空实验。每关只有一个可编辑文件和一个 __BLANK__，代码上方直接显示题目与提示；填写后点击自动测试即可判断答案是否正确。',
    targetAudience: '零基础或刚开始学习前后端开发的学生', prerequisites: '无需编程基础，会使用鼠标和键盘即可', tags: ['零基础', '前端', '后端', 'JavaScript', 'SQLite', '一关一空'], teachingTeam: ['课程教师'], coverUrl: '',
    modules: ['plan', 'notice', 'lab', 'assignment', 'exam', 'resource', 'analytics', 'class', 'survey', 'discussion', 'knowledge-graph'], visibility: '本单位课程', access: '邀请码或邀请链接', allowExit: true, showContacts: false, allowRoleApplication: true,
    digitalTextbookEnabled: false, digitalTextbookUrl: '', status: '已发布', createdAt, updatedAt: createdAt,
    members: [], classrooms: [{ id: `${PREFIX}classroom`, name: '前后端代码补全教学班', inviteCode: 'WEBFILL-2026', endDate: '2027-07-31', visibility: '私有课堂', access: '邀请码', closed: false, createdAt }],
    sections: [], roleApplications: [], messages: [], assignmentGroups: [], peerReviews: [], gradeAppeals: [], peerReviewTargets: [], submissions: [], surveyResponses: [], attendanceSessions: [], attendanceRecords: [], discussionReplies: [], moduleItems: [],
    lectures, resources, knowledgePoints, stages,
    notices: [{ id: `${PREFIX}notice-welcome`, title: '课程学习说明', description: '本课程面向零基础学生。每关只有一个 __BLANK__：阅读代码上方题目和提示，替换唯一空格，保存后点击自动测试。两项测试通过即可进入下一关，不需要从零编写项目。', status: '已发布', publishedAt: createdAt }],
    assignments: [{ id: `${PREFIX}assignment-reflection`, title: '前后端联调排错报告', type: '图文作业', description: '选择一次实验中的测试失败或联调问题，说明现象、定位过程、根因和修复方法。', requirements: '至少包含一个错误现象、一次验证过程和最终修复说明；不少于 500 字。', submissionInstructions: '在正文中提交，可附终端输出或页面截图。', totalScore: 100, maxAttempts: 2, allowLate: true, attachmentRequired: false, plagiarismCheck: true, peerReview: false, anonymousReview: false, status: '已发布', dueAt: '2027-06-30T15:59:00.000Z' }],
    exams: [{ id: `${PREFIX}exam-core`, title: '前后端开发基础测验', type: '在线考试', description: '检查 HTTP、fetch、服务端校验、SQL 与认证授权基础知识。', totalScore: 95, durationMinutes: 45, maxAttempts: 2, shuffleQuestions: true, showAnswersAfterClose: true, status: '已发布', dueAt: '2027-07-15T15:59:00.000Z', questionRefs: questions().map((item) => ({ questionId: item.id, score: item.defaultScore })), labReferences: [{ labId: `${PREFIX}lab-project`, checkpointId: `${PREFIX}cp-project` }] }],
    discussions: [{ id: `${PREFIX}discussion-security`, title: '为什么前端隐藏按钮不能替代权限控制？', description: '结合实验 6 和实验 8，讨论前端体验限制与服务端安全边界的区别。', status: '已发布', publishedAt: createdAt }],
    surveys: [{ id: `${PREFIX}survey-feedback`, title: '课程学习反馈', description: '收集实验难度、自动测试反馈和终端环境体验。', status: '已发布', anonymous: true, allowResubmit: true, questions: [{ id: `${PREFIX}survey-q1`, type: '单选题', title: '代码留空数量是否合适？', options: ['偏少', '合适', '偏多'], required: true }, { id: `${PREFIX}survey-q2`, type: '文本题', title: '最需要增加的案例或讲解是什么？', options: [], required: false }] }],
  };
}

function preserveRuntimeData(previous, next) {
  if (!previous) return next;
  const operational = ['members', 'classrooms', 'sections', 'roleApplications', 'messages', 'assignmentGroups', 'peerReviews', 'gradeAppeals', 'peerReviewTargets', 'submissions', 'surveyResponses', 'attendanceRecords', 'discussionReplies'];
  const merged = { ...next };
  for (const key of operational) if (Array.isArray(previous[key]) && previous[key].length) merged[key] = previous[key];
  return merged;
}

function mergeFrontendBackendCourse(current) {
  if (!current || Number(current.version) !== 2) throw new Error('平台数据版本必须为 2');
  const previous = (current.courses || []).find((item) => item.id === COURSE_ID);
  const keep = (items) => (Array.isArray(items) ? items : []).filter((item) => !String(item.id || '').startsWith(PREFIX));
  return {
    ...current,
    revision: Math.max(Number(current.revision || 0) + 1, Date.now() * 1000),
    courses: [...keep(current.courses), preserveRuntimeData(previous, course())],
    labs: [...keep(current.labs), ...labs()],
    questionBank: [...keep(current.questionBank), ...questions()],
  };
}

function validate(data) {
  const imported = data.courses.find((item) => item.id === COURSE_ID);
  if (!imported || imported.status !== '已发布') throw new Error('课程未正确导入或未发布');
  if (imported.stages.length !== modules.length || imported.resources.length !== modules.length) throw new Error('课程章节或资源数量不完整');
  const labIds = new Set((data.labs || []).map((item) => item.id));
  const questionIds = new Set((data.questionBank || []).map((item) => item.id));
  for (const stage of imported.stages) if (!labIds.has(stage.labId)) throw new Error(`阶段关联实验不存在：${stage.id}`);
  for (const lab of data.labs.filter((item) => String(item.id || '').startsWith(PREFIX))) {
    if (lab.state !== '已发布' || !lab.repository?.files?.length || !lab.checkpoints?.length) throw new Error(`实验配置不完整：${lab.id}`);
    const editableFiles = lab.repository.files.filter((file) => file.readOnly !== true && file.path !== 'README.md');
    const blankCount = editableFiles.reduce((count, file) => count + (String(file.content || '').match(/__BLANK__/g) || []).length, 0);
    if (editableFiles.length !== 1 || blankCount !== 1) throw new Error(`实验必须保持一关一个文件一个填空：${lab.id}`);
    const requirementLines = String(lab.checkpoints[0].requirements || '').split('\n').map((item) => item.trim()).filter(Boolean);
    if (requirementLines.length < 5 || !String(lab.checkpoints[0].testDescription || '').trim()) throw new Error(`实验要求或测试说明不完整：${lab.id}`);
    const tests = lab.checkpoints[0].evaluationConfig?.tests || [];
    if (!tests.some((test) => test.visibility === 'public') || !tests.some((test) => test.visibility === 'hidden')) throw new Error(`实验缺少公开或隐藏测试：${lab.id}`);
  }
  for (const reference of imported.exams.flatMap((exam) => exam.questionRefs || [])) if (!questionIds.has(reference.questionId)) throw new Error(`考试引用题目不存在：${reference.questionId}`);
  return data;
}

if (require.main === module) {
  const [, , input, output] = process.argv;
  if (!input || !output) throw new Error('用法：node scripts/import-frontend-backend-course.js <现有数据.json> <输出数据.json>');
  const current = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
  const merged = validate(mergeFrontendBackendCourse(current));
  fs.writeFileSync(path.resolve(output), `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ output: path.resolve(output), courseId: COURSE_ID, stages: modules.length, labs: labs().length, questions: questions().length }, null, 2));
}

module.exports = { COURSE_ID, PREFIX, modules, course, labs, questions, mergeFrontendBackendCourse, validate };
