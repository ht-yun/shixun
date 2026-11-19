param(
    [string]$BaseUrl = 'http://39.101.68.12:8080',
    [string]$Username = 'teacher',
    [string]$Password
)

$ErrorActionPreference = 'Stop'
$labId = 'bigdata-import-lab-sql-analysis'
$checkpointId = 'bigdata-import-cp-sql-analysis'
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginBody = @{ username = $Username; password = $Password } | ConvertTo-Json
Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -ContentType 'application/json' -Body $loginBody -WebSession $session | Out-Null
$headers = @{ 'X-Lab-Id' = $labId; 'X-Checkpoint-Id' = $checkpointId }
$file = Invoke-RestMethod -Uri "$BaseUrl/api/lab/file?path=main.sql" -Headers $headers -WebSession $session
$original = $file.content
$solution = $original + "`nSELECT region, SUM(amount) AS total_amount FROM sales GROUP BY region ORDER BY total_amount DESC;`n"
try {
    $payload = @{ labId = $labId; path = 'main.sql'; content = $solution } | ConvertTo-Json -Depth 5
    Invoke-RestMethod -Uri "$BaseUrl/api/lab/file" -Method Put -Headers $headers -ContentType 'application/json' -Body $payload -WebSession $session | Out-Null
    $headers['X-Lab-Formal'] = 'true'
    $report = Invoke-RestMethod -Uri "$BaseUrl/api/lab/test" -Method Post -Headers $headers -ContentType 'application/json' -Body '{}' -WebSession $session -TimeoutSec 90
    if (-not $report.passed -or $report.score -ne 100 -or @($report.checks).Count -ne 3) {
        throw "SQL live evaluation failed: $($report | ConvertTo-Json -Depth 8 -Compress)"
    }
    [pscustomobject]@{ lab = $labId; passed = $report.passed; score = $report.score; checks = @($report.checks).Count; firstActual = $report.checks[0].actual } | ConvertTo-Json -Compress
}
finally {
    $restore = @{ labId = $labId; path = 'main.sql'; content = $original } | ConvertTo-Json -Depth 5
    Invoke-RestMethod -Uri "$BaseUrl/api/lab/file" -Method Put -Headers $headers -ContentType 'application/json' -Body $restore -WebSession $session | Out-Null
}
