"""Remove the retired web-desktop feature from the Windows CloudLab deployment."""
from __future__ import annotations

import os
import posixpath
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
HOST = os.environ["CLOUDLAB_SSH_HOST"]
USER = os.environ["CLOUDLAB_SSH_USER"]
PASSWORD = os.environ["CLOUDLAB_SSH_PASSWORD"]
FILES = [
    "app.js", "index.html", "styles.css", "portal.js", "local-server.js",
    "terminal-gateway.js", "package.json", "package-lock.json",
    "scripts/remove-desktop-feature.js",
]


def run(client: paramiko.SSHClient, command: str, timeout: int = 120) -> str:
    print(f"> {command}", flush=True)
    _stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    errors = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if output:
        print(output, end="", flush=True)
    if errors:
        print(errors, end="", file=sys.stderr, flush=True)
    if code != 0:
        raise RuntimeError(f"remote command failed ({code})")
    return output


def main() -> None:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=20, banner_timeout=30, auth_timeout=20)
    try:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = f"C:\\cloudlab\\backups\\remove-desktop-{stamp}"
        run(client, f'powershell -NoProfile -Command "New-Item -ItemType Directory -Force -Path \'{backup}\',\'C:\\cloudlab\\scripts\' | Out-Null; Copy-Item -Force C:\\cloudlab\\app.js,C:\\cloudlab\\index.html,C:\\cloudlab\\styles.css,C:\\cloudlab\\portal.js,C:\\cloudlab\\local-server.js,C:\\cloudlab\\terminal-gateway.js,C:\\cloudlab\\start-cloudlab.cmd,C:\\cloudlab\\local-data.json \'{backup}\'"')
        sftp = client.open_sftp()
        try:
            for name in FILES:
                remote = posixpath.join("C:/cloudlab", name)
                print(f"upload {name}", flush=True)
                sftp.put(str(ROOT / name), remote)
            start_path = "C:/cloudlab/start-cloudlab.cmd"
            with sftp.open(start_path, "rb") as handle:
                lines = handle.read().decode("utf-8-sig").splitlines()
            lines = [line for line in lines if not line.startswith("set CLOUDLAB_WSL_DESKTOP_")]
            with sftp.open(start_path, "wb") as handle:
                handle.write(("\r\n".join(lines) + "\r\n").encode("utf-8"))
        finally:
            sftp.close()

        run(client, r'"C:\Program Files\nodejs\node.exe" C:\cloudlab\scripts\remove-desktop-feature.js C:\cloudlab\local-data.json')
        cleanup = (
            "Remove-Item -Force -ErrorAction SilentlyContinue "
            "'C:\\cloudlab\\wsl-desktop-gateway.js',"
            "'C:\\cloudlab\\vendor\\novnc-rfb.mjs',"
            "'C:\\cloudlab\\scripts\\wsl-desktop-session.sh',"
            "'C:\\cloudlab\\scripts\\build-cloudlab-service-wsl.sh',"
            "'C:\\cloudlab\\scripts\\import-cloudlab-service-wsl.cmd',"
            "'C:\\cloudlab\\scripts\\provision-cloudlab-service-wsl.ps1',"
            "'C:\\cloudlab\\wsl\\cloudlab-service-rootfs.tar.gz'; "
            "$d='C:\\cloudlab\\wsl\\cloudlabsvc'; if ((Test-Path $d) -and -not (Get-ChildItem -Force $d)) { Remove-Item -LiteralPath $d -Force }"
        )
        run(client, f'powershell -NoProfile -Command "{cleanup}"')
        run(client, 'powershell -NoProfile -Command "Stop-ScheduledTask -TaskName CloudLab -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2; Start-ScheduledTask -TaskName CloudLab; Start-Sleep -Seconds 7; (Get-ScheduledTask -TaskName CloudLab).State; Invoke-RestMethod http://127.0.0.1:8080/api/health | ConvertTo-Json -Compress"', timeout=60)
        print(f"REMOVE_DESKTOP_OK backup={backup}")
    finally:
        client.close()


if __name__ == "__main__":
    main()
