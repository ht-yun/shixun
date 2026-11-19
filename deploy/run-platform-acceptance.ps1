param([string]$BaseUrl = 'http://127.0.0.1:8080')
$ErrorActionPreference = 'Stop'

$securePassword = Read-Host 'CloudLab admin password' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
$plainPassword = $null
try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $loginBody = @{ username = 'cloudlab-admin'; password = $plainPassword } | ConvertTo-Json
    $login = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/auth/login" -Body $loginBody -ContentType 'application/json' -WebSession $session -TimeoutSec 30
    $cluster = Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/cluster/status" -WebSession $session -TimeoutSec 30
    $bootstrap = Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/bootstrap?runtime=1" -WebSession $session -TimeoutSec 60

    $hdfsLabId = 'bigdata-import-lab-hdfs-cluster'
    $hdfsRoot = "/user/cloudlab/labs/$hdfsLabId"
    $commands = @(
        "hdfs dfs -mkdir -p $hdfsRoot/input",
        "hdfs dfs -put data/words.txt $hdfsRoot/input/words.txt",
        "hdfs dfs -cat $hdfsRoot/input/words.txt"
    )
    $hdfsOutputs = @()
    foreach ($command in $commands) {
        $body = @{ labId = $hdfsLabId; command = $command } | ConvertTo-Json
        $result = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/lab/execute" -Body $body -ContentType 'application/json' -WebSession $session -TimeoutSec 360
        $hdfsOutputs += [pscustomobject]@{ command = $command; exitCode = $result.exitCode; output = $result.output }
        if ($result.exitCode -ne 0) { throw "HDFS command failed: $command" }
    }

    $hdfsHeaders = @{ 'X-Lab-Id' = $hdfsLabId; 'X-Checkpoint-Id' = 'bigdata-import-cp-hdfs-cluster'; 'X-Lab-Formal' = 'true' }
    $hdfsTest = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/lab/test" -Headers $hdfsHeaders -Body '{}' -ContentType 'application/json' -WebSession $session -TimeoutSec 360

    $sparkHeaders = @{ 'X-Lab-Id' = 'bigdata-import-lab-spark-cluster'; 'X-Checkpoint-Id' = 'bigdata-import-cp-spark-cluster'; 'X-Lab-Formal' = 'true' }
    $sparkTest = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/lab/test" -Headers $sparkHeaders -Body '{}' -ContentType 'application/json' -WebSession $session -TimeoutSec 600

    [pscustomobject]@{
        loginUser = $login.user.username
        authRole = $login.user.role
        courseCount = @($bootstrap.courses).Count
        clusterLabCount = @($bootstrap.labs | Where-Object { $_.runtimeProfile -eq 'hadoop-spark' }).Count
        clusterHealthy = [bool]$cluster.healthy
        hadoop = $cluster.hadoop
        spark = $cluster.spark
        hdfsCommands = $hdfsOutputs
        hdfsPassed = [bool]$hdfsTest.passed
        hdfsScore = $hdfsTest.score
        sparkPassed = [bool]$sparkTest.passed
        sparkScore = $sparkTest.score
        verifiedAt = (Get-Date).ToString('o')
    } | ConvertTo-Json -Depth 8 | Set-Content -Path 'C:\cloudlab\runtime\platform-acceptance.json' -Encoding UTF8
    Write-Output 'PLATFORM_ACCEPTANCE_COMPLETED'
    Get-Content 'C:\cloudlab\runtime\platform-acceptance.json'
}
finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $plainPassword = $null
    $securePassword = $null
}
