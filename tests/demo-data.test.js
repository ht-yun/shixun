const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeDemoData, validate } = require('../scripts/merge-demo-data');

test('演示数据以追加方式写入且可重复执行', () => {
  const existingCourse = { id: 'existing-course', name: '用户课程' };
  const existingLab = { id: 'existing-lab', name: '用户实验' };
  const source = { version: 2, revision: 100, courses: [existingCourse], labs: [existingLab], questionBank: [], labComments: [], settings: {}, studentProgress: { resourceProgress: {} } };
  const once = validate(mergeDemoData(source));
  const twice = validate(mergeDemoData(once));
  assert.equal(twice.courses.filter((item) => item.id.startsWith('demo-')).length, 2);
  assert.equal(twice.labs.filter((item) => item.id.startsWith('demo-')).length, 3);
  assert.equal(twice.questionBank.filter((item) => item.id.startsWith('demo-')).length, 7);
  assert.deepEqual(twice.courses.find((item) => item.id === 'existing-course'), existingCourse);
  assert.deepEqual(twice.labs.find((item) => item.id === 'existing-lab'), existingLab);
  assert.ok(twice.courses.every((course) => (course.stages || []).every((stage) => !stage.labId || twice.labs.some((lab) => lab.id === stage.labId))));
});
