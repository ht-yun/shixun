/* 将已获授权的大数据课程目录、学习资源和可运行实验追加到 CloudLab 平台数据。 */
const fs = require('fs');
const path = require('path');

const PREFIX = 'bigdata-import-';
const COURSE_ID = `${PREFIX}course`;
const SOURCE_REPOSITORY = 'https://github.com/zhenchao125/zhenchao125.github.io';
const SOURCE_SITE = 'https://zhenchao125.github.io';
const importedAt = '2026-11-08T00:00:00.000Z';

const modules = [
  ['hadoop', 'Hadoop 与 HDFS 基础', 'bigdata_hadoop_atguigu', '理解 Hadoop 生态、HDFS 架构及本地与分布式运行方式。', 180],
  ['ha', 'Hadoop 高可用', 'bigdata_ha_atguigu', '理解 NameNode 高可用、故障转移和集群可靠性设计。', 90],
  ['zookeeper', 'ZooKeeper 分布式协调', 'bigdata_zookeeper_atguigu', '掌握 ZooKeeper 数据模型、客户端命令和分布式协调场景。', 120],
  ['flume', 'Flume 数据采集', 'bigdata_flume_atguigu', '理解 Source、Channel、Sink 以及日志采集链路。', 120],
  ['kafka', 'Kafka 消息系统', 'bigdata_kafka_atguigu', '理解 Topic、Partition、Broker、生产者和消费者工作机制。', 150],
  ['hive', 'Hive 数据仓库', 'bigdata_hive_atguigu', '掌握 Hive 数据类型、DDL、DML、查询和分区表。', 210],
  ['hbase', 'HBase 分布式数据库', 'bigdata_hbase_atguigu', '理解 HBase 数据模型、Region 架构和常用操作。', 150],
  ['phoenix', 'Phoenix 查询引擎', 'bigdata_phoenix_atguigu', '理解 Phoenix 在 HBase 上提供 SQL 查询能力的方式。', 90],
  ['sqoop', 'Sqoop 数据迁移', 'bigdata_sqoop_atguigu', '掌握关系型数据库与 Hadoop 之间的数据导入导出流程。', 90],
  ['oozie', 'Oozie 工作流调度', 'bigdata_oozie_atguigu', '理解大数据任务工作流、依赖关系和定时调度。', 90],
  ['azkaban', 'Azkaban 工作流调度', 'bigdata_azkaban_atguigu', '掌握 Job、Flow 以及常见大数据任务编排方式。', 90],
  ['scala', 'Scala 编程基础', 'bigdata_scala_atguigu', '掌握函数式编程、集合、模式匹配和面向对象基础。', 240],
  ['spark', 'Spark 核心技术', 'bigdata_spark_atguigu', '理解 Spark 运行模式、RDD、Spark SQL 和流处理。', 240],
  ['spark-optimize', 'Spark 内核与优化', 'bigdata_spark_kernel-optimize_atguigu', '理解 Spark 执行机制、内存管理和性能优化方法。', 150],
  ['spark-project', 'Spark 综合项目', 'bigdata_spark-project_atguigu', '通过完整项目综合使用 Spark Core、SQL 和 Streaming。', 240],
  ['flink', 'Flink 流处理', 'bigdata_flink_atguigu', '理解有状态流处理、时间语义和实时计算基本流程。', 150],
  ['elk', 'ELK 日志分析', 'bigdata_elk_atguigu', '理解 Elasticsearch、Logstash、Kibana 的日志处理链路。', 150],
  ['kylin', 'Kylin OLAP 分析', 'bigdata_kylin_atguigu', '理解多维分析、预计算和大数据 OLAP 基础。', 90],
  ['log-dw', '日志数据仓库', 'bigdata_log-datawarehoue_atguigu', '理解日志采集、清洗、分层和数据仓库建设过程。', 180],
  ['dw-project', '数据仓库实战', 'bigdata_dw_real_atguigu', '完成数据仓库需求分析、建模、装载与指标计算。', 240],
  ['mall', '电商数据分析项目', 'bigdata_mallanalyze_atguigu', '围绕电商数据完成采集、处理、分析和指标展示。', 180],
  ['telecom', '电信大数据项目', 'bigdata_telecom_project_atguigu', '围绕通信数据完成存储、处理和应用分析。', 180],
  ['cm', '集群部署与管理', 'bigdata_cm_atguigu', '了解大数据集群安装、配置、监控和日常管理。', 120],
];

function evaluation(id, tests, options = {}) {
  return {
    passPolicy: options.passPolicy || 'score-threshold',
    scoringRule: options.scoringRule || 'weighted',
    passingScore: options.passingScore || 80,
    whitespacePolicy: options.whitespacePolicy || 'trim-lines',
    caseSensitive: options.caseSensitive !== false,
    studentFiles: options.studentFiles || [],
    executionFile: '平台内置安全评测器',
    outputType: options.outputType || '文本结果',
    tests: tests.map((test, index) => ({ id: `${id}-test-${index + 1}`, weight: 50, required: true, ...test })),
    referenceAnswers: options.referenceAnswers || [],
  };
}

function checkpoint(id, name, values) {
  return {
    id,
    name,
    difficulty: values.difficulty || '初级',
    rewardExperience: values.rewardExperience || 80,
    maxExecutionSeconds: values.maxExecutionSeconds || 12,
    objectives: values.objectives,
    description: values.description,
    knowledge: values.knowledge,
    requirements: values.requirements,
    testDescription: values.testDescription,
    evaluationConfig: values.evaluationConfig,
  };
}

function repository(message, files) {
  return { branch: 'main', defaultBranch: 'main', commitMessage: message, files };
}

function labs() {
  return [
    {
      id: `${PREFIX}lab-hdfs-cluster`,
      name: '真实 HDFS 文件系统实践',
      mode: '代码 + 命令行', duration: 90, maxExecutionSeconds: 240, builtIn: 'linux-permissions', techPlatform: 'Linux', language: 'HDFS Shell', runtimeProfile: 'hadoop-spark', publicScope: '本单位可用',
      skillTags: ['Hadoop 3.5', 'HDFS', '真实集群'], state: '已发布', sourceRepository: SOURCE_REPOSITORY,
      repository: repository('初始化真实 HDFS 实验', [
        { path: 'README.md', readOnly: true, content: '# 真实 HDFS 文件系统实践\n\n本实验直接连接平台的 Hadoop 单机集群，不是本地文件模拟。请在命令行中创建实验目录并上传数据。\n' },
        { path: 'data/words.txt', readOnly: true, content: 'hadoop spark kafka\nhadoop hive spark\nkafka hadoop\n' },
        { path: 'verify.sh', readOnly: true, content: `#!/usr/bin/env bash\nsource /opt/cloudlab-cluster/cluster-env.sh\nROOT=/user/cloudlab/labs/${PREFIX}lab-hdfs-cluster\ntimeout 120s hdfs dfs -test -d "$ROOT/input" && echo HDFS_DIRECTORY_OK\ncontent="$(timeout 120s hdfs dfs -cat "$ROOT/input/words.txt" 2>/dev/null || true)"\nprintf '%s' "$content" | grep -q 'hadoop spark kafka' && echo HDFS_CONTENT_OK\ntimeout 120s hdfs dfs -count "$ROOT/input/words.txt" | grep -Eq '[[:space:]]1[[:space:]]+[0-9]+[[:space:]]+' && echo HDFS_COUNT_OK\n` },
      ]),
      checkpoints: [checkpoint(`${PREFIX}cp-hdfs-cluster`, '在真实 HDFS 中创建并读取文件', {
        difficulty: '初级', maxExecutionSeconds: 240, objectives: '掌握 HDFS 目录创建、文件上传、文件查看和统计命令，并确认数据实际存储在 NameNode/DataNode 管理的文件系统中。',
        description: `在 HDFS 路径 /user/cloudlab/labs/${PREFIX}lab-hdfs-cluster 下创建 input 目录，把 data/words.txt 上传为 input/words.txt，再读取并统计文件。`,
        knowledge: 'NameNode 管理文件系统元数据，DataNode 保存数据块；hdfs dfs 命令操作的是分布式文件系统，而不是当前 Linux 本地目录。',
        requirements: `依次执行：\nhdfs dfs -mkdir -p /user/cloudlab/labs/${PREFIX}lab-hdfs-cluster/input\nhdfs dfs -put data/words.txt /user/cloudlab/labs/${PREFIX}lab-hdfs-cluster/input/words.txt\nhdfs dfs -cat /user/cloudlab/labs/${PREFIX}lab-hdfs-cluster/input/words.txt`,
        testDescription: '评测会直接查询真实 HDFS，检查目录、文件内容和文件统计结果；重置实验会清理本实验专属 HDFS 路径。',
        evaluationConfig: evaluation(`${PREFIX}cp-hdfs-cluster`, [
          { name: 'HDFS 实验目录已创建', visibility: 'public', ruleType: 'program-output-contains', target: 'verify.sh', expected: 'HDFS_DIRECTORY_OK', weight: 30 },
          { name: '数据已上传到 HDFS', visibility: 'public', ruleType: 'program-output-contains', target: 'verify.sh', expected: 'HDFS_CONTENT_OK', weight: 40 },
          { name: 'HDFS 文件统计正确', visibility: 'hidden', ruleType: 'program-output-contains', target: 'verify.sh', expected: 'HDFS_COUNT_OK', weight: 30 },
        ], { studentFiles: [], passingScore: 100, referenceAnswers: [{ id: `${PREFIX}answer-hdfs-cluster`, name: '完整命令', content: `hdfs dfs -mkdir -p /user/cloudlab/labs/${PREFIX}lab-hdfs-cluster/input\nhdfs dfs -put data/words.txt /user/cloudlab/labs/${PREFIX}lab-hdfs-cluster/input/words.txt\nhdfs dfs -cat /user/cloudlab/labs/${PREFIX}lab-hdfs-cluster/input/words.txt`, deductionPercent: 20 }] }),
      })], createdAt: importedAt, updatedAt: importedAt,
    },
    {
      id: `${PREFIX}lab-spark-cluster`,
      name: 'Spark Standalone 集群 WordCount',
      mode: '代码 + 命令行', duration: 120, maxExecutionSeconds: 300, builtIn: 'linux-permissions', techPlatform: 'Linux', language: 'PySpark', runtimeProfile: 'hadoop-spark', publicScope: '本单位可用',
      skillTags: ['Spark 3.5', 'RDD', '真实集群'], state: '已发布', sourceRepository: SOURCE_REPOSITORY,
      repository: repository('初始化 Spark 集群 WordCount 实验', [
        { path: 'README.md', readOnly: true, content: '# Spark Standalone 集群 WordCount\n\n补全 wordcount.py，并通过网页命令行提交到 spark://127.0.0.1:7077。平台会使用一个真实 Spark Worker 执行任务。\n' },
        { path: 'data/words.txt', readOnly: true, content: 'hadoop spark kafka\nhadoop hive spark\nkafka hadoop\n' },
        { path: 'wordcount.py', readOnly: false, content: `from pyspark.sql import SparkSession\n\nspark = SparkSession.builder.appName("CloudLabWordCount").getOrCreate()\nwords = open("data/words.txt", encoding="utf-8").read().split()\n\n# TODO：使用 spark.sparkContext.parallelize、map 和 reduceByKey 统计词频\ncounts = []\n\nfor word, count in counts:\n    print(f"{word} {count}")\n\nspark.stop()\n` },
        { path: 'verify.sh', readOnly: true, content: '#!/usr/bin/env bash\nsource /opt/cloudlab-cluster/cluster-env.sh\ntimeout 280s spark-submit --master spark://127.0.0.1:7077 --driver-memory 192m --executor-memory 256m --total-executor-cores 1 wordcount.py\n' },
      ]),
      checkpoints: [checkpoint(`${PREFIX}cp-spark-cluster`, '提交真实 Spark RDD 任务', {
        difficulty: '中级', maxExecutionSeconds: 300, objectives: '使用 RDD 转换算子完成词频统计，并把 PySpark 程序提交到 Spark Standalone Master/Worker 运行。',
        description: '补全 wordcount.py：把 words 并行化，映射为 (word, 1)，按键聚合后排序输出。完成后可执行 spark-submit wordcount.py，或直接点击自动测试。',
        knowledge: 'parallelize 创建 RDD，map 生成键值对，reduceByKey 按键聚合；spark-submit 把 Driver 任务提交给 Standalone Master，由 Worker 分配 Executor。',
        requirements: '必须使用 SparkContext 的 RDD API\n输出按单词字母顺序排列\n每行格式为“单词 次数”\n不得修改 data/words.txt 与 verify.sh',
        testDescription: '程序会提交到真实 Spark Master；公开测试检查 hadoop、spark，正式评测额外检查 kafka。由于服务器为 2GB 教学机，请串行提交任务。',
        evaluationConfig: evaluation(`${PREFIX}cp-spark-cluster`, [
          { name: 'Hadoop 词频正确', visibility: 'public', ruleType: 'program-output-contains', target: 'verify.sh', expected: 'hadoop 3', weight: 35 },
          { name: 'Spark 词频正确', visibility: 'public', ruleType: 'program-output-contains', target: 'verify.sh', expected: 'spark 2', weight: 35 },
          { name: 'Kafka 词频正确', visibility: 'hidden', ruleType: 'program-output-contains', target: 'verify.sh', expected: 'kafka 2', weight: 30 },
        ], { studentFiles: ['wordcount.py'], passingScore: 100, referenceAnswers: [{ id: `${PREFIX}answer-spark-cluster`, name: 'RDD 实现提示', content: 'counts = (spark.sparkContext.parallelize(words, 1)\n    .map(lambda word: (word, 1))\n    .reduceByKey(lambda left, right: left + right)\n    .sortByKey()\n    .collect())', deductionPercent: 15 }] }),
      })], createdAt: importedAt, updatedAt: importedAt,
    },
    {
      id: `${PREFIX}lab-wordcount`,
      name: 'MapReduce WordCount 本地算法实践',
      mode: '代码 + 命令行', duration: 60, builtIn: 'linux-permissions', techPlatform: 'Python', language: 'Python 3', publicScope: '本单位可用',
      skillTags: ['Hadoop', 'MapReduce', 'Python'], state: '已发布', sourceRepository: SOURCE_REPOSITORY,
      repository: repository('初始化 WordCount 实验', [
        { path: 'README.md', readOnly: true, content: '# WordCount 本地算法实践\n\n使用 Python 模拟 MapReduce 的映射、分组和规约过程。\n' },
        { path: 'data/words.txt', readOnly: true, content: 'hadoop spark kafka\nhadoop hive spark\nkafka hadoop\n' },
        { path: 'main.py', readOnly: false, content: "from collections import Counter\n\n# TODO: 读取 data/words.txt，按单词统计次数，并按单词字母顺序输出：单词 次数\n" },
      ]),
      checkpoints: [checkpoint(`${PREFIX}cp-wordcount`, '实现 WordCount', {
        difficulty: '初级', objectives: '理解 MapReduce 的 Map、Shuffle、Reduce 三个基本阶段，并完成可运行的词频统计程序。',
        description: '读取 data/words.txt，统计每个单词出现次数，并按单词字母顺序逐行输出。',
        knowledge: 'Map 阶段产生键值对；Shuffle 阶段按键分组；Reduce 阶段聚合每个键的值。',
        requirements: '不得修改 data/words.txt\n使用 Python 读取输入文件\n按“单词 次数”格式输出\n按单词字母顺序输出',
        testDescription: '公开测试检查 hadoop 和 spark，隐藏测试检查 kafka 和完整输出。',
        evaluationConfig: evaluation(`${PREFIX}cp-wordcount`, [
          { name: 'Hadoop 词频正确', visibility: 'public', ruleType: 'program-output-contains', target: 'main.py', expected: 'hadoop 3', weight: 30 },
          { name: 'Spark 词频正确', visibility: 'public', ruleType: 'program-output-contains', target: 'main.py', expected: 'spark 2', weight: 30 },
          { name: 'Kafka 词频正确', visibility: 'hidden', ruleType: 'program-output-contains', target: 'main.py', expected: 'kafka 2', weight: 40 },
        ], { studentFiles: ['main.py'], passingScore: 100, referenceAnswers: [{ id: `${PREFIX}answer-wordcount`, name: '实现提示', content: '可使用 collections.Counter，并通过 sorted(counter.items()) 排序。', deductionPercent: 10 }] }),
      })], createdAt: importedAt, updatedAt: importedAt,
    },
    {
      id: `${PREFIX}lab-log-etl`,
      name: '日志数据清洗与指标统计',
      mode: '代码 + 命令行', duration: 75, builtIn: 'linux-permissions', techPlatform: 'Python', language: 'Python 3', publicScope: '本单位可用',
      skillTags: ['ETL', '日志分析', 'Python'], state: '已发布', sourceRepository: SOURCE_REPOSITORY,
      repository: repository('初始化日志 ETL 实验', [
        { path: 'README.md', readOnly: true, content: '# 日志数据清洗与指标统计\n\n读取 CSV 格式访问日志，过滤无效行并统计核心指标。\n' },
        { path: 'data/access.csv', readOnly: true, content: 'ip,status,path\n10.0.0.1,200,/home\n10.0.0.2,404,/missing\n10.0.0.1,200,/course\ninvalid,row\n10.0.0.3,500,/api\n10.0.0.2,200,/login\n' },
        { path: 'main.py', readOnly: false, content: "import csv\n\n# TODO: 忽略字段不完整的记录，统计有效记录数、200 状态请求数和独立 IP 数\n" },
      ]),
      checkpoints: [checkpoint(`${PREFIX}cp-log-etl`, '完成日志清洗与统计', {
        difficulty: '中级', objectives: '掌握结构化日志读取、异常数据过滤、集合去重和指标计算。',
        description: '处理 data/access.csv，忽略无效行，输出有效记录、成功请求和独立 IP 三项指标。',
        knowledge: 'ETL 包含抽取、转换和装载；数据清洗应先验证字段完整性，再进行统计。',
        requirements: '使用 csv.DictReader\n忽略字段缺失的行\n输出“有效记录: 5”\n输出“成功请求: 3”\n输出“独立IP: 3”',
        testDescription: '公开测试检查有效记录和成功请求，隐藏测试检查独立 IP。',
        evaluationConfig: evaluation(`${PREFIX}cp-log-etl`, [
          { name: '有效记录统计', visibility: 'public', ruleType: 'program-output-contains', target: 'main.py', expected: '有效记录: 5', weight: 35 },
          { name: '成功请求统计', visibility: 'public', ruleType: 'program-output-contains', target: 'main.py', expected: '成功请求: 3', weight: 35 },
          { name: '独立 IP 统计', visibility: 'hidden', ruleType: 'program-output-contains', target: 'main.py', expected: '独立IP: 3', weight: 30 },
        ], { studentFiles: ['main.py'], passingScore: 100, referenceAnswers: [{ id: `${PREFIX}answer-log-etl`, name: '清洗提示', content: '先判断 ip、status、path 三个字段是否都有值，再把 IP 加入 set。', deductionPercent: 10 }] }),
      })], createdAt: importedAt, updatedAt: importedAt,
    },
    {
      id: `${PREFIX}lab-sql-analysis`,
      name: '数据仓库 SQL 分组统计实践',
      mode: '代码 + 命令行', duration: 60, builtIn: 'linux-permissions', techPlatform: '数据库', language: 'SQL', publicScope: '本单位可用',
      skillTags: ['Hive SQL', '数据仓库', '聚合分析'], state: '已发布', sourceRepository: SOURCE_REPOSITORY,
      repository: repository('初始化 SQL 分析实验', [
        { path: 'README.md', readOnly: true, content: '# SQL 分组统计实践\n\n本实验使用 SQLite 验证通用 SQL 聚合思路，语法与 Hive SQL 的基础 SELECT/GROUP BY 保持一致。\n' },
        { path: 'main.sql', readOnly: false, content: "CREATE TABLE sales(region TEXT, amount INTEGER);\nINSERT INTO sales VALUES ('华北',100),('华东',80),('华北',150),('华南',60),('华东',120);\n\n-- TODO: 按 region 分组统计 amount 总额，并按总额从高到低输出 region 与 total_amount\n" },
      ]),
      checkpoints: [checkpoint(`${PREFIX}cp-sql-analysis`, '完成区域销售汇总', {
        difficulty: '初级', objectives: '掌握 GROUP BY、SUM 和 ORDER BY，并理解数据仓库指标聚合过程。',
        description: '补全 main.sql，按区域统计销售总额，并按照总额从高到低输出。',
        knowledge: '分组聚合是数据仓库指标计算的基础；GROUP BY 决定粒度，SUM 负责度量聚合。',
        requirements: '保留建表和样例数据\n使用 GROUP BY region\n结果包含华北 250、华东 200、华南 60\n按总额降序排列',
        testDescription: '公开测试检查华北和华东汇总，隐藏测试检查华南及完整顺序。',
        evaluationConfig: evaluation(`${PREFIX}cp-sql-analysis`, [
          { name: '华北汇总正确', visibility: 'public', ruleType: 'program-output-contains', target: 'main.sql', expected: '华北|250', weight: 35 },
          { name: '华东汇总正确', visibility: 'public', ruleType: 'program-output-contains', target: 'main.sql', expected: '华东|200', weight: 35 },
          { name: '华南汇总正确', visibility: 'hidden', ruleType: 'program-output-contains', target: 'main.sql', expected: '华南|60', weight: 30 },
        ], { studentFiles: ['main.sql'], passingScore: 100, referenceAnswers: [{ id: `${PREFIX}answer-sql`, name: 'SQL 提示', content: 'SELECT region, SUM(amount) AS total_amount FROM sales GROUP BY region ORDER BY total_amount DESC;', deductionPercent: 15 }] }),
      })], createdAt: importedAt, updatedAt: importedAt,
    },
    {
      id: `${PREFIX}lab-stream`,
      name: '消息流分区统计实践',
      mode: '代码 + 命令行', duration: 75, builtIn: 'linux-permissions', techPlatform: 'Python', language: 'Python 3', publicScope: '本单位可用',
      skillTags: ['Kafka', '流处理', 'JSON Lines'], state: '已发布', sourceRepository: SOURCE_REPOSITORY,
      repository: repository('初始化消息流统计实验', [
        { path: 'README.md', readOnly: true, content: '# 消息流分区统计实践\n\n使用本地 JSON Lines 数据模拟消费消息后的统计处理；本实验不冒充真实 Kafka 集群。\n' },
        { path: 'data/messages.jsonl', readOnly: true, content: '{"topic":"orders","partition":0,"value":120}\n{"topic":"users","partition":0,"value":1}\n{"topic":"orders","partition":1,"value":80}\n{"topic":"orders","partition":0,"value":50}\n{"topic":"users","partition":1,"value":1}\n' },
        { path: 'main.py', readOnly: false, content: "import json\n\n# TODO: 逐行读取 messages.jsonl，统计各 topic 消息数和 orders 的 value 总和\n" },
      ]),
      checkpoints: [checkpoint(`${PREFIX}cp-stream`, '统计消息主题与业务指标', {
        difficulty: '中级', objectives: '理解逐条消费、主题分类和流式聚合的基本过程。',
        description: '读取 JSON Lines 消息，输出 orders、users 的消息数量，以及 orders 的 value 总和。',
        knowledge: 'Kafka 使用 Topic 组织消息、Partition 提供并行度；消费者通常逐条反序列化并更新状态。',
        requirements: '逐行读取 JSON\n输出“orders消息数: 3”\n输出“users消息数: 2”\n输出“orders总额: 250”',
        testDescription: '公开测试检查两个主题的消息数，隐藏测试检查订单总额。',
        evaluationConfig: evaluation(`${PREFIX}cp-stream`, [
          { name: '订单主题消息数', visibility: 'public', ruleType: 'program-output-contains', target: 'main.py', expected: 'orders消息数: 3', weight: 35 },
          { name: '用户主题消息数', visibility: 'public', ruleType: 'program-output-contains', target: 'main.py', expected: 'users消息数: 2', weight: 30 },
          { name: '订单总额', visibility: 'hidden', ruleType: 'program-output-contains', target: 'main.py', expected: 'orders总额: 250', weight: 35 },
        ], { studentFiles: ['main.py'], passingScore: 100, referenceAnswers: [{ id: `${PREFIX}answer-stream`, name: '处理提示', content: '使用 json.loads(line)，再用字典统计 topic 次数。', deductionPercent: 10 }] }),
      })], createdAt: importedAt, updatedAt: importedAt,
    },
  ];
}

function questions() {
  const values = [
    ['hadoop', '单选题', 'HDFS 中负责维护文件系统命名空间和元数据的角色是？', ['NameNode', 'DataNode', 'ResourceManager', 'NodeManager'], ['A'], 'NameNode 负责文件系统命名空间和数据块元数据。'],
    ['zookeeper', '单选题', 'ZooKeeper 的数据节点通常称为什么？', ['ZNode', 'Partition', 'Region', 'RDD'], ['A'], 'ZooKeeper 使用 ZNode 组织层次化数据。'],
    ['kafka', '单选题', 'Kafka 中提供并行消费能力的基本单位是？', ['Partition', 'Topic 名称', 'Producer', 'Schema'], ['A'], '一个 Topic 可以划分为多个 Partition。'],
    ['hive', '判断题', 'Hive 适合直接承担高并发、低延迟的在线事务处理。', ['正确', '错误'], ['B'], 'Hive 主要面向离线批处理和数据仓库分析。'],
    ['spark', '单选题', 'Spark 中具有容错能力的分布式数据集合称为？', ['RDD', 'ZNode', 'Region', 'Channel'], ['A'], 'RDD 是弹性分布式数据集。'],
    ['flink', '判断题', 'Flink 支持有状态流处理和事件时间语义。', ['正确', '错误'], ['A'], 'Flink 提供状态管理、事件时间和检查点机制。'],
    ['dw', '单选题', '数据仓库分层设计中，通常用于保存原始明细数据的是？', ['ODS', 'ADS', 'DIM', 'API'], ['A'], 'ODS 通常承接贴源原始数据。'],
    ['etl', '多选题', '下列哪些属于典型 ETL 环节？', ['数据抽取', '数据转换', '数据装载', '删除全部源数据'], ['A', 'B', 'C'], 'ETL 分别表示 Extract、Transform、Load。'],
  ];
  return values.map(([key, type, stem, options, answers, explanation], index) => ({
    id: `${PREFIX}question-${index + 1}`, courseId: COURSE_ID, type, difficulty: index > 5 ? '中等' : '简单', stem,
    options: options.map((text, optionIndex) => ({ key: String.fromCharCode(65 + optionIndex), text })), answers, explanation, defaultScore: type === '多选题' ? 15 : 10,
    tags: [key, '大数据'], createdAt: importedAt, updatedAt: importedAt,
  }));
}

function course() {
  const resources = modules.map(([key, title, folder, objective], index) => ({
    id: `${PREFIX}resource-${key}`, name: `${title}在线教材`, type: '教学资料', folder: `第 ${index + 1} 讲`, subtasks: 1,
    description: `${objective} 内容来自已获授权的原始 GitBook 课程页面。`, url: `${SOURCE_SITE}/${folder}/`, completionRule: '访问即完成', status: '已发布', version: 1,
    sourceRepository: SOURCE_REPOSITORY, createdAt: importedAt, updatedAt: importedAt,
  }));
  const lectures = modules.map(([key, title, , objective], index) => ({ id: `${PREFIX}lecture-${key}`, name: `第 ${index + 1} 讲 ${title}`, mode: '线上自主学习', description: objective, order: index + 1 }));
  const knowledgePoints = modules.map(([key, title, , objective], index) => ({ id: `${PREFIX}kp-${key}`, name: title, code: `BD-${String(index + 1).padStart(2, '0')}`, description: objective, prerequisiteId: index ? `${PREFIX}kp-${modules[index - 1][0]}` : '' }));
  const labByModule = {
    hadoop: `${PREFIX}lab-hdfs-cluster`,
    spark: `${PREFIX}lab-spark-cluster`,
    kafka: `${PREFIX}lab-stream`,
    hive: `${PREFIX}lab-sql-analysis`,
    'log-dw': `${PREFIX}lab-log-etl`,
  };
  const stages = modules.map(([key, title, folder, objective, minutes], index) => ({
    id: `${PREFIX}stage-${key}`, name: `第 ${index + 1} 章 ${title}`, type: labByModule[key] ? '实践项目' : '教学内容',
    description: objective, objectives: objective,
    content: `学习目标\n${objective}\n\n学习步骤\n1. 打开本阶段关联的“${title}在线教材”。\n2. 按照教材目录依次学习概念、架构、安装或操作章节。\n3. 记录关键组件、数据流和常用命令。\n${labByModule[key] ? '4. 完成关联实践实验，并通过公开测试和正式评测。' : '4. 完成本阶段学习后标记教材资源为已完成。'}\n\n来源\n已获授权课程仓库：${SOURCE_REPOSITORY}\n专题目录：${folder}`,
    labId: labByModule[key] || '', lectureId: `${PREFIX}lecture-${key}`, resourceIds: [`${PREFIX}resource-${key}`], knowledgePointIds: [`${PREFIX}kp-${key}`],
    unlockRule: index === 0 ? '自由学习' : '顺序解锁', estimatedMinutes: minutes, visibility: '学生可见', order: index + 1,
  }));
  return {
    id: COURSE_ID, name: '大数据技术与实践（授权导入）', code: 'BIGDATA-GITHUB-2026', category: '计算机与信息技术', difficulty: '中级', language: '中文', institution: '学生实践平台', term: '2026—2027 学年',
    startDate: '2026-11-08', endDate: '2027-07-31', totalHours: 72, credits: 4,
    learningObjectives: '系统理解 Hadoop 生态及常见大数据组件，掌握数据采集、存储、计算、调度和分析的基本流程，并能够在学生实践平台中完成真实 HDFS 与 Spark Standalone 集群实验，以及可自动评测的日志 ETL、SQL 聚合和消息流处理实践。',
    summary: '课程依据已获授权的大数据 GitBook 仓库整理，覆盖 Hadoop、ZooKeeper、Hive、Kafka、Spark、Flink 等核心技术。平台已接入 Hadoop 3.5.0 与 Spark 3.5.9 教学型单机集群，提供真实 HDFS、Spark RDD 及四个本地数据处理实验；多节点高并发实验仍需后续扩容。',
    targetAudience: '计算机、软件工程、数据科学及相关专业学生', prerequisites: '具备 Linux 命令、Python 或 Java 基础', tags: ['大数据', 'Hadoop', 'Hive', 'Kafka', 'Spark', 'Flink'], teachingTeam: ['课程教师'], coverUrl: '',
    modules: ['plan', 'notice', 'lab', 'assignment', 'exam', 'resource', 'analytics', 'class', 'survey', 'discussion', 'knowledge-graph'], visibility: '本单位课程', access: '邀请码或邀请链接', allowExit: true, showContacts: false, allowRoleApplication: true,
    digitalTextbookEnabled: true, digitalTextbookUrl: SOURCE_SITE, status: '已发布', sourceRepository: SOURCE_REPOSITORY, sourcePermissionConfirmed: true,
    createdAt: importedAt, updatedAt: importedAt,
    members: [], classrooms: [{ id: `${PREFIX}classroom`, name: '大数据技术与实践教学班', inviteCode: 'BIGDATA-2026', endDate: '2027-07-31', visibility: '私有课堂', access: '邀请码', closed: false, createdAt: importedAt }],
    sections: [], roleApplications: [], messages: [], assignmentGroups: [], peerReviews: [], gradeAppeals: [], peerReviewTargets: [], submissions: [], surveyResponses: [], attendanceSessions: [], attendanceRecords: [], discussionReplies: [], moduleItems: [],
    lectures, resources, knowledgePoints, stages,
    notices: [{ id: `${PREFIX}notice-welcome`, title: '课程学习说明', description: '请先完成 Hadoop 基础，再按学习路径进入各专题。带“实践项目”标记的阶段可以直接进入学生实践平台真实实验环境；涉及多节点集群的专题当前先完成理论学习。', status: '已发布', publishedAt: importedAt }],
    assignments: [{ id: `${PREFIX}assignment-stack`, title: '大数据技术栈选型报告', type: '图文作业', description: '为日志分析、实时风控或离线报表中的一个场景设计大数据技术方案。', requirements: '说明数据来源、规模、时效性要求；选择采集、消息、存储、计算和调度组件；绘制数据流并说明选择理由；不少于 1200 字。', submissionInstructions: '在正文中提交方案说明，可附架构图链接。', totalScore: 100, maxAttempts: 3, allowLate: true, attachmentRequired: false, plagiarismCheck: true, peerReview: true, anonymousReview: true, status: '已发布', dueAt: '2027-06-30T15:59:00.000Z' }],
    exams: [{ id: `${PREFIX}exam-core`, title: '大数据核心知识测验', type: '在线考试', description: '检查 Hadoop、ZooKeeper、Kafka、Hive、Spark、Flink 和数据仓库基础知识。', totalScore: 85, durationMinutes: 45, maxAttempts: 2, shuffleQuestions: true, showAnswersAfterClose: true, status: '已发布', dueAt: '2027-07-15T15:59:00.000Z', questionRefs: questions().map((item) => ({ questionId: item.id, score: item.defaultScore })), labReferences: [{ labId: `${PREFIX}lab-wordcount`, checkpointId: `${PREFIX}cp-wordcount` }] }],
    discussions: [{ id: `${PREFIX}discussion-batch-stream`, title: '批处理和流处理应该如何选择？', description: '结合时效性、吞吐量、数据完整性和运维成本，讨论 Spark 批处理与 Kafka/Flink 流处理的适用场景。', status: '已发布', publishedAt: importedAt }],
    surveys: [{ id: `${PREFIX}survey-feedback`, title: '课程学习反馈', description: '用于收集专题难度和实验需求。', status: '已发布', anonymous: true, allowResubmit: true, questions: [{ id: `${PREFIX}survey-q1`, type: '单选题', title: '目前课程难度如何？', options: ['偏简单', '适中', '偏困难'], required: true }, { id: `${PREFIX}survey-q2`, type: '文本题', title: '最希望优先增加哪个真实集群实验？', options: [], required: false }] }],
  };
}

function preserveRuntimeData(previous, next) {
  if (!previous) return next;
  const operational = ['members', 'classrooms', 'sections', 'roleApplications', 'messages', 'assignmentGroups', 'peerReviews', 'gradeAppeals', 'peerReviewTargets', 'submissions', 'surveyResponses', 'attendanceRecords', 'discussionReplies'];
  const merged = { ...next };
  for (const key of operational) if (Array.isArray(previous[key]) && previous[key].length) merged[key] = previous[key];
  return merged;
}

function mergeBigDataCourse(current) {
  if (!current || Number(current.version) !== 2) throw new Error('平台数据版本必须为 2');
  const previousCourse = (current.courses || []).find((item) => item.id === COURSE_ID);
  const nextCourse = preserveRuntimeData(previousCourse, course());
  const importedLabs = labs();
  const importedQuestions = questions();
  const keep = (items) => (Array.isArray(items) ? items : []).filter((item) => !String(item.id || '').startsWith(PREFIX));
  return {
    ...current,
    revision: Math.max(Number(current.revision || 0) + 1, Date.now() * 1000),
    courses: [...keep(current.courses), nextCourse],
    labs: [...keep(current.labs), ...importedLabs],
    questionBank: [...keep(current.questionBank), ...importedQuestions],
  };
}

function validate(data) {
  const importedCourse = data.courses.find((item) => item.id === COURSE_ID);
  if (!importedCourse || importedCourse.status !== '已发布') throw new Error('大数据课程未正确导入或未发布');
  if (importedCourse.stages.length !== modules.length || importedCourse.resources.length !== modules.length) throw new Error('课程专题、阶段或资源数量不完整');
  const labIds = new Set(data.labs.map((item) => item.id));
  const questionIds = new Set(data.questionBank.map((item) => item.id));
  for (const stage of importedCourse.stages) {
    if (!stage.content || !stage.resourceIds.length) throw new Error(`课程阶段内容不完整：${stage.id}`);
    if (stage.labId && !labIds.has(stage.labId)) throw new Error(`课程阶段引用了不存在的实验：${stage.labId}`);
  }
  for (const resource of importedCourse.resources) {
    const url = new URL(resource.url);
    if (url.protocol !== 'https:' || url.hostname !== 'zhenchao125.github.io' || resource.status !== '已发布') throw new Error(`教学资源地址无效：${resource.id}`);
  }
  for (const lab of data.labs.filter((item) => String(item.id).startsWith(PREFIX))) {
    if (lab.state !== '已发布' || !lab.repository?.files?.length || !lab.checkpoints?.length) throw new Error(`实验配置不完整：${lab.id}`);
    for (const cp of lab.checkpoints) {
      const tests = cp.evaluationConfig?.tests || [];
      if (!tests.some((item) => item.visibility === 'public') || !tests.some((item) => item.visibility === 'hidden')) throw new Error(`实验关卡缺少公开或隐藏测试：${cp.id}`);
    }
  }
  for (const reference of importedCourse.exams.flatMap((exam) => exam.questionRefs || [])) if (!questionIds.has(reference.questionId)) throw new Error(`考试引用题目不存在：${reference.questionId}`);
  return data;
}

if (require.main === module) {
  const [, , input, output] = process.argv;
  if (!input || !output) throw new Error('用法：node scripts/import-bigdata-course.js <现有数据.json> <输出数据.json>');
  const inputPath = path.resolve(input);
  const outputPath = path.resolve(output);
  const current = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const merged = validate(mergeBigDataCourse(current));
  fs.writeFileSync(outputPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ output: outputPath, courseId: COURSE_ID, stages: modules.length, resources: modules.length, labs: labs().length, questions: questions().length }, null, 2));
}

module.exports = { COURSE_ID, PREFIX, SOURCE_REPOSITORY, SOURCE_SITE, modules, course, labs, questions, mergeBigDataCourse, validate };
