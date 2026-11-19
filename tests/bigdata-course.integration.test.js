const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('平台数据接口可返回已发布的大数据课程及实验入口', async (t) => {
  process.env.CLOUDLAB_DATA_FILE = path.resolve(__dirname, '..', 'local-data.json');
  process.env.CLOUDLAB_AUTH_REQUIRED = 'false';
  const { server } = require('../local-server');
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const response = await fetch(`http://127.0.0.1:${port}/api/bootstrap`);
  assert.equal(response.status, 200);
  const data = await response.json();
  const course = data.courses.find((item) => item.id === 'bigdata-import-course');
  assert.equal(course.status, '已发布');
  assert.equal(course.stages.length, 23);
  assert.equal(course.resources.length, 23);
  assert.equal(course.stages.filter((item) => item.labId).length, 5);
  for (const stage of course.stages.filter((item) => item.labId)) {
    assert.ok(data.labs.some((lab) => lab.id === stage.labId && lab.state === '已发布'));
  }
});
