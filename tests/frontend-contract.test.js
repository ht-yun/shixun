const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('平台对外品牌统一为学生实践平台', () => {
  const portalHtml = read('portal.html');
  const experimentHtml = read('index.html');
  const portal = read('portal.js');
  const experiment = read('app.js');
  const server = read('local-server.js');

  for (const source of [portalHtml, experimentHtml, portal, experiment, server]) {
    assert.match(source, /学生实践平台/);
  }
  assert.doesNotMatch(portalHtml, /CloudLab|云实训/);
  assert.doesNotMatch(experimentHtml, /Welcome to CloudLab|云实训/);
  assert.match(portalHtml, /portal\.js\?v=20261119-1/);
  assert.match(experimentHtml, /app\.js\?v=20261118-2/);
});

test('学生端覆盖方案要求的五个页面与真实实验入口', () => {
  const portal = read('portal.js');
  for (const page of ['studentHome', 'studentLearningPage', 'studentCourseDetailPage', 'studentPracticePage', 'studentGradesPage', 'studentRecordsPage']) {
    assert.match(portal, new RegExp(`function ${page}\\(`));
  }
  assert.match(portal, /location\.href = `index\.html\?\$\{query\}`/);
  assert.match(portal, /records: studentRecordsPage/);
  assert.match(portal, /"student-course": studentCourseDetailPage/);
  assert.match(portal, /view-student-course/);
  assert.match(portal, /student-course-tab/);
  assert.match(portal, /student-data-grid/);
  assert.match(portal, /student-shortcuts/);
  assert.match(portal, /student-course-grid/);
  assert.match(portal, /course-schedule/);
  const styles = read('student-runtime.css');
  assert.match(styles, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});

test('线上自主学习资源可在平台内打开且登录身份固定工作台', () => {
  const portal = read('portal.js');
  const html = read('portal.html');
  const styles = read('student-runtime.css');
  const app = read('app.js');
  assert.match(portal, /function openResourceViewer\(/);
  assert.match(portal, /resource-learning-frame/);
  assert.match(portal, /complete-resource-viewer/);
  assert.doesNotMatch(portal, /window\.open\(resource\.url/);
  assert.match(html, /id="roleSwitch"[^>]*hidden/);
  assert.match(styles, /resource-viewer-modal/);
  assert.match(app, /new URLSearchParams\(\{ page: returnPage \}\)/);
});

test('实验页初始状态不包含虚构成绩、历史、评论或测试通过状态', () => {
  const html = read('index.html');
  const app = read('app.js');
  for (const forbidden of ['林同学', '助教', '今天 14:32', '>100<', '最近一次测试：通过']) {
    assert.equal(html.includes(forbidden), false, `不应包含静态演示内容：${forbidden}`);
  }
  assert.match(html, /id="scorePill"[^>]*>--</);
  assert.match(html, /id="testSummary">尚未运行测试</);
  assert.match(app, /\/api\/student-progress\/events/);
  assert.match(html, /id="terminalHost"/);
  assert.match(html, /vendor\/xterm\.css/);
  assert.match(app, /import\("\.\/vendor\/xterm\.mjs"\)/);
  assert.match(app, /\/api\/terminal\/session/);
  assert.match(app, /X-Terminal-Session/);
  assert.doesNotMatch(html, /网页桌面|desktopHost/);
  assert.doesNotMatch(app, /novnc|connectDesktop|api\/desktop/);
  assert.match(html, /id="backToCourse"/);
  assert.match(app, /function configureBackLink\(/);
  assert.match(app, /returnPage === "student-course"/);
  assert.match(read('portal.js'), /function openLab\(/);
});

test('公网交互终端使用受限 Docker 容器配置', () => {
  const { containerConfig, modeAllowsOwnerWrite } = require(path.join(root, 'terminal-gateway.js'));
  const config = containerConfig('contract-test');
  assert.equal(config.User, '10001:10001');
  assert.equal(config.HostConfig.NetworkMode, 'none');
  assert.equal(config.HostConfig.ReadonlyRootfs, true);
  assert.equal(config.HostConfig.Memory, 256 * 1024 * 1024);
  assert.equal(config.HostConfig.MemorySwap, 256 * 1024 * 1024);
  assert.equal(config.HostConfig.NanoCpus, 250_000_000);
  assert.equal(modeAllowsOwnerWrite('600'), true);
  assert.equal(modeAllowsOwnerWrite('644'), true);
  assert.equal(modeAllowsOwnerWrite('444'), false);
  assert.equal(config.HostConfig.PidsLimit, 64);
  assert.deepEqual(config.HostConfig.CapDrop, ['ALL']);
  assert.match(config.HostConfig.Tmpfs['/home/cloudlab/workspace'], /size=64m/);
  const dockerfile = read('terminal/Dockerfile');
  assert.match(dockerfile, /USER 10001:10001/);
  for (const tool of ['python3', 'openjdk-21-jdk-headless', 'sqlite3']) assert.match(dockerfile, new RegExp(tool));
  assert.doesNotMatch(dockerfile, /x11vnc|pcmanfm|openbox|websockify/);
  assert.doesNotMatch(read('terminal-gateway.js'), /ws\/desktop|initializeDesktop/);
  assert.doesNotMatch(read('terminal-gateway.js'), /&;/);
  const nginx = read('deploy/nginx-cloudlab.conf');
  assert.match(nginx, /location \/ws\/terminal/);
  assert.doesNotMatch(nginx, /location \/ws\/desktop/);
  assert.match(nginx, /proxy_http_version 1\.1/);
  assert.match(nginx, /proxy_set_header Upgrade \$http_upgrade/);
  const service = read('deploy/cloudlab-web.override.conf');
  assert.match(service, /CLOUDLAB_TERMINAL_ENABLED=true/);
  assert.match(service, /CLOUDLAB_TERMINAL_MAX_SESSIONS=10/);
});

test('教师端支持课程、阶段、实验模板及发布管理', () => {
  const portal = read('portal.js');
  for (const action of ['new-course', 'edit-course', 'delete-course', 'new-stage', 'edit-stage', 'delete-stage', 'move-stage-up', 'move-stage-down', 'new-classroom', 'request-public', 'new-lab', 'edit-lab', 'delete-lab', 'toggle-course-publish', 'toggle-lab-publish']) {
    assert.match(portal, new RegExp(action));
  }
  assert.match(portal, /name="category"/);
  assert.match(portal, /name="startDate"/);
  assert.match(portal, /name="labId"/);
  assert.match(portal, /name="builtIn"/);
  assert.match(portal, /name="learningObjectives"/);
  assert.match(portal, /name="content"/);
  assert.match(portal, /查看具体学习内容/);
  assert.match(portal, /name="objectives"/);
  assert.match(portal, /name="passPolicy"/);
  assert.match(portal, /name="passingScore"/);
  assert.match(portal, /name="testVisibility"/);
  assert.match(portal, /name="testRule"/);
  assert.match(portal, /add-reference-answer/);
  assert.match(portal, /add-starter-file/);
  assert.match(portal, /program-output-equals/);
  assert.match(portal, /program-output-contains/);
  assert.match(portal, /最终运行输出（正确答案）/);
  assert.match(portal, /fillBlankAnswer/);
  assert.match(portal, /补全后的完整正确代码/);
  assert.match(portal, /simulate-lab/);
  assert.match(portal, /平台批量注册/);
  assert.match(read('app.js'), /X-Lab-Id/);
  assert.match(read('app.js'), /loadLabConfiguration/);
});

test('前后端入门课程坚持一关一文件一空格并可自动测试', () => {
  const importer = require(path.join(root, 'scripts', 'import-frontend-backend-course.js'));
  const fillLabs = importer.labs();
  assert.equal(fillLabs.length, 8);
  for (const lab of fillLabs) {
    const checkpoint = lab.checkpoints[0];
    assert.ok(String(checkpoint.requirements).split('\n').filter(Boolean).length >= 5, `${lab.name} 的要求应足够详细`);
    assert.match(checkpoint.requirements, /只有一个 __BLANK__/);
    assert.match(checkpoint.requirements, /自动测试/);
    assert.ok(String(checkpoint.testDescription).length >= 20, `${lab.name} 应说明测试范围`);
    const editableFiles = lab.repository.files.filter((file) => !file.readOnly && file.path !== 'README.md');
    assert.equal(editableFiles.length, 1, `${lab.name} 应只有一个可填写代码文件`);
    const file = editableFiles[0];
    assert.equal((file.content.match(/__BLANK__/g) || []).length, 1, `${lab.name} 应只有一个代码空格`);
    assert.match(file.content, /本关题目/);
    assert.match(file.content, /提示：/);
    assert.match(file.content, /自动测试/);
    const readme = lab.repository.files.find((file) => file.path === 'README.md');
    assert.match(readme.content, /只需完成 4 步/);
    assert.match(readme.content, /唯一的 `__BLANK__`/);
    const tests = checkpoint.evaluationConfig.tests;
    assert.equal(tests.length, 2);
    assert.ok(tests.every((item) => item.target === 'verify.sh'));
  }
  const portal = read('portal.js');
  assert.match(portal, /学生实验要求（逐行填写）/);
  assert.match(portal, /此内容会直接展示在学生实验页/);
  assert.match(portal, /代码填空题：/);
  assert.match(portal, /填空答案与提示/);
  assert.match(portal, /data-answer-id/);
  assert.match(read('local-server.js'), /仅教师或管理员可修改教学数据/);
});

test('学生代码保存具有明确状态且评测前会等待最新内容写入', () => {
  const app = read('app.js');
  const server = read('local-server.js');
  const html = read('index.html');
  const styles = read('styles.css');
  assert.match(html, /id="saveFileButton" disabled>等待连接/);
  assert.match(app, /function currentFileIsDirty\(/);
  assert.match(app, /function updateSaveButton\(/);
  assert.match(app, /if \(currentFileIsDirty\(\)\) \{[\s\S]*await saveCurrentFile\(false\);/);
  assert.match(app, /event\.key\.toLowerCase\(\) !== "s"/);
  assert.match(app, /body\.saved !== true/);
  assert.match(app, /fetch\("\/api\/lab\/file", \{ method: "POST"/);
  assert.match(server, /\(req\.method === 'POST' \|\| req\.method === 'PUT'\).*\/api\/lab\/file/);
  assert.match(styles, /\.save-dirty/);
  assert.match(styles, /\.save-error/);
});

test('教师实验模板使用兼容保存并按学生账号展示正式评测成绩', () => {
  const portal = read('portal.js');
  const app = read('app.js');
  const server = read('local-server.js');
  assert.match(portal, /fetch\(`\$\{apiBase\}\/bootstrap\/delta`, \{ method: "POST"/);
  assert.match(portal, /function bootstrapDelta\(payload\)/);
  assert.match(portal, /changedEntities\(payload\.courses, previous\.courses\)/);
  assert.match(portal, /deletedCourseIds: deletedEntityIds/);
  assert.match(portal, /const saveRetryDelays = \[0, 800, 2400\]/);
  assert.match(portal, /const saveResult = await saveStore\(\)/);
  assert.match(portal, /if \(!saveResult\.saved\) return/);
  assert.match(portal, /修改已保存在本机，服务器暂未同步/);
  assert.match(server, /\(req\.method === 'POST' \|\| req\.method === 'PUT'\).*\/api\/bootstrap/);
  assert.match(server, /req\.method === 'POST'.*\/api\/bootstrap\/delta/);
  assert.match(server, /function recordVerifiedLabEvaluation\(/);
  assert.match(server, /report\.progressRecorded = true/);
  assert.match(app, /formal && report\.progressRecorded === true && report\.studentProgress/);
  assert.match(app, /autoTestButton"\)\.addEventListener\("click", \(\) => runTest\(true/);
  assert.match(portal, /store\.studentProgressByAccount = data\.studentProgressByAccount/);
  assert.match(portal, /按学生账号区分平时成绩和考试成绩/);
  assert.match(portal, /const sourceGradeRecords = Array\.isArray\(progress\.gradeRecords\)/);
  assert.match(portal, /function gradeTypeLabel\(value\)/);
  assert.match(portal, /function studentIdentity\(accountId, course, gradeRecord = \{\}\)/);
  assert.match(portal, /store\.studentDirectory\.find/);
  assert.match(server, /gradeType = exam \? 'exam' : 'regular'/);
  assert.match(server, /progress\.gradeRecords\.unshift/);
  assert.match(server, /studentNameSnapshot/);
  assert.match(server, /studentDirectory/);
  assert.match(portal, /data-course-id="\$\{esc\(course\.id\)\}"/);
});

test('多语言程序输出规则与实验产物参与真实评测', async () => {
  const { evaluateConfiguredTests, status } = require(path.join(root, 'terminal-gateway.js'));
  assert.deepEqual(status().capabilities.platforms, ['Linux', 'Python', 'Java', '数据库']);
  assert.ok(status().capabilities.tools.includes('node'));
  assert.equal(status().capabilities.fileEditor, true);
  assert.equal(status().capabilities.webDesktop, false);
  const lab = {
    techPlatform: 'Python',
    evaluationConfig: {
      passPolicy: 'all-required',
      outputType: '图形效果',
      studentFiles: ['result.svg'],
      tests: [{ id: 'output', name: '程序输出', visibility: 'public', ruleType: 'program-output-contains', target: 'main.py', expected: 'hello', weight: 100, required: true }],
    },
  };
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64');
  const report = await evaluateConfiguredTests(async (script) => {
    if (script.includes("python3 'main.py'")) return { code: 0, stdout: 'hello CloudLab\n', stderr: '' };
    if (script.includes("'result.svg'")) return { code: 0, stdout: svg, stderr: '' };
    return { code: 1, stdout: '', stderr: 'unexpected' };
  }, lab, true);
  assert.equal(report.passed, true);
  assert.equal(report.score, 100);
  assert.equal(report.artifacts.length, 1);
  assert.equal(report.artifacts[0].mimeType, 'image/svg+xml');
});

test('教师课堂覆盖成员、讲次、资源、教学活动和真实统计闭环', () => {
  const portal = read('portal.js');
  const server = read('local-server.js');
  const app = read('app.js');
  for (const fn of ['membersPanel', 'teachingPlanPanel', 'resourcesPanel', 'activitiesPanel', 'analyticsPanel', 'knowledgePanel', 'moduleToolsPanel', 'submissionsPanel', 'lectureForm', 'memberForm', 'resourceForm', 'activityForm', 'knowledgeForm', 'moduleItemForm', 'submissionForm', 'gradeSubmissionForm', 'updateResourceProgress']) {
    assert.match(portal, new RegExp(`function ${fn}\\(`));
  }
  for (const action of ['new-member', 'edit-member', 'delete-member', 'new-lecture', 'edit-lecture', 'delete-lecture', 'new-resource', 'edit-resource', 'toggle-resource-publish', 'new-activity', 'toggle-activity-publish', 'new-knowledge', 'new-module-item', 'toggle-module-item-publish', 'complete-resource', 'submit-activity', 'grade-submission', 'course-workspace-tab']) {
    assert.match(portal, new RegExp(action));
  }
  for (const interaction of ['module-filter', 'select-all-modules', 'clear-modules', 'selectedModuleCount', 'selectedModuleTags']) {
    assert.match(portal, new RegExp(interaction));
  }
  assert.match(portal, /resourceProgress/);
  assert.match(server, /\/api\/student-progress\/resources/);
  assert.match(server, /\/api\/submissions/);
  assert.match(server, /\/api\/submissions\/grade/);
  assert.match(server, /\/api\/lab\/files/);
  assert.match(server, /\/api\/lab\/file/);
  assert.match(portal, /initialFiles/);
  assert.match(portal, /add-starter-file/);
  assert.match(app, /loadWorkspaceFiles/);
  assert.match(app, /saveCurrentFile/);
  assert.match(server, /course\.assignments/);
});

test('教师配置的公开与隐藏测试真实参与安全评测', async () => {
  const { evaluateConfiguredTests } = require(path.join(root, 'terminal-gateway.js'));
  const lab = {
    maxExecutionSeconds: 8,
    evaluationConfig: {
      passPolicy: 'score-threshold',
      passingScore: 80,
      tests: [
        { id: 'public-file', name: '文件存在', visibility: 'public', ruleType: 'file-exists', target: 'notes.txt', expected: '文件存在', weight: 50, required: true },
        { id: 'hidden-mode', name: '权限正确', visibility: 'hidden', ruleType: 'file-mode', target: 'notes.txt', expected: '600', weight: 50, required: true },
      ],
    },
  };
  const executor = async (script) => {
    if (script.includes("if [ -f 'notes.txt' ]")) return { code: 0, stdout: 'exists', stderr: '' };
    if (script.includes('stat -c %a')) return { code: 0, stdout: '600\n', stderr: '' };
    return { code: 0, stdout: '/home/cloudlab/workspace\n', stderr: '' };
  };
  const practice = await evaluateConfiguredTests(executor, lab, false);
  assert.equal(practice.checks.length, 1);
  assert.equal(practice.checks[0].visibility, 'public');
  const formal = await evaluateConfiguredTests(executor, lab, true);
  assert.equal(formal.checks.length, 2);
  assert.equal(formal.score, 100);
  assert.equal(formal.passed, true);
});

test('管理控制台展示真实运行状态、资源池、权限和平台配置', () => {
  const portal = read('portal.js');
  const html = read('portal.html');
  const styles = read('admin-runtime.css');
  for (const page of ['adminOverviewPage', 'adminResourcesPage', 'adminUsersPage', 'adminSettingsPage']) {
    assert.match(portal, new RegExp(`function ${page}\\(`));
  }
  assert.match(portal, /\/terminal\/status/);
  assert.match(portal, /\/cloud\/adapter-status/);
  assert.match(portal, /refresh-admin-runtime/);
  assert.match(html, /admin-runtime\.css/);
  assert.match(html, /id="platformStatus"/);
  assert.match(styles, /\.admin-runtime-grid/);
  assert.doesNotMatch(portal, /function adminPage\(/);
});

test('教师模拟实战可检查代码文件且学生权限不被放宽', () => {
  const portal = read('portal.js');
  const app = read('app.js');
  const server = read('local-server.js');
  assert.match(portal, /openLab\(lab\.id, \{ teacherPreview: true \}\)/);
  assert.match(app, /function isTeacherPreview\(\)/);
  assert.match(app, /!teacherPreview && lab\.mode === "仅命令行"/);
  assert.doesNotMatch(app, /网页桌面|api\/desktop/);
  assert.doesNotMatch(server, /api\/desktop/);
});

test('题目创建默认四个可增删选项并按题型精简字段', () => {
  const portal = read('portal.js');
  const styles = read('portal.css');
  assert.match(portal, /Array\.from\(\{ length: 4 \}/);
  assert.match(portal, /function questionOptionRow\(/);
  assert.match(portal, /function questionAnswerEditor\(/);
  assert.match(portal, /add-question-option/);
  assert.match(portal, /remove-question-option/);
  assert.match(portal, /选择题至少保留两个选项/);
  assert.match(portal, /name="questionCorrectOption"/);
  assert.match(portal, /questionType.*refreshQuestionAnswerEditor/);
  assert.doesNotMatch(portal.match(/function questionForm\([\s\S]*?\n}\n/)[0], /name="(?:courseId|scope|tags)"/);
  assert.match(styles, /\.question-option-row/);
  assert.match(styles, /\.question-answer-choice/);
});

test('作业创建要求填写完整任务并在学生端展示', () => {
  const portal = read('portal.js');
  const styles = read('portal.css');
  assert.match(portal, /<label>作业内容 \*<\/label><textarea name="description" required/);
  assert.match(portal, /name="requirements"/);
  assert.match(portal, /name="submissionInstructions"/);
  assert.match(portal, /name="assignmentFile"/);
  assert.match(portal, /name="referenceUrl"/);
  assert.match(portal, /请先编辑并填写作业内容，再发布作业/);
  assert.match(portal, /assignmentAttachmentUrl/);
  assert.match(portal, /assignmentAttachmentDownloadUrl/);
  assert.match(read('local-server.js'), /assignments\\\/\(\[\^\/\]\+\)\\\/attachment/);
  assert.match(portal, /class="assignment-task-details"/);
  assert.match(styles, /\.assignment-authoring/);
  assert.match(styles, /\.assignment-task-details/);
});

test('实验模板提供步骤引导、常用预设和保存前校验', () => {
  const portal = read('portal.js');
  const styles = read('portal.css');
  assert.match(portal, /function labPreset\(/);
  assert.match(portal, /Linux 命令实验/);
  assert.match(portal, /Python 编程实验/);
  assert.doesNotMatch(portal, /网页桌面实验/);
  assert.match(portal, /第 1 步[\s\S]*实验基本信息/);
  assert.match(portal, /第 2 步[\s\S]*准备代码仓库/);
  assert.match(portal, /第 3 步[\s\S]*设计关卡与通过标准/);
  assert.match(portal, /apply-lab-preset/);
  assert.match(portal, /jump-lab-section/);
  assert.match(portal, /function reportLabFormIssue\(/);
  assert.match(portal, /至少需要一条有名称的自动测试/);
  assert.match(styles, /\.lab-quick-start/);
  assert.match(styles, /\.lab-preset-grid/);
});
