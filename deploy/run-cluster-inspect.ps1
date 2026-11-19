$ErrorActionPreference = 'Stop'
$serviceAccount = "$env:COMPUTERNAME\cloudlabsvc"
$securePassword = Read-Host 'CloudLab service password' -AsSecureString
$credential = New-Object System.Management.Automation.PSCredential($serviceAccount, $securePassword)
$plainPassword = $credential.GetNetworkCredential().Password
try {
    $action = New-ScheduledTaskAction `
        -Execute 'C:\Windows\System32\wsl.exe' `
        -Argument '-d CloudLabUbuntu -u cloudlab -- bash /mnt/c/cloudlab/cluster/inspect-bigdata-cluster.sh'
    $settings = New-ScheduledTaskSettingsSet `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries
    Register-ScheduledTask `
        -TaskName 'CloudLabClusterInspect' `
        -Action $action `
        -Settings $settings `
        -User $serviceAccount `
        -Password $plainPassword `
        -RunLevel Limited `
        -Force | Out-Null
    Start-ScheduledTask -TaskName 'CloudLabClusterInspect'
    Write-Output 'CLUSTER_INSPECT_STARTED'
}
finally {
    $plainPassword = $null
    $credential = $null
    $securePassword = $null
}
