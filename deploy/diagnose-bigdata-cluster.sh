#!/usr/bin/env bash
set -u
source /opt/cloudlab-cluster/cluster-env.sh
LOG=/mnt/c/cloudlab/runtime/cluster-diagnostic.log
exec > >(tee "$LOG") 2>&1

echo "[$(date -Is)] cluster diagnosis started"
free -h
df -h /
java -version
timeout 20s hadoop version | sed -n '1,3p' || echo "HADOOP_VERSION_CHECK_TIMEOUT"
# Spark's ASCII banner can be unusually slow on this memory-constrained WSL1
# host.  It is not needed to diagnose HDFS, so keep it bounded and continue.
timeout 20s spark-submit --version 2>&1 | sed -n '1,8p' || echo "SPARK_VERSION_CHECK_TIMEOUT"

pkill -f 'org.apache.hadoop.hdfs.server.namenode.NameNode' 2>/dev/null || true
pkill -f 'org.apache.hadoop.hdfs.server.datanode.DataNode' 2>/dev/null || true
sleep 2

echo "Starting NameNode in foreground-capture mode"
hdfs namenode > /mnt/c/cloudlab/runtime/diagnostic-namenode.log 2>&1 &
NN_PID=$!
for _ in $(seq 1 45); do
  kill -0 "$NN_PID" 2>/dev/null || break
  (echo > /dev/tcp/127.0.0.1/9000) >/dev/null 2>&1 && break
  sleep 1
done
echo "NAMENODE_PID=$NN_PID ALIVE=$(kill -0 "$NN_PID" 2>/dev/null && echo yes || echo no)"

echo "Starting DataNode in foreground-capture mode"
hdfs datanode > /mnt/c/cloudlab/runtime/diagnostic-datanode.log 2>&1 &
DN_PID=$!
for _ in $(seq 1 45); do
  kill -0 "$DN_PID" 2>/dev/null || break
  hdfs dfsadmin -report >/mnt/c/cloudlab/runtime/diagnostic-report.log 2>&1 && break
  sleep 1
done
echo "DATANODE_PID=$DN_PID ALIVE=$(kill -0 "$DN_PID" 2>/dev/null && echo yes || echo no)"

hdfs dfsadmin -report || true
echo "--- NameNode tail ---"
tail -80 /mnt/c/cloudlab/runtime/diagnostic-namenode.log || true
echo "--- DataNode tail ---"
tail -80 /mnt/c/cloudlab/runtime/diagnostic-datanode.log || true

kill "$DN_PID" "$NN_PID" 2>/dev/null || true
wait "$DN_PID" 2>/dev/null || true
wait "$NN_PID" 2>/dev/null || true
echo "[$(date -Is)] cluster diagnosis finished"
