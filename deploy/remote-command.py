"""Run one diagnostic command on the authorized CloudLab Windows host."""
import os
import sys
import paramiko

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(
    os.environ["CLOUDLAB_SSH_HOST"],
    username=os.environ["CLOUDLAB_SSH_USER"],
    password=os.environ["CLOUDLAB_SSH_PASSWORD"],
    timeout=20,
    banner_timeout=30,
    auth_timeout=20,
)
try:
    command = sys.argv[1]
    _stdin, stdout, stderr = client.exec_command(command, timeout=int(os.environ.get("CLOUDLAB_REMOTE_TIMEOUT", "120")))
    output = stdout.read().decode("utf-8", "replace")
    errors = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    print(output)
    print(errors, file=sys.stderr)
    print(f"EXIT={code}")
    raise SystemExit(code)
finally:
    client.close()
