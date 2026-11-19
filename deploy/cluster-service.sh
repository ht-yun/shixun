#!/usr/bin/env bash
set -u

source /opt/cloudlab-cluster/cluster-env.sh
LOG=/mnt/c/cloudlab/runtime/cluster-service.log
mkdir -p "$(dirname "$LOG")"
exec >>"$LOG" 2>&1

port_ready() { timeout 2 bash -c "echo >/dev/tcp/127.0.0.1/$1" >/dev/null 2>&1; }
log() { echo "[$(date -Is)] $*"; }

ensure_cluster() {
  if ! port_ready 9000; then
    log "starting NameNode"
    hdfs --daemon start namenode || true
  fi
  for _ in $(seq 1 180); do port_ready 9000 && break; sleep 1; done

  if port_ready 9000 && ! port_ready 9866; then
    log "starting DataNode"
    hdfs --daemon start datanode || true
  fi
  for _ in $(seq 1 180); do port_ready 9866 && break; sleep 1; done

  if ! port_ready 7077; then
    log "starting Spark master"
    "$SPARK_HOME/sbin/start-master.sh" || true
  fi
  for _ in $(seq 1 180); do port_ready 7077 && break; sleep 1; done

  if port_ready 7077 && ! port_ready 18081; then
    log "starting Spark worker"
    "$SPARK_HOME/sbin/start-worker.sh" spark://127.0.0.1:7077 || true
  fi
}

log "CloudLab big-data supervisor started"
while true; do
  ensure_cluster
  states="9000=$(port_ready 9000 && echo up || echo down) 9866=$(port_ready 9866 && echo up || echo down) 7077=$(port_ready 7077 && echo up || echo down) 18081=$(port_ready 18081 && echo up || echo down)"
  log "$states"
  sleep 30
done
