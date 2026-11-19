"""Deploy only CloudLab runtime files, with scoped backups and rollback."""
from __future__ import annotations

import os
import sys
import time
from datetime import datetime
from pathlib import Path

import paramiko

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
FILES = ("local-server.js", "terminal-gateway.js")


def run(client: paramiko.SSHClient, command: str, timeout: int = 60) -> str:
    _stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
    result = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    if stdout.channel.recv_exit_status() != 0:
        raise RuntimeError(error or result or "remote command failed")
    return result.strip()


def restart_cloudlab(client: paramiko.SSHClient, copies: str) -> None:
    command = (
        'powershell -NoProfile -Command "'
        'Stop-ScheduledTask -TaskName CloudLab -ErrorAction SilentlyContinue; '
        'for ($i=0; $i -lt 20; $i++) { '
        'if ((Get-ScheduledTask -TaskName CloudLab).State -ne \'Running\') { break }; '
        'Start-Sleep -Seconds 1 }; '
        f'{copies}; '
        'Start-ScheduledTask -TaskName CloudLab; '
        'Start-Sleep -Seconds 3; '
        '(Get-ScheduledTask -TaskName CloudLab).State"'
    )
    run(client, command, timeout=70)


def main() -> None:
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
    backup_dir = f"C:/cloudlab/backups/core-runtime-{datetime.now():%Y%m%d-%H%M%S}"
    changed = False
    try:
        sftp = client.open_sftp()
        try:
            sftp.stat("C:/cloudlab/backups")
            sftp.mkdir(backup_dir)
            for name in FILES:
                with sftp.open(f"C:/cloudlab/{name}", "rb") as source, sftp.open(f"{backup_dir}/{name}", "wb") as destination:
                    while chunk := source.read(1024 * 1024):
                        destination.write(chunk)
                sftp.put(str(ROOT / name), f"C:/cloudlab/{name.removesuffix('.js')}.next.js")
        finally:
            sftp.close()
        for name in FILES:
            staged = name.removesuffix(".js") + ".next.js"
            run(client, f'"C:\\Program Files\\nodejs\\node.exe" --check C:\\cloudlab\\{staged}')
        copies = "; ".join(f"Copy-Item -Force C:\\cloudlab\\{name.removesuffix('.js')}.next.js C:\\cloudlab\\{name}" for name in FILES)
        changed = True
        restart_cloudlab(client, copies)
        for attempt in range(45):
            time.sleep(2)
            try:
                health = run(client, 'powershell -NoProfile -Command "(Invoke-RestMethod http://127.0.0.1:8080/api/health).status"', timeout=10)
                if "UP" in health:
                    print(f"DEPLOY_OK backup={backup_dir} health=UP")
                    return
            except Exception as error:
                if attempt in (0, 9, 19, 29, 39):
                    print(f"health pending: {type(error).__name__}", flush=True)
        raise RuntimeError("CloudLab health check did not recover")
    except Exception:
        if changed:
            copies = "; ".join(f"Copy-Item -Force {backup_dir.replace('/', chr(92))}\\{name} C:\\cloudlab\\{name}" for name in FILES)
            restart_cloudlab(client, copies)
            print("ROLLED_BACK", file=sys.stderr)
        raise
    finally:
        client.close()


if __name__ == "__main__":
    main()
