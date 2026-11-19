const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('题库题目可持久化、复用到试卷并自动判分', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudlab-question-test-'));
  process.env.CLOUDLAB_DATA_FILE = path.join(temp, 'platform.json');
  process.env.CLOUDLAB_AUTH_REQUIRED = 'false';
  delete process.env.CLOUDLAB_TERMINAL_ENABLED;
  const { server } = require(path.join(root, 'local-server.js'));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); fs.rmSync(temp, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const questionBank = [
    { id: 'q-single', type: '单选题', stem: 'Linux 根目录是？', options: [{ key: 'A', text: '/' }, { key: 'B', text: '/home' }], answers: ['A'], defaultScore: 10 },
    { id: 'q-multiple', type: '多选题', stem: '属于 Linux 权限位的是？', options: [{ key: 'A', text: 'r' }, { key: 'B', text: 'w' }, { key: 'C', text: 'x' }], answers: ['A', 'B', 'C'], defaultScore: 20 },
  ];
  const exam = { id: 'exam-1', title: 'Linux 基础考试', status: '已发布', totalScore: 30, questionRefs: [{ questionId: 'q-single', score: 10 }, { questionId: 'q-multiple', score: 20 }], labReferences: [] };
  const assignment = { id: 'assignment-1', title: '权限分析报告', status: '已发布', totalScore: 100, maxAttempts: 2, allowLate: false, plagiarismCheck: true, peerReview: true, anonymousReview: true };
  const groupAssignment = { id: 'assignment-group-1', title: '权限方案小组设计', type: '分组作业', status: '已发布', totalScore: 100, maxAttempts: 3, groupSize: 3, allowLate: true };
  const survey = { id: 'survey-1', title: '课程反馈', status: '已发布', allowResubmit: true, anonymous: true, questions: [{ id: 'survey-q1', type: '单选题', title: '本节难度如何？', options: ['简单', '适中', '困难'], required: true }, { id: 'survey-q2', type: '文本题', title: '改进建议', options: [], required: false }] };
  const discussion = { id: 'discussion-1', title: 'Linux 权限设计讨论', description: '分享最小权限原则的使用场景', status: '已发布' };
  const attendanceSession = { id: 'attendance-1', title: '第一讲签到', code: '628314', status: '进行中', durationMinutes: 10, startedAt: new Date().toISOString() };
  const lab = { id: 'lab-1', name: 'Linux 权限实验', state: '已发布', repository: { storage: 'legacy', files: [] } };
  const assignmentGroup = { id: 'group-1', assignmentId: 'assignment-group-1', name: '权限设计第 1 组', memberIds: ['student-a', 'student-b'], memberNames: ['学生甲', '学生乙'] };
  const course = { id: 'course-1', name: 'Linux', status: '已发布', members: [{ id: 'member-a', accountId: 'student-a', name: '学生甲', role: '学生' }, { id: 'member-b', accountId: 'student-b', name: '学生乙', role: '学生' }], messages: [], exams: [exam], assignments: [assignment, groupAssignment], assignmentGroups: [assignmentGroup], submissions: [], surveys: [survey], surveyResponses: [], discussions: [discussion], discussionReplies: [], attendanceSessions: [attendanceSession], attendanceRecords: [] };
  let response = await fetch(`${base}/api/bootstrap`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 2, courses: [course], labs: [lab], questionBank, settings: {} }) });
  assert.equal(response.status, 200, response.status === 200 ? undefined : await response.text());

  response = await fetch(`${base}/api/submissions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: 'course-1', activityId: 'exam-1', kind: 'exam', studentId: 'student-1', studentName: '学生甲', content: '在线答题（2题）', answers: { 'q-single': 'A', 'q-multiple': ['C', 'A', 'B'] } }) });
  const submission = (await response.json()).submission;
  assert.equal(response.status, 200);
  assert.equal(submission.status, '已批阅');
  assert.equal(submission.score, 30);
  assert.equal(submission.questionResults['q-single'].correct, true);
  assert.equal(submission.questionResults['q-multiple'].correct, true);

  response = await fetch(`${base}/api/bootstrap`);
  const stored = await response.json();
  assert.equal(stored.questionBank.length, 2);
  assert.deepEqual(stored.questionBank[0].answers, ['A']);
  assert.equal(stored.courses[0].submissions[0].score, 30);

  const submitAssignment = (studentId, studentName, content) => fetch(`${base}/api/submissions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: 'course-1', activityId: 'assignment-1', kind: 'assignment', studentId, studentName, content }) });
  response = await submitAssignment('student-a', '学生甲', 'Linux 文件 权限 chmod 用户 用户组 读写执行');
  assert.equal(response.status, 200);
  const studentASubmissionId = (await response.json()).submission.id;
  response = await submitAssignment('student-b', '学生乙', 'Linux 文件 权限 chmod 用户 用户组 读写执行');
  let assignmentSubmission = (await response.json()).submission;
  assert.equal(response.status, 200);
  assert.equal(assignmentSubmission.similarity, 100);
  assert.equal(assignmentSubmission.attemptCount, 1);
  const assignmentSubmissionId = assignmentSubmission.id;
  response = await submitAssignment('student-b', '学生乙', '第二次修改 Linux 文件权限分析');
  assignmentSubmission = (await response.json()).submission;
  assert.equal(response.status, 200);
  assert.equal(assignmentSubmission.attemptCount, 2);
  response = await submitAssignment('student-b', '学生乙', '第三次提交应被限制');
  assert.equal(response.status, 409);
  response = await fetch(`${base}/api/submissions/grade`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: 'course-1', submissionId: assignmentSubmissionId, score: 70, feedback: '请补充说明' }) });
  assert.equal(response.status, 200);
  response = await fetch(`${base}/api/submissions/grade`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: 'course-1', submissionId: assignmentSubmissionId, score: 85, feedback: '修改后通过' }) });
  assignmentSubmission = (await response.json()).submission;
  assert.equal(assignmentSubmission.gradeHistory[0].score, 70);
  response = await fetch(`${base}/api/submissions/return`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: 'course-1', submissionId: assignmentSubmissionId, feedback: '退回补充实验截图' }) });
  assert.equal((await response.json()).submission.status, '需重做');
  response = await submitAssignment('student-b', '学生乙', '教师退回后的重新提交');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).submission.attemptCount, 3);

  response = await fetch(`${base}/api/peer-reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: 'course-1', submissionId: studentASubmissionId, reviewerId: 'student-b', reviewerName: '学生乙', score: 88, comment: '权限分析完整，建议补充 umask。' }) });
  const peerReview = (await response.json()).review;
  assert.equal(response.status, 201);
  assert.equal(peerReview.reviewerName, '匿名同学');

  response = await fetch(`${base}/api/submissions/grade`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: 'course-1', submissionId: assignmentSubmissionId, score: 86, feedback: '最终批阅成绩' }) });
  assert.equal(response.status, 200);
  response = await fetch(`${base}/api/grade-appeals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: 'course-1', submissionId: assignmentSubmissionId, studentId: 'student-b', reason: '第 3 项评分标准已满足，请复核。' }) });
  const gradeAppeal = (await response.json()).appeal;
  assert.equal(response.status, 201);
  response = await fetch(`${base}/api/grade-appeals/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: 'course-1', appealId: gradeAppeal.id, decision: '通过', newScore: 90, response: '复核后同意调整。' }) });
  const resolvedAppeal = await response.json();
  assert.equal(response.status, 200);
  assert.equal(resolvedAppeal.appeal.status, '已通过');
  assert.equal(resolvedAppeal.submission.score, 90);

  response = await fetch(`${base}/api/submissions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: 'course-1', activityId: 'assignment-group-1', kind: 'assignment', studentId: 'student-a', studentName: '学生甲', groupId: 'group-1', content: '小组共同完成的权限设计方案' }) });
  const groupSubmission = (await response.json()).submission;
  assert.equal(response.status, 200);
  assert.equal(groupSubmission.studentId, 'group:group-1');
  assert.deepEqual(groupSubmission.groupMemberIds, ['student-a', 'student-b']);
  response = await fetch(`${base}/api/submissions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: 'course-1', activityId: 'assignment-group-1', kind: 'assignment', studentId: 'student-c', studentName: '学生丙', groupId: 'group-1', content: '非组员无权提交' }) });
  assert.equal(response.status, 403);

  response = await fetch(`${base}/api/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: 'course-1', senderId: 'course-teacher', senderName: '课程教师', senderRole: 'teacher', recipientId: 'student-a', subject: '作业提醒', content: '请在截止前完成权限分析报告。' }) });
  assert.equal(response.status, 201);
  response = await fetch(`${base}/api/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: 'course-1', senderId: 'student-a', senderName: '学生甲', senderRole: 'student', recipientId: 'course-teachers', subject: '实验问题', content: '请问隐藏测试的通过标准是什么？' }) });
  assert.equal(response.status, 201);

  response = await fetch(`${base}/api/lab-comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ labId: 'lab-1', checkpointId: 'checkpoint-1', authorId: 'student-a', authorName: '学生甲', text: '这个实验帮助我理解了 chmod。' }) });
  assert.equal(response.status, 201);
  response = await fetch(`${base}/api/lab-comments?labId=lab-1`);
  assert.equal((await response.json()).comments.length, 1);

  response = await fetch(`${base}/api/surveys/respond`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: 'course-1', surveyId: 'survey-1', studentId: 'student-a', studentName: '学生甲', answers: { 'survey-q1': '适中', 'survey-q2': '增加更多实践案例' } }) });
  let surveyResponse = (await response.json()).response;
  assert.equal(response.status, 200);
  assert.equal(surveyResponse.studentName, '匿名学生');
  assert.equal(surveyResponse.answers['survey-q1'], '适中');

  response = await fetch(`${base}/api/discussions/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: 'course-1', discussionId: 'discussion-1', studentId: 'student-a', studentName: '学生甲', content: '生产环境应遵循最小权限原则。' }) });
  const discussionReply = (await response.json()).reply;
  assert.equal(response.status, 201);
  assert.equal(discussionReply.content, '生产环境应遵循最小权限原则。');

  response = await fetch(`${base}/api/attendance/check-in`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: 'course-1', sessionId: 'attendance-1', code: '628314', studentId: 'student-a', studentName: '学生甲' }) });
  const attendanceRecord = (await response.json()).record;
  assert.equal(response.status, 201);
  assert.equal(attendanceRecord.studentName, '学生甲');
  response = await fetch(`${base}/api/attendance/check-in`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: 'course-1', sessionId: 'attendance-1', code: '628314', studentId: 'student-a', studentName: '学生甲' }) });
  assert.equal(response.status, 409);

  response = await fetch(`${base}/api/bootstrap`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 2, courses: [course], labs: [lab], questionBank, settings: {} }) });
  assert.equal(response.status, 200);
  response = await fetch(`${base}/api/bootstrap`);
  const preservedCourse = (await response.json()).courses[0];
  assert.equal(preservedCourse.surveyResponses.length, 1);
  assert.equal(preservedCourse.discussionReplies.length, 1);
  assert.equal(preservedCourse.attendanceRecords.length, 1);
  assert.equal(preservedCourse.peerReviews.length, 1);
  assert.equal(preservedCourse.gradeAppeals.length, 1);
  assert.equal(preservedCourse.messages.length, 2);
  response = await fetch(`${base}/api/lab-comments?labId=lab-1`);
  assert.equal((await response.json()).comments.length, 1);

  response = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '第一章讲义.txt', mimeType: 'text/plain', contentBase64: Buffer.from('CloudLab 教学资料', 'utf8').toString('base64') }) });
  const uploaded = await response.json();
  assert.equal(response.status, 201);
  assert.match(uploaded.url, /^\/uploads\//);
  response = await fetch(`${base}${uploaded.url}`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'CloudLab 教学资料');
});
