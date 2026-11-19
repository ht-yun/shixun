#!/usr/bin/env bash
set -u
source /opt/cloudlab-cluster/cluster-env.sh
LOG=/mnt/c/cloudlab/runtime/cluster-inspect.log
exec >"$LOG" 2>&1

echo "[$(date -Is)] cluster inspection"
free -h
df -h /
ps -eo pid,ppid,rss,etimes,args | grep -E 'NameNode|DataNode|spark.deploy.(master|worker)' | grep -v grep || true
echo "=== all Java processes ==="
ps -eo pid,ppid,rss,etimes,args | grep '[j]ava' || true
for port in 9000 9866 9870 7077 18080 18081; do
  if timeout 2 bash -c "echo >/dev/tcp/127.0.0.1/$port" >/dev/null 2>&1; then
    echo "PORT_${port}=UP"
  else
    echo "PORT_${port}=DOWN"
  fi
done

for directory in /home/cloudlab/cluster-data/logs/hadoop /home/cloudlab/cluster-data/logs/spark; do
  echo "=== $directory ==="
  ls -lah "$directory" 2>/dev/null || true
  for file in "$directory"/*.log "$directory"/*.out; do
    [ -f "$file" ] || continue
    echo "--- $file ---"
    grep -E 'ERROR|FATAL|Exception|OutOfMemory|SHUTDOWN_MSG|failed to launch' "$file" | tail -40 || true
    tail -60 "$file" || true
  done
done
