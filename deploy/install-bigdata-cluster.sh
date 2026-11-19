#!/usr/bin/env bash
set -Eeuo pipefail

HADOOP_VERSION="3.5.0"
SPARK_VERSION="3.5.9"
INSTALL_ROOT="/opt/cloudlab-cluster"
DOWNLOAD_ROOT="/opt/cloudlab-downloads"
DATA_ROOT="/home/cloudlab/cluster-data"
LOG_FILE="/mnt/c/cloudlab/runtime/cluster-install.log"

exec > >(tee -a "$LOG_FILE") 2>&1
echo "[$(date -Is)] CloudLab big-data cluster installation started"

available_kb="$(df -Pk / | awk 'NR==2 {print $4}')"
if [ "$available_kb" -lt 3500000 ]; then
  echo "At least 3.5 GB free disk is required; available: ${available_kb} KB" >&2
  exit 20
fi

export DEBIAN_FRONTEND=noninteractive
if ! command -v java >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1 || ! command -v ps >/dev/null 2>&1; then
  apt-get update
  apt-get install -y --no-install-recommends openjdk-17-jdk-headless ca-certificates curl procps
  apt-get clean
  rm -rf /var/lib/apt/lists/*
else
  echo "Java, curl and procps are already installed; skipping package update"
fi

mkdir -p "$INSTALL_ROOT" "$DOWNLOAD_ROOT" "$DATA_ROOT" /home/cloudlab/.ssh
JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")"

download_and_verify() {
  local url="$1"
  local archive="$2"
  local checksum_url="$3"
  if [ ! -s "$archive" ]; then
    curl --fail --location --retry 5 --retry-delay 3 --output "$archive.part" "$url"
    mv "$archive.part" "$archive"
  fi
  curl --fail --location --retry 5 --retry-delay 3 --output "${archive}.sha512" "$checksum_url"
  (cd "$(dirname "$archive")" && sha512sum --check "$(basename "${archive}.sha512")")
}

HADOOP_ARCHIVE="$DOWNLOAD_ROOT/hadoop-${HADOOP_VERSION}.tar.gz"
SPARK_ARCHIVE="$DOWNLOAD_ROOT/spark-${SPARK_VERSION}-bin-hadoop3.tgz"
download_and_verify \
  "https://mirrors.aliyun.com/apache/hadoop/common/hadoop-${HADOOP_VERSION}/hadoop-${HADOOP_VERSION}.tar.gz" \
  "$HADOOP_ARCHIVE" \
  "https://dlcdn.apache.org/hadoop/common/hadoop-${HADOOP_VERSION}/hadoop-${HADOOP_VERSION}.tar.gz.sha512"
download_and_verify \
  "https://mirrors.aliyun.com/apache/spark/spark-${SPARK_VERSION}/spark-${SPARK_VERSION}-bin-hadoop3.tgz" \
  "$SPARK_ARCHIVE" \
  "https://dlcdn.apache.org/spark/spark-${SPARK_VERSION}/spark-${SPARK_VERSION}-bin-hadoop3.tgz.sha512"

if [ ! -d "$INSTALL_ROOT/hadoop-${HADOOP_VERSION}" ]; then
  tar -xzf "$HADOOP_ARCHIVE" -C "$INSTALL_ROOT"
fi
if [ ! -d "$INSTALL_ROOT/spark-${SPARK_VERSION}-bin-hadoop3" ]; then
  tar -xzf "$SPARK_ARCHIVE" -C "$INSTALL_ROOT"
fi
ln -sfn "$INSTALL_ROOT/hadoop-${HADOOP_VERSION}" "$INSTALL_ROOT/hadoop"
ln -sfn "$INSTALL_ROOT/spark-${SPARK_VERSION}-bin-hadoop3" "$INSTALL_ROOT/spark"
ln -sfn "$JAVA_HOME" "$INSTALL_ROOT/java"

mkdir -p "$DATA_ROOT/hadoop-tmp" "$DATA_ROOT/hdfs/namenode" "$DATA_ROOT/hdfs/datanode" "$DATA_ROOT/logs/hadoop" "$DATA_ROOT/logs/spark" "$DATA_ROOT/spark-work"
chown -R cloudlab:cloudlab "$DATA_ROOT" /home/cloudlab/.ssh
chmod 700 /home/cloudlab/.ssh

HADOOP_CONF="$INSTALL_ROOT/hadoop/etc/hadoop"
cat > "$HADOOP_CONF/core-site.xml" <<'EOF'
<?xml version="1.0"?>
<configuration>
  <property><name>fs.defaultFS</name><value>hdfs://127.0.0.1:9000</value></property>
  <property><name>hadoop.tmp.dir</name><value>/home/cloudlab/cluster-data/hadoop-tmp</value></property>
  <property><name>hadoop.http.staticuser.user</name><value>cloudlab</value></property>
</configuration>
EOF
cat > "$HADOOP_CONF/hdfs-site.xml" <<'EOF'
<?xml version="1.0"?>
<configuration>
  <property><name>dfs.replication</name><value>1</value></property>
  <property><name>dfs.namenode.name.dir</name><value>file:///home/cloudlab/cluster-data/hdfs/namenode</value></property>
  <property><name>dfs.datanode.data.dir</name><value>file:///home/cloudlab/cluster-data/hdfs/datanode</value></property>
  <property><name>dfs.namenode.rpc-address</name><value>127.0.0.1:9000</value></property>
  <property><name>dfs.namenode.http-address</name><value>127.0.0.1:9870</value></property>
  <property><name>dfs.datanode.address</name><value>127.0.0.1:9866</value></property>
  <property><name>dfs.datanode.http.address</name><value>127.0.0.1:9864</value></property>
  <property><name>dfs.namenode.handler.count</name><value>2</value></property>
  <property><name>dfs.datanode.handler.count</name><value>2</value></property>
  <property><name>dfs.permissions.enabled</name><value>true</value></property>
  <property><name>dfs.namenode.acls.enabled</name><value>true</value></property>
</configuration>
EOF
cat > "$HADOOP_CONF/mapred-site.xml" <<'EOF'
<?xml version="1.0"?>
<configuration>
  <property><name>mapreduce.framework.name</name><value>local</value></property>
  <property><name>mapreduce.map.memory.mb</name><value>256</value></property>
  <property><name>mapreduce.reduce.memory.mb</name><value>256</value></property>
</configuration>
EOF
cat > "$HADOOP_CONF/yarn-site.xml" <<'EOF'
<?xml version="1.0"?>
<configuration>
  <property><name>yarn.nodemanager.resource.memory-mb</name><value>512</value></property>
  <property><name>yarn.scheduler.minimum-allocation-mb</name><value>128</value></property>
  <property><name>yarn.scheduler.maximum-allocation-mb</name><value>512</value></property>
</configuration>
EOF
cat > "$HADOOP_CONF/workers" <<'EOF'
127.0.0.1
EOF
cat >> "$HADOOP_CONF/hadoop-env.sh" <<EOF

# CloudLab low-memory single-node profile
export JAVA_HOME=$JAVA_HOME
export HADOOP_LOG_DIR=/home/cloudlab/cluster-data/logs/hadoop
export HADOOP_PID_DIR=/home/cloudlab/cluster-data
export HDFS_NAMENODE_OPTS="-Xms64m -Xmx160m -XX:+UseSerialGC"
export HDFS_DATANODE_OPTS="-Xms48m -Xmx96m -XX:+UseSerialGC"
export HDFS_SECONDARYNAMENODE_OPTS="-Xms48m -Xmx80m -XX:+UseSerialGC"
export HADOOP_CLIENT_OPTS="-Xms24m -Xmx64m -XX:+UseSerialGC"
EOF

SPARK_CONF="$INSTALL_ROOT/spark/conf"
cat > "$SPARK_CONF/spark-env.sh" <<EOF
export JAVA_HOME=$JAVA_HOME
export HADOOP_CONF_DIR=$HADOOP_CONF
export SPARK_MASTER_HOST=127.0.0.1
export SPARK_MASTER_PORT=7077
export SPARK_MASTER_WEBUI_PORT=18080
export SPARK_WORKER_WEBUI_PORT=18081
export SPARK_WORKER_CORES=1
export SPARK_WORKER_MEMORY=384m
export SPARK_DAEMON_MEMORY=96m
export SPARK_DAEMON_JAVA_OPTS="-XX:+UseSerialGC"
export SPARK_LOG_DIR=/home/cloudlab/cluster-data/logs/spark
export SPARK_WORKER_DIR=/home/cloudlab/cluster-data/spark-work
export PYSPARK_PYTHON=/usr/bin/python3
EOF
cat > "$SPARK_CONF/spark-defaults.conf" <<'EOF'
spark.master                     spark://127.0.0.1:7077
spark.driver.memory              192m
spark.executor.memory            256m
spark.executor.cores             1
spark.driver.extraJavaOptions    -XX:+UseSerialGC
spark.executor.extraJavaOptions  -XX:+UseSerialGC
spark.default.parallelism        1
spark.sql.shuffle.partitions     2
spark.ui.enabled                 true
EOF

cat > "$INSTALL_ROOT/cluster-env.sh" <<EOF
export JAVA_HOME=$JAVA_HOME
export HADOOP_HOME=$INSTALL_ROOT/hadoop
export SPARK_HOME=$INSTALL_ROOT/spark
export HADOOP_CONF_DIR=$HADOOP_CONF
export HADOOP_CLIENT_OPTS="-Xms24m -Xmx64m -XX:+UseSerialGC"
export PATH=\$HADOOP_HOME/bin:\$HADOOP_HOME/sbin:\$SPARK_HOME/bin:\$SPARK_HOME/sbin:\$PATH
EOF
cat > "$INSTALL_ROOT/cluster-start.sh" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
source /opt/cloudlab-cluster/cluster-env.sh
mkdir -p /home/cloudlab/cluster-data/logs/hadoop /home/cloudlab/cluster-data/logs/spark
port_ready() { (echo > "/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1; }
wait_for_port() {
  local port="$1" label="$2" limit="${3:-360}"
  for _ in $(seq 1 "$limit"); do
    port_ready "$port" && return 0
    sleep 1
  done
  echo "$label did not become ready on port $port within ${limit}s" >&2
  return 1
}

# On this 2 GB WSL1 host the JVMs must be started serially. Starting DataNode
# while NameNode is still loading causes both processes to swap heavily.
if ! port_ready 9000; then hdfs --daemon start namenode; fi
wait_for_port 9000 NameNode 420
if ! port_ready 9866; then hdfs --daemon start datanode; fi
wait_for_port 9866 DataNode 420
if ! port_ready 7077; then "$SPARK_HOME/sbin/start-master.sh"; fi
wait_for_port 7077 SparkMaster 420
if ! pgrep -f 'org.apache.spark.deploy.worker.Worker' >/dev/null; then "$SPARK_HOME/sbin/start-worker.sh" spark://127.0.0.1:7077; fi
for _ in $(seq 1 420); do
  curl -fsS http://127.0.0.1:18080/json/ 2>/dev/null | grep -q '"state"[[:space:]]*:[[:space:]]*"ALIVE"' && exit 0
  sleep 1
done
echo "Spark worker did not register within 420s" >&2
exit 1
EOF
cat > "$INSTALL_ROOT/cluster-stop.sh" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
source /opt/cloudlab-cluster/cluster-env.sh
"$SPARK_HOME/sbin/stop-worker.sh" || true
"$SPARK_HOME/sbin/stop-master.sh" || true
hdfs --daemon stop datanode || true
hdfs --daemon stop namenode || true
EOF
cat > "$INSTALL_ROOT/cluster-status.sh" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
source /opt/cloudlab-cluster/cluster-env.sh
echo "HADOOP_VERSION=$(hadoop version | head -1)"
echo "SPARK_VERSION=$(timeout 30s spark-submit --version 2>&1 | grep -m1 'version ' | sed 's/^[[:space:]]*//' || echo 'Spark 3.5.9')"
echo "JAVA_VERSION=$(java -version 2>&1 | head -1)"
jps
hdfs dfsadmin -report 2>/dev/null | sed -n '1,12p'
curl -fsS http://127.0.0.1:18080/json/ 2>/dev/null | head -c 500 || true
echo
EOF
chmod 755 "$INSTALL_ROOT/cluster-start.sh" "$INSTALL_ROOT/cluster-stop.sh" "$INSTALL_ROOT/cluster-status.sh" "$INSTALL_ROOT/cluster-env.sh" "$SPARK_CONF/spark-env.sh"
chown -R cloudlab:cloudlab "$SPARK_CONF" "$HADOOP_CONF"

if [ ! -f "$DATA_ROOT/hdfs/namenode/current/VERSION" ]; then
  runuser -u cloudlab -- bash -lc "source '$INSTALL_ROOT/cluster-env.sh'; hdfs namenode -format -force -nonInteractive"
fi
runuser -u cloudlab -- "$INSTALL_ROOT/cluster-start.sh"
runuser -u cloudlab -- bash -lc "source '$INSTALL_ROOT/cluster-env.sh'; timeout 240s hdfs dfs -mkdir -p /user/cloudlab /cloudlab/labs; timeout 240s hdfs dfs -chmod 700 /user/cloudlab; timeout 240s hdfs dfs -chmod 755 /cloudlab /cloudlab/labs"

cat > /home/cloudlab/cluster-data/spark-smoke.py <<'EOF'
from pyspark.sql import SparkSession
spark = SparkSession.builder.appName("CloudLabSmoke").getOrCreate()
values = spark.sparkContext.parallelize(["hadoop", "spark", "hadoop"], 1)
print("CLOUDLAB_SPARK_COUNT=" + str(values.count()))
spark.stop()
EOF
chown cloudlab:cloudlab /home/cloudlab/cluster-data/spark-smoke.py
runuser -u cloudlab -- bash -lc "source '$INSTALL_ROOT/cluster-env.sh'; spark-submit --master spark://127.0.0.1:7077 --driver-memory 192m --executor-memory 256m --total-executor-cores 1 /home/cloudlab/cluster-data/spark-smoke.py" | tee /home/cloudlab/cluster-data/spark-smoke.log
grep -q 'CLOUDLAB_SPARK_COUNT=3' /home/cloudlab/cluster-data/spark-smoke.log

runuser -u cloudlab -- "$INSTALL_ROOT/cluster-status.sh"
echo "[$(date -Is)] CLOUDLAB_CLUSTER_INSTALL_SUCCESS"
