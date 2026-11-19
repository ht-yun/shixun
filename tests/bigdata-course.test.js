const test = require('node:test');
const assert = require('node:assert/strict');

const { COURSE_ID, modules, mergeBigDataCourse, validate } = require('../scripts/import-bigdata-course');

test('授权大数据课程包含完整专题、可访问资源和真实实践实验', () => {
  const data = validate(mergeBigDataCourse({ version: 2, revision: 0, courses: [], labs: [], questionBank: [], labComments: [], settings: {}, studentProgress: { history: [], resourceProgress: {} } }));
  const course = data.courses.find((item) => item.id === COURSE_ID);
  assert.equal(course.status, '已发布');
  assert.equal(course.sourcePermissionConfirmed, true);
  assert.equal(course.stages.length, modules.length);
  assert.equal(course.resources.length, modules.length);
  assert.equal(course.lectures.length, modules.length);
  assert.equal(course.knowledgePoints.length, modules.length);
  assert.equal(course.resources.every((item) => item.status === '已发布' && item.url.startsWith('https://zhenchao125.github.io/')), true);
  assert.equal(course.stages.filter((item) => item.labId).length, 5);
  assert.equal(data.labs.filter((item) => item.id.startsWith('bigdata-import-')).length, 6);
  assert.equal(data.labs.filter((item) => item.runtimeProfile === 'hadoop-spark').length, 2);
  assert.equal(data.labs.every((lab) => !lab.id.startsWith('bigdata-import-') || lab.checkpoints.every((cp) => cp.evaluationConfig.tests.some((item) => item.visibility === 'public') && cp.evaluationConfig.tests.some((item) => item.visibility === 'hidden'))), true);
  assert.equal(course.exams[0].questionRefs.length, 8);
  assert.equal(course.assignments.length, 1);
});

test('大数据课程重复导入时保留已产生的教学运行数据', () => {
  const first = mergeBigDataCourse({ version: 2, courses: [], labs: [], questionBank: [] });
  first.courses[0].members.push({ id: 'student-1', name: '测试学生', role: '学生' });
  first.courses[0].submissions.push({ id: 'submission-1', studentId: 'student-1' });
  const second = mergeBigDataCourse(first);
  const course = second.courses.find((item) => item.id === COURSE_ID);
  assert.equal(course.members[0].name, '测试学生');
  assert.equal(course.submissions[0].id, 'submission-1');
  assert.equal(second.courses.filter((item) => item.id === COURSE_ID).length, 1);
});
