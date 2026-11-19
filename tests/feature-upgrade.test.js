const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('实践项目支持代码仓库、多关卡、评测文件选择和试卷复用', () => {
  const portal = read('portal.js');
  for (const marker of ['normalizedRepository', 'normalizedCheckpoints', 'checkpoint-card', 'repositoryBranch', 'testTarget', 'whitespacePolicy', 'scoringRule', 'labReferences', 'open-exam-lab']) {
    assert.match(portal, new RegExp(marker));
  }
  assert.match(read('app.js'), /X-Checkpoint-Id/);
  assert.match(read('local-server.js'), /resolveLabCheckpoint/);
});

test('文本评测支持忽略空格、大小写和多种判分规则', async () => {
  const { evaluateConfiguredTests } = require(path.join(root, 'terminal-gateway.js'));
  const executor = async () => ({ code: 0, stdout: ' Hello   CloudLab \n', stderr: '' });
  const base = {
    techPlatform: 'Python',
    maxExecutionSeconds: 2,
    evaluationConfig: {
      passPolicy: 'score-threshold',
      passingScore: 50,
      whitespacePolicy: 'ignore-all',
      caseSensitive: false,
      scoringRule: 'test-count',
      tests: [
        { id: 'a', name: '输出', visibility: 'public', ruleType: 'program-output-equals', target: 'main.py', expected: 'hellocloudlab', weight: 1, required: true },
        { id: 'b', name: '包含', visibility: 'public', ruleType: 'program-output-contains', target: 'main.py', expected: 'CLOUD', weight: 99, required: false },
      ],
    },
  };
  const report = await evaluateConfiguredTests(executor, base, true);
  assert.equal(report.passed, true);
  assert.equal(report.score, 100);
  assert.equal(report.whitespacePolicy, 'ignore-all');
  assert.equal(report.caseSensitive, false);

  const allOrNothing = await evaluateConfiguredTests(executor, { ...base, evaluationConfig: { ...base.evaluationConfig, scoringRule: 'all-or-nothing', tests: [...base.evaluationConfig.tests, { id: 'c', name: '失败项', visibility: 'public', ruleType: 'program-output-equals', target: 'main.py', expected: 'different', weight: 1, required: false }] } }, true);
  assert.equal(allOrNothing.score, 0);
  assert.equal(allOrNothing.passed, false);
});

test('账号身份由服务端会话决定并保护认证数据文件', () => {
  const server = read('local-server.js');
  assert.match(server, /CLOUDLAB_AUTH_REQUIRED/);
  assert.match(server, /cloudlab_session/);
  assert.match(server, /sessionSecret/);
  assert.match(server, /createHmac\('sha256'/);
  assert.doesNotMatch(server, /const sessions = new Map/);
  assert.match(server, /crypto\.scryptSync/);
  assert.match(server, /仅教师或管理员可修改教学数据/);
  assert.match(server, /禁止访问平台数据文件/);
  const portal = read('portal.js');
  assert.match(portal, /authState\.authRequired/);
  assert.match(portal, /工作台由当前登录账号身份决定/);
  assert.match(portal, /登录状态已失效，请重新登录后继续操作/);
});
