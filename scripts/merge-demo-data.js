/* 将一套可重复导入的完整演示教学数据追加到现有平台数据。 */
const fs = require('fs');
const path = require('path');

const DEMO_PREFIX = 'demo-';
const now = '2026-11-05T09:00:00.000Z';

function evaluation(id, tests, options = {}) {
  return {
    passPolicy: options.passPolicy || 'score-threshold',
    scoringRule: options.scoringRule || 'weighted',
    passingScore: options.passingScore || 80,
    whitespacePolicy: options.whitespacePolicy || 'trim-lines',
    caseSensitive: options.caseSensitive !== false,
    studentFiles: options.studentFiles || [],
    executionFile: '平台内置安全评测器',
    outputType: '文本结果',
    tests: tests.map((test, index) => ({ id: `${id}-test-${index + 1}`, weight: 50, required: true, ...test })),
    referenceAnswers: options.referenceAnswers || [],
  };
}

function checkpoint(id, name, values) {
  return {
    id,
    name,
    difficulty: values.difficulty || '初级',
    rewardExperience: values.rewardExperience || 50,
    maxExecutionSeconds: values.maxExecutionSeconds || 8,
    objectives: values.objectives,
    description: values.description,
    knowledge: values.knowledge,
    requirements: values.requirements,
    testDescription: values.testDescription,
    evaluationConfig: values.evaluationConfig,
  };
}

function labs() {
  return [
    {
      id: 'demo-lab-linux-permissions',
      name: 'Linux 文件与权限综合实践（演示）',
      mode: '代码 + 命令行',
      duration: 60,
      builtIn: 'linux-permissions',
      techPlatform: 'Linux',
      language: 'Bash',
      publicScope: '本单位可用',
      skillTags: ['Linux', 'Shell', '文件权限'],
      state: '已发布',
      repository: {
        branch: 'main',
        defaultBranch: 'main',
        commitMessage: '初始化 Linux 权限演示实验',
        files: [
          { path: 'README.md', readOnly: true, content: '# Linux 文件与权限综合实践\n\n依次完成文件创建、内容写入和权限设置，并使用自动评测检查结果。\n' },
          { path: 'workspace/.gitkeep', readOnly: false, content: '' },
        ],
      },
      checkpoints: [
        checkpoint('demo-linux-cp-1', '创建并编辑实验文件', {
          objectives: '掌握 pwd、touch、echo、cat 等常用命令，能够在指定目录创建并检查文件。',
          description: '在工作目录创建 notes.txt，写入“Hello CloudLab”，并确认文件内容。',
          knowledge: 'Linux 工作目录、文件创建、标准输出重定向与文件查看。',
          requirements: '创建 notes.txt\n写入 Hello CloudLab\n使用 cat 查看文件内容',
          testDescription: '公开测试检查文件是否存在，隐藏测试检查文件内容。',
          evaluationConfig: evaluation('demo-linux-cp-1', [
            { name: 'notes.txt 文件存在', visibility: 'public', ruleType: 'file-exists', target: 'notes.txt', expected: '文件存在' },
            { name: '文件内容正确', visibility: 'hidden', ruleType: 'file-content-contains', target: 'notes.txt', expected: 'Hello CloudLab' },
          ], { studentFiles: ['notes.txt'], referenceAnswers: [{ id: 'demo-linux-hint-1', name: '命令提示', content: "echo 'Hello CloudLab' > notes.txt", deductionPercent: 15 }] }),
        }),
        checkpoint('demo-linux-cp-2', '设置并验证文件权限', {
          difficulty: '中级',
          rewardExperience: 80,
          objectives: '理解 Linux 权限位，能够使用 chmod 和 stat 设置、验证文件权限。',
          description: '将 notes.txt 权限设置为仅文件所有者可读写，并输出权限信息。',
          knowledge: 'rwx 权限、八进制权限表示、chmod 与 stat。',
          requirements: '将 notes.txt 权限设置为 600\n使用 stat 检查权限\n保留第一关写入的文件内容',
          testDescription: '公开测试检查文件，隐藏测试检查权限值与原始内容。',
          evaluationConfig: evaluation('demo-linux-cp-2', [
            { name: '实验文件存在', visibility: 'public', ruleType: 'file-exists', target: 'notes.txt', expected: '文件存在', weight: 30 },
            { name: '权限设置为 600', visibility: 'hidden', ruleType: 'file-mode', target: 'notes.txt', expected: '600', weight: 70 },
          ], { studentFiles: ['notes.txt'], passingScore: 100, referenceAnswers: [{ id: 'demo-linux-hint-2', name: '权限提示', content: 'chmod 600 notes.txt\nstat -c "%a %n" notes.txt', deductionPercent: 20 }] }),
        }),
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-lab-python-analysis',
      name: 'Python 成绩数据分析（演示）',
      mode: '代码 + 命令行',
      duration: 90,
      builtIn: 'linux-permissions',
      techPlatform: 'Python',
      language: 'Python 3',
      publicScope: '本单位可用',
      skillTags: ['Python', 'CSV', '数据分析'],
      state: '已发布',
      repository: {
        branch: 'main',
        defaultBranch: 'main',
        commitMessage: '初始化 Python 数据分析演示实验',
        files: [
          { path: 'README.md', readOnly: true, content: '# 成绩数据分析\n\n读取 data/scores.csv，计算平均分并输出最高分学生。\n' },
          { path: 'data/scores.csv', readOnly: true, content: 'name,score\n张同学,86\n李同学,92\n王同学,78\n赵同学,75\n' },
          { path: 'main.py', readOnly: false, content: "import csv\n\n# TODO: 读取 data/scores.csv 并输出平均分和最高分学生\n" },
        ],
      },
      checkpoints: [
        checkpoint('demo-python-cp-1', '读取 CSV 并生成统计结果', {
          difficulty: '中级',
          rewardExperience: 100,
          maxExecutionSeconds: 15,
          objectives: '掌握 CSV 文件读取、列表统计和格式化输出。',
          description: '补全 main.py，读取成绩文件并输出“平均分：82.75”和“最高分：李同学 92”。',
          knowledge: 'csv 模块、with 语句、数值转换、max 和平均值。',
          requirements: '不得修改原始数据文件\n平均分保留两位小数\n按指定中文格式输出两行结果',
          testDescription: '公开测试检查平均分，隐藏测试检查最高分结果。',
          evaluationConfig: evaluation('demo-python-cp-1', [
            { name: '平均分计算正确', visibility: 'public', ruleType: 'program-output-contains', target: 'main.py', expected: '平均分：82.75' },
            { name: '最高分学生正确', visibility: 'hidden', ruleType: 'program-output-contains', target: 'main.py', expected: '最高分：李同学 92' },
          ], { studentFiles: ['main.py'], referenceAnswers: [{ id: 'demo-python-hint-1', name: '读取提示', content: "使用 csv.DictReader 读取 name 和 score 字段。", deductionPercent: 10 }] }),
        }),
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-lab-web-desktop',
      name: 'Linux 网页桌面文件管理（演示）',
      mode: '网页桌面',
      duration: 45,
      builtIn: 'linux-permissions',
      techPlatform: 'Linux',
      language: 'Linux 桌面',
      publicScope: '本单位可用',
      skillTags: ['Linux', '网页桌面', '文件管理'],
      state: '已发布',
      repository: { branch: 'main', defaultBranch: 'main', commitMessage: '初始化网页桌面演示实验', files: [{ path: 'README.md', readOnly: true, content: '# 网页桌面文件管理\n\n进入网页桌面，使用文件管理器和终端完成 report.txt。\n' }] },
      checkpoints: [checkpoint('demo-desktop-cp-1', '使用桌面和终端管理文件', {
        objectives: '能够进入网页桌面，使用图形化文件管理器和终端完成基础文件操作。',
        description: '在工作目录创建 report.txt，并写入“桌面实验已完成”。',
        knowledge: '网页桌面、文件管理器、终端和工作目录。',
        requirements: '打开网页桌面\n创建 report.txt\n写入指定内容并保存',
        testDescription: '自动检查文件是否存在及内容是否正确。',
        evaluationConfig: evaluation('demo-desktop-cp-1', [
          { name: '报告文件存在', visibility: 'public', ruleType: 'file-exists', target: 'report.txt', expected: '文件存在' },
          { name: '报告内容正确', visibility: 'hidden', ruleType: 'file-content-contains', target: 'report.txt', expected: '桌面实验已完成' },
        ], { studentFiles: ['report.txt'] }),
      })],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function questions() {
  return [
    { id: 'demo-question-linux-1', courseId: 'demo-course-linux', type: '单选题', difficulty: '简单', stem: '查看当前工作目录应使用哪个命令？', options: [{ key: 'A', text: 'pwd' }, { key: 'B', text: 'mkdir' }, { key: 'C', text: 'chmod' }, { key: 'D', text: 'touch' }], answers: ['A'], explanation: 'pwd 用于输出当前工作目录。', defaultScore: 10 },
    { id: 'demo-question-linux-2', courseId: 'demo-course-linux', type: '多选题', difficulty: '中等', stem: '下列哪些命令可以查看文本文件内容？', options: [{ key: 'A', text: 'cat' }, { key: 'B', text: 'head' }, { key: 'C', text: 'tail' }, { key: 'D', text: 'chmod' }], answers: ['A', 'B', 'C'], explanation: 'cat、head、tail 均可查看文件内容。', defaultScore: 15 },
    { id: 'demo-question-linux-3', courseId: 'demo-course-linux', type: '判断题', difficulty: '简单', stem: 'chmod 600 notes.txt 表示只有文件所有者具有读写权限。', options: [{ key: 'A', text: '正确' }, { key: 'B', text: '错误' }], answers: ['A'], explanation: '6 代表读写，后两个 0 表示组用户和其他用户无权限。', defaultScore: 10 },
    { id: 'demo-question-linux-4', courseId: 'demo-course-linux', type: '填空题', difficulty: '简单', stem: '创建空文件 notes.txt 的命令是 ______。', options: [], answers: ['touch notes.txt'], explanation: 'touch 可创建空文件或更新时间戳。', defaultScore: 15 },
    { id: 'demo-question-linux-5', courseId: 'demo-course-linux', type: '简答题', difficulty: '中等', stem: '简述最小权限原则，并举例说明它在 Linux 文件权限中的应用。', options: [], answers: ['仅授予完成任务所必需的最少权限。'], explanation: '主观题由教师结合要点评阅。', defaultScore: 20 },
    { id: 'demo-question-python-1', courseId: 'demo-course-python', type: '单选题', difficulty: '简单', stem: 'Python 标准库中用于读取 CSV 文件的模块是？', options: [{ key: 'A', text: 'csv' }, { key: 'B', text: 'math' }, { key: 'C', text: 'jsonpath' }, { key: 'D', text: 'sqlite' }], answers: ['A'], explanation: 'csv 是 Python 标准库模块。', defaultScore: 20 },
    { id: 'demo-question-python-2', courseId: 'demo-course-python', type: '判断题', difficulty: '简单', stem: '使用 with open(...) 可以在代码块结束时自动关闭文件。', options: [{ key: 'A', text: '正确' }, { key: 'B', text: '错误' }], answers: ['A'], explanation: '上下文管理器会负责关闭文件。', defaultScore: 20 },
  ].map((item) => ({ ...item, createdAt: now, updatedAt: now }));
}

function emptyCollections() {
  return { roleApplications: [], messages: [], assignmentGroups: [], moduleItems: [], peerReviews: [], gradeAppeals: [], peerReviewTargets: [] };
}

function courses() {
  const members = [
    { id: 'demo-member-1', accountId: 'demo-student-1', identifier: '20260001', name: '张同学', role: '学生', status: '正常', joinedAt: '2026-09-01T01:00:00.000Z' },
    { id: 'demo-member-2', accountId: 'demo-student-2', identifier: '20260002', name: '李同学', role: '学生', status: '正常', joinedAt: '2026-09-01T01:05:00.000Z' },
    { id: 'demo-member-3', accountId: 'demo-student-3', identifier: '20260003', name: '王同学', role: '学生', status: '正常', joinedAt: '2026-09-01T01:10:00.000Z' },
  ];
  const linux = {
    ...emptyCollections(),
    id: 'demo-course-linux', name: 'Linux 系统与云计算基础（演示）', code: 'DEMO-LINUX-2026', category: '计算机与信息技术', difficulty: '初级', language: '中文', institution: 'CloudLab 演示学院', term: '2026 秋季', startDate: '2026-09-01', endDate: '2027-01-15', totalHours: 48, credits: 3,
    learningObjectives: '掌握 Linux 文件、权限和 Shell 基础；能够在隔离终端与网页桌面中完成真实操作；理解自动评测流程。',
    summary: '用于展示课程建设、教学计划、实验、资源、作业、考试、讨论和教学统计的完整示例课程。', targetAudience: '计算机类专业一年级学生', prerequisites: '具备基本计算机操作能力', tags: ['Linux', 'Shell', '云计算'], teachingTeam: ['演示教师'], coverUrl: '',
    modules: ['plan', 'notice', 'lab', 'assignment', 'exam', 'resource', 'analytics', 'class', 'survey', 'attendance', 'discussion', 'knowledge-graph'], visibility: '公开课程', access: '邀请码或邀请链接', allowExit: true, showContacts: false, allowRoleApplication: true, digitalTextbookEnabled: false, digitalTextbookUrl: '', status: '已发布', createdAt: now, updatedAt: now,
    members,
    classrooms: [{ id: 'demo-classroom-linux', name: 'Linux 基础教学班', inviteCode: 'LINUX-DEMO', endDate: '2027-01-20', visibility: '公开课堂', closed: false, createdAt: now }],
    knowledgePoints: [
      { id: 'demo-kp-linux-1', name: 'Linux 文件系统', code: 'KP-LINUX-01', description: '目录结构、路径与文件操作。' },
      { id: 'demo-kp-linux-2', name: 'Linux 权限管理', code: 'KP-LINUX-02', description: '用户、用户组、rwx 权限和 chmod。', prerequisiteId: 'demo-kp-linux-1' },
      { id: 'demo-kp-linux-3', name: 'Shell 基础', code: 'KP-LINUX-03', description: '命令组合、重定向和脚本基础。', prerequisiteId: 'demo-kp-linux-1' },
    ],
    lectures: [
      { id: 'demo-lecture-linux-1', name: '第 1 讲 Linux 与命令行', mode: '线上线下混合', description: '认识实验环境，完成文件创建。' },
      { id: 'demo-lecture-linux-2', name: '第 2 讲 用户与文件权限', mode: '线上线下混合', description: '理解并实践权限模型。' },
      { id: 'demo-lecture-linux-3', name: '第 3 讲 Linux 网页桌面', mode: '线上实验', description: '使用图形桌面完成文件管理。' },
    ],
    resources: [
      { id: 'demo-resource-linux-guide', name: '课程导学与实验须知', type: '教学资料', directory: '课程导学', subtasks: 1, description: '介绍课程安排、实验规范和评测方式。', status: '已发布', version: 1, createdAt: now },
      { id: 'demo-resource-linux-permission', name: 'Linux 权限速查表', type: '教学资料', directory: '第 2 讲', subtasks: 1, description: 'rwx 与八进制权限对应关系。', status: '已发布', version: 1, createdAt: now },
      { id: 'demo-resource-linux-video', name: '终端与网页桌面操作演示', type: '教学资料', directory: '第 3 讲', subtasks: 1, description: '演示命令行与图形桌面的协同操作。', externalUrl: 'https://example.com/cloudlab-demo', status: '已发布', version: 1, createdAt: now },
    ],
    stages: [
      { id: 'demo-stage-linux-1', name: '第一章 Linux 入门', type: '实践项目', description: '熟悉工作目录与文件命令。', objectives: '能够创建、查看和修改文件。', content: '一、认识实验环境\n进入终端后使用 pwd 查看当前目录，使用 ls -la 查看目录中的文件。\n\n二、完成文件操作\n依次练习 touch、echo 和 cat 命令，理解相对路径与绝对路径的区别。\n\n三、进入实践\n阅读课程导学后，进入关联实验完成第一关。', labId: 'demo-lab-linux-permissions', lectureId: 'demo-lecture-linux-1', resourceIds: ['demo-resource-linux-guide'], knowledgePointIds: ['demo-kp-linux-1'], unlockRule: '直接开放', estimatedMinutes: 60, visibility: '学生可见', order: 1 },
      { id: 'demo-stage-linux-2', name: '第二章 文件权限管理', type: '实践项目', description: '使用 chmod 和 stat 管理权限。', objectives: '理解权限位并完成自动评测。', content: '一、权限模型\nLinux 使用读（r）、写（w）、执行（x）描述文件所有者、所属组和其他用户的权限。\n\n二、八进制表示\n读、写、执行分别对应 4、2、1；600 表示所有者可读写，其他用户无权限。\n\n三、操作要求\n使用 chmod 修改权限，再使用 stat -c "%a %n" 文件名检查结果。', labId: 'demo-lab-linux-permissions', lectureId: 'demo-lecture-linux-2', resourceIds: ['demo-resource-linux-permission'], knowledgePointIds: ['demo-kp-linux-2'], unlockRule: '顺序解锁', estimatedMinutes: 90, visibility: '学生可见', order: 2 },
      { id: 'demo-stage-linux-3', name: '第三章 网页桌面实践', type: '实践项目', description: '在图形化桌面中完成文件管理。', objectives: '掌握网页桌面和终端协同操作。', content: '本阶段需要切换到“网页桌面”，使用文件管理器创建并编辑文件，再打开终端验证文件位置和内容。\n\n遇到桌面未连接时，可先查看接入状态，确认图形桌面服务已启动。', labId: 'demo-lab-web-desktop', lectureId: 'demo-lecture-linux-3', resourceIds: ['demo-resource-linux-video'], knowledgePointIds: ['demo-kp-linux-3'], unlockRule: '顺序解锁', estimatedMinutes: 45, visibility: '学生可见', order: 3 },
    ],
    notices: [{ id: 'demo-notice-linux-1', title: '欢迎进入 Linux 演示课程', description: '请先阅读课程导学，再按顺序完成三个学习阶段。', status: '已发布', publishedAt: '2026-09-01T00:00:00.000Z' }],
    assignments: [{ id: 'demo-assignment-linux-1', title: 'Linux 权限应用分析', type: '图文作业', description: '选择一个真实文件权限场景，说明用户、用户组和其他用户应该拥有的权限。', requirements: '不少于 500 字；包含权限设计表；给出 chmod 命令并解释。', submissionInstructions: '在文本框提交报告，并附上实验截图或作品地址。', totalScore: 100, maxAttempts: 3, allowLate: true, attachmentRequired: false, plagiarismCheck: true, peerReview: false, status: '已发布', dueAt: '2026-12-15T15:59:00.000Z' }],
    exams: [{ id: 'demo-exam-linux-1', title: 'Linux 基础单元测验', type: '在线考试', description: '包含客观题、简答题和实验实操题。', totalScore: 100, durationMinutes: 60, maxAttempts: 2, shuffleQuestions: true, showAnswersAfterClose: true, status: '已发布', dueAt: '2026-12-20T15:59:00.000Z', questionRefs: [{ questionId: 'demo-question-linux-1', score: 10 }, { questionId: 'demo-question-linux-2', score: 15 }, { questionId: 'demo-question-linux-3', score: 10 }, { questionId: 'demo-question-linux-4', score: 15 }, { questionId: 'demo-question-linux-5', score: 20 }], labReferences: [{ labId: 'demo-lab-linux-permissions', checkpointId: 'demo-linux-cp-2' }] }],
    discussions: [{ id: 'demo-discussion-linux-1', title: '为什么生产服务器不建议使用 777 权限？', description: '结合最小权限原则讨论 chmod 777 的风险，并给出更合理的权限方案。', status: '已发布', publishedAt: now }],
    discussionReplies: [{ id: 'demo-reply-linux-1', discussionId: 'demo-discussion-linux-1', studentId: 'demo-student-1', studentName: '张同学', content: '777 会给所有用户写权限，容易造成文件被误改或恶意篡改，应按角色授予必要权限。', createdAt: '2026-11-03T02:00:00.000Z' }],
    attendanceSessions: [{ id: 'demo-attendance-linux-1', title: '第 2 讲课堂签到', scheduledAt: '2026-11-05T01:00:00.000Z', description: '课程开始后 15 分钟内签到。', code: '110501', status: '已结束' }],
    attendanceRecords: [{ id: 'demo-attendance-record-1', sessionId: 'demo-attendance-linux-1', studentId: 'demo-student-1', studentName: '张同学', status: '已签到', signedAt: '2026-11-05T01:03:00.000Z' }, { id: 'demo-attendance-record-2', sessionId: 'demo-attendance-linux-1', studentId: 'demo-student-2', studentName: '李同学', status: '已签到', signedAt: '2026-11-05T01:05:00.000Z' }],
    surveys: [{ id: 'demo-survey-linux-1', title: '课程学习体验调查', description: '帮助教师改进实验设计。', status: '已发布', anonymous: true, allowResubmit: true, questions: [{ id: 'demo-survey-q1', type: '单选题', title: '目前课程难度如何？', options: ['偏简单', '适中', '偏困难'], required: true }, { id: 'demo-survey-q2', type: '文本题', title: '你最希望增加哪类实验？', options: [], required: false }] }],
    surveyResponses: [{ id: 'demo-survey-response-1', surveyId: 'demo-survey-linux-1', studentId: 'demo-student-1', answers: { 'demo-survey-q1': '适中', 'demo-survey-q2': '希望增加 Shell 脚本实验。' }, submittedAt: '2026-11-04T08:00:00.000Z' }],
    submissions: [
      { id: 'demo-submission-linux-1', courseId: 'demo-course-linux', activityId: 'demo-assignment-linux-1', kind: 'assignment', studentId: 'demo-student-1', studentName: '张同学', content: '以共享目录为例，目录所有者需要读写执行权限，同组成员需要读和执行权限，其他用户不授予权限，可设置为 750。', attachmentUrl: '', status: '已批阅', attemptCount: 1, similarity: 8, score: 92, feedback: '场景明确，权限设计合理；可继续补充用户组配置过程。', submittedAt: '2026-11-02T12:00:00.000Z', gradedAt: '2026-11-03T02:00:00.000Z' },
      { id: 'demo-submission-linux-2', courseId: 'demo-course-linux', activityId: 'demo-assignment-linux-1', kind: 'assignment', studentId: 'demo-student-2', studentName: '李同学', content: '分析 Web 服务配置文件权限，建议所有者可读写、运行用户只读、其他用户无权限。', attachmentUrl: '', status: '待批阅', attemptCount: 1, similarity: 5, score: null, feedback: '', submittedAt: '2026-11-04T10:30:00.000Z' },
    ],
  };
  const python = {
    ...emptyCollections(),
    id: 'demo-course-python', name: 'Python 数据分析入门（演示）', code: 'DEMO-PYTHON-2026', category: '计算机与信息技术', difficulty: '初级', language: '中文', institution: 'CloudLab 演示学院', term: '2026 秋季', startDate: '2026-09-15', endDate: '2027-01-10', totalHours: 32, credits: 2,
    learningObjectives: '掌握 Python 文件处理与基础数据统计，能够完成可自动评测的数据分析程序。', summary: '以小型成绩数据集为主线，展示代码仓库、编程实验、题库与在线考试。', targetAudience: '具有基础程序设计能力的学生', prerequisites: '了解变量、条件和循环', tags: ['Python', '数据分析'], teachingTeam: ['演示教师'], coverUrl: '', modules: ['plan', 'notice', 'lab', 'assignment', 'exam', 'resource', 'analytics', 'discussion'], visibility: '公开课程', access: '邀请码或邀请链接', allowExit: true, showContacts: false, allowRoleApplication: false, digitalTextbookEnabled: false, status: '已发布', createdAt: now, updatedAt: now,
    members: members.slice(0, 2), classrooms: [{ id: 'demo-classroom-python', name: 'Python 数据分析教学班', inviteCode: 'PY-DEMO', endDate: '2027-01-15', visibility: '公开课堂', closed: false, createdAt: now }],
    knowledgePoints: [{ id: 'demo-kp-python-1', name: 'CSV 文件处理', code: 'KP-PY-01', description: '使用 csv 模块读取结构化文本数据。' }, { id: 'demo-kp-python-2', name: '基础统计', code: 'KP-PY-02', description: '平均值、最大值与格式化输出。', prerequisiteId: 'demo-kp-python-1' }],
    lectures: [{ id: 'demo-lecture-python-1', name: '第 1 讲 Python 文件处理', mode: '线上线下混合', description: '读取 CSV 并理解数据字段。' }, { id: 'demo-lecture-python-2', name: '第 2 讲 数据统计实践', mode: '线上实验', description: '完成平均分和最高分统计。' }],
    resources: [{ id: 'demo-resource-python-guide', name: 'Python CSV 学习指南', type: '教学资料', directory: '课程资料', subtasks: 1, description: 'csv.DictReader 使用示例与常见错误。', status: '已发布', version: 1, createdAt: now }],
    stages: [{ id: 'demo-stage-python-1', name: '第一章 CSV 数据读取', type: '教学内容', description: '认识 CSV 结构并读取数据。', objectives: '能够遍历每条成绩记录。', content: 'CSV 使用逗号分隔字段，第一行通常是字段名。使用 with open(..., encoding="utf-8") 打开文件，再通过 csv.DictReader 按字段名读取每一行。', labId: '', lectureId: 'demo-lecture-python-1', resourceIds: ['demo-resource-python-guide'], knowledgePointIds: ['demo-kp-python-1'], unlockRule: '直接开放', estimatedMinutes: 45, visibility: '学生可见', order: 1 }, { id: 'demo-stage-python-2', name: '第二章 成绩统计实践', type: '实践项目', description: '完成可自动评测的 Python 程序。', objectives: '正确计算平均分和最高分。', content: '先把 score 字段转换为数值，再计算总分、平均分和最高分。输出必须与任务要求一致，并注意平均分保留两位小数。', labId: 'demo-lab-python-analysis', lectureId: 'demo-lecture-python-2', resourceIds: [], knowledgePointIds: ['demo-kp-python-2'], unlockRule: '顺序解锁', estimatedMinutes: 90, visibility: '学生可见', order: 2 }],
    notices: [{ id: 'demo-notice-python-1', title: 'Python 演示课程已开放', description: '先阅读 CSV 指南，再进入成绩分析实验。', status: '已发布', publishedAt: now }],
    assignments: [{ id: 'demo-assignment-python-1', title: '扩展成绩分析程序', type: '编程作业', description: '在课程实验基础上增加及格率统计和成绩等级分布。', requirements: '输出及格率；输出优秀、良好、中等、及格、不及格人数；代码结构清晰。', submissionInstructions: '提交代码仓库地址，并在正文中说明实现思路。', totalScore: 100, maxAttempts: 5, allowLate: false, attachmentRequired: true, plagiarismCheck: true, peerReview: false, status: '已发布', dueAt: '2026-12-18T15:59:00.000Z' }],
    exams: [{ id: 'demo-exam-python-1', title: 'Python 文件处理随堂测验', type: '随堂测验', description: '检查 CSV 与文件上下文管理器知识。', totalScore: 40, durationMinutes: 20, maxAttempts: 2, shuffleQuestions: false, showAnswersAfterClose: true, status: '已发布', dueAt: '2026-12-10T15:59:00.000Z', questionRefs: [{ questionId: 'demo-question-python-1', score: 20 }, { questionId: 'demo-question-python-2', score: 20 }], labReferences: [] }],
    discussions: [{ id: 'demo-discussion-python-1', title: '什么时候应该使用 CSV，什么时候应该使用数据库？', description: '结合数据规模、并发访问和维护成本讨论。', status: '已发布', publishedAt: now }], discussionReplies: [], attendanceSessions: [], attendanceRecords: [], surveys: [], surveyResponses: [], submissions: [],
  };
  return [linux, python];
}

function mergeDemoData(current) {
  if (!current || current.version !== 2) throw new Error('平台数据版本必须为 2');
  const keep = (items) => (Array.isArray(items) ? items : []).filter((item) => !String(item.id || '').startsWith(DEMO_PREFIX));
  const result = {
    ...current,
    revision: Math.max(Number(current.revision || 0) + 1, Date.now() * 1000),
    courses: [...keep(current.courses), ...courses()],
    labs: [...keep(current.labs), ...labs()],
    questionBank: [...keep(current.questionBank), ...questions()],
    labComments: keep(current.labComments),
    studentProgress: {
      ...(current.studentProgress || {}),
      resourceProgress: {
        ...(current.studentProgress?.resourceProgress || {}),
        'demo-resource-linux-guide': { status: '已完成', completedAt: '2026-11-03T09:20:00.000Z' },
        'demo-resource-linux-permission': { status: '学习中', updatedAt: '2026-11-05T08:30:00.000Z' },
      },
    },
  };
  return result;
}

function validate(data) {
  const ids = new Set();
  for (const collection of [data.courses, data.labs, data.questionBank]) {
    for (const item of collection || []) {
      if (!item.id || ids.has(item.id)) throw new Error(`数据 ID 缺失或重复：${item.id || '空值'}`);
      ids.add(item.id);
    }
  }
  const labIds = new Set((data.labs || []).map((item) => item.id));
  const questionIds = new Set((data.questionBank || []).map((item) => item.id));
  for (const course of data.courses || []) {
    for (const stage of course.stages || []) if (stage.labId && !labIds.has(stage.labId)) throw new Error(`课程阶段引用了不存在的实验：${stage.labId}`);
    for (const exam of course.exams || []) {
      for (const reference of exam.questionRefs || []) if (!questionIds.has(reference.questionId)) throw new Error(`试卷引用了不存在的题目：${reference.questionId}`);
      for (const reference of exam.labReferences || []) if (!labIds.has(reference.labId)) throw new Error(`试卷引用了不存在的实验：${reference.labId}`);
    }
  }
  const demoLabs = (data.labs || []).filter((item) => item.id.startsWith(DEMO_PREFIX));
  for (const lab of demoLabs) {
    if (!lab.checkpoints?.length || !lab.repository?.files?.length) throw new Error(`演示实验配置不完整：${lab.id}`);
    for (const cp of lab.checkpoints) {
      const tests = cp.evaluationConfig?.tests || [];
      if (!tests.some((item) => item.visibility === 'public') || !tests.some((item) => item.visibility === 'hidden')) throw new Error(`演示关卡缺少公开或隐藏测试：${cp.id}`);
    }
  }
  return data;
}

if (require.main === module) {
  const [, , input, output] = process.argv;
  if (!input || !output) throw new Error('用法：node scripts/merge-demo-data.js <现有数据.json> <输出数据.json>');
  const current = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
  const merged = validate(mergeDemoData(current));
  fs.writeFileSync(path.resolve(output), `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ output: path.resolve(output), courses: merged.courses.length, labs: merged.labs.length, questions: merged.questionBank.length, demoCourses: merged.courses.filter((item) => item.id.startsWith(DEMO_PREFIX)).length, demoLabs: merged.labs.filter((item) => item.id.startsWith(DEMO_PREFIX)).length }, null, 2));
}

module.exports = { mergeDemoData, validate };
