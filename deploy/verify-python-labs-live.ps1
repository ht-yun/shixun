param(
    [string]$BaseUrl = 'http://39.101.68.12:8080',
    [string]$Username = 'teacher',
    [string]$Password
)

$ErrorActionPreference = 'Stop'
$examples = @(
    @{ Lab = 'bigdata-import-lab-wordcount'; Checkpoint = 'bigdata-import-cp-wordcount'; Code = @'
from collections import Counter
words = Counter(open('data/words.txt', encoding='utf-8').read().split())
for word, count in sorted(words.items()):
    print(word, count)
'@ },
    @{ Lab = 'bigdata-import-lab-log-etl'; Checkpoint = 'bigdata-import-cp-log-etl'; Code = @'
import csv
rows = list(csv.DictReader(open('data/access.csv', encoding='utf-8')))
valid = [row for row in rows if row.get('ip') and row.get('status') and row.get('path')]
print('有效记录:', len(valid))
print('成功请求:', sum(row['status'] == '200' for row in valid))
print('独立IP:', len({row['ip'] for row in valid}))
'@ },
    @{ Lab = 'bigdata-import-lab-stream'; Checkpoint = 'bigdata-import-cp-stream'; Code = @'
import json
rows = [json.loads(line) for line in open('data/messages.jsonl', encoding='utf-8')]
for topic in ('orders', 'users'):
    print(f'{topic}消息数:', sum(row['topic'] == topic for row in rows))
print('orders总额:', sum(row['value'] for row in rows if row['topic'] == 'orders'))
'@ }
)
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ username = $Username; password = $Password } | ConvertTo-Json
Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -ContentType 'application/json' -Body $body -WebSession $session | Out-Null
foreach ($example in $examples) {
    $headers = @{ 'X-Lab-Id' = $example.Lab; 'X-Checkpoint-Id' = $example.Checkpoint }
    $original = (Invoke-RestMethod -Uri "$BaseUrl/api/lab/file?path=main.py" -Headers $headers -WebSession $session).content
    try {
        $payload = @{ labId = $example.Lab; path = 'main.py'; content = $example.Code } | ConvertTo-Json -Depth 5
        Invoke-RestMethod -Uri "$BaseUrl/api/lab/file" -Method Put -Headers $headers -ContentType 'application/json' -Body $payload -WebSession $session | Out-Null
        $headers['X-Lab-Formal'] = 'true'
        $report = Invoke-RestMethod -Uri "$BaseUrl/api/lab/test" -Method Post -Headers $headers -ContentType 'application/json' -Body '{}' -WebSession $session -TimeoutSec 90
        if (-not $report.passed -or $report.score -ne 100 -or @($report.checks).Count -ne 3) {
            throw "Python live evaluation failed: $($report | ConvertTo-Json -Depth 8 -Compress)"
        }
        [pscustomobject]@{ lab = $example.Lab; passed = $report.passed; score = $report.score; checks = @($report.checks).Count } | ConvertTo-Json -Compress
    }
    finally {
        $restore = @{ labId = $example.Lab; path = 'main.py'; content = $original } | ConvertTo-Json -Depth 5
        Invoke-RestMethod -Uri "$BaseUrl/api/lab/file" -Method Put -Headers $headers -ContentType 'application/json' -Body $restore -WebSession $session | Out-Null
    }
}
