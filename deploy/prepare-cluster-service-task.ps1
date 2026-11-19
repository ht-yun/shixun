$ErrorActionPreference = 'Stop'

$securePassword = Read-Host 'CloudLab service password' -AsSecureString
$serviceAccount = "$env:COMPUTERNAME\cloudlabsvc"
$credential = New-Object System.Management.Automation.PSCredential($serviceAccount, $securePassword)
$plainPassword = $credential.GetNetworkCredential().Password

try {
    $action = New-ScheduledTaskAction `
        -Execute 'C:\Windows\System32\wsl.exe' `
        -Argument '-d CloudLabUbuntu -u cloudlab -- bash /mnt/c/cloudlab/cluster/cluster-service.sh'
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $settings = New-ScheduledTaskSettingsSet `
        -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -RestartCount 99 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries
    Register-ScheduledTask `
        -TaskName 'CloudLabBigDataCluster' `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -User $serviceAccount `
        -Password $plainPassword `
        -RunLevel Limited `
        -Force | Out-Null
    Start-ScheduledTask -TaskName 'CloudLabBigDataCluster'
    Write-Output 'CLUSTER_SERVICE_TASK_STARTED'
}
finally {
    $plainPassword = $null
    $credential = $null
    $securePassword = $null
}
