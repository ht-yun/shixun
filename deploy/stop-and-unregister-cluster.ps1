$ErrorActionPreference = 'Stop'

$securePassword = Read-Host 'CloudLab service password' -AsSecureString
$serviceAccount = "$env:COMPUTERNAME\cloudlabsvc"
$credential = New-Object System.Management.Automation.PSCredential($serviceAccount, $securePassword)
$plainPassword = $credential.GetNetworkCredential().Password
$clusterTasks = @('CloudLabBigDataCluster', 'CloudLabClusterInstall', 'CloudLabClusterDiagnostic', 'CloudLabClusterInspect')

try {
    foreach ($taskName in $clusterTasks) {
        $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        if ($task -and $task.State -eq 'Running') { Stop-ScheduledTask -TaskName $taskName }
    }
    Start-Sleep -Seconds 3

    $stopAction = New-ScheduledTaskAction `
        -Execute 'C:\Windows\System32\wsl.exe' `
        -Argument '-d CloudLabUbuntu -u cloudlab -- bash /opt/cloudlab-cluster/cluster-stop.sh'
    $stopSettings = New-ScheduledTaskSettingsSet `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries
    Register-ScheduledTask `
        -TaskName 'CloudLabClusterStopOnce' `
        -Action $stopAction `
        -Settings $stopSettings `
        -User $serviceAccount `
        -Password $plainPassword `
        -RunLevel Limited `
        -Force | Out-Null
    Start-ScheduledTask -TaskName 'CloudLabClusterStopOnce'

    $deadline = (Get-Date).AddMinutes(8)
    do {
        Start-Sleep -Seconds 3
        $state = (Get-ScheduledTask -TaskName 'CloudLabClusterStopOnce').State
    } while ($state -eq 'Running' -and (Get-Date) -lt $deadline)
    if ($state -eq 'Running') { throw 'Timed out while stopping the big-data cluster.' }

    Unregister-ScheduledTask -TaskName 'CloudLabClusterStopOnce' -Confirm:$false
    foreach ($taskName in $clusterTasks) {
        if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
            Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        }
    }
    Write-Output 'CLUSTER_STOPPED_AND_TASKS_UNREGISTERED'
}
finally {
    $plainPassword = $null
    $credential = $null
    $securePassword = $null
}
