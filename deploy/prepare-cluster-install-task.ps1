$ErrorActionPreference = 'Stop'

$securePassword = Read-Host 'CloudLab service password' -AsSecureString
$serviceAccount = "$env:COMPUTERNAME\cloudlabsvc"
$credential = New-Object System.Management.Automation.PSCredential($serviceAccount, $securePassword)
$plainPassword = $credential.GetNetworkCredential().Password

try {
    Set-LocalUser -Name 'cloudlabsvc' -Password $securePassword -PasswordNeverExpires $true -UserMayChangePassword $false

    $cloudLabTask = Get-ScheduledTask -TaskName 'CloudLab'
    Register-ScheduledTask `
        -TaskName 'CloudLab' `
        -Action $cloudLabTask.Actions `
        -Trigger $cloudLabTask.Triggers `
        -Settings $cloudLabTask.Settings `
        -User $serviceAccount `
        -Password $plainPassword `
        -RunLevel Limited `
        -Force | Out-Null

    $installAction = New-ScheduledTaskAction `
        -Execute 'C:\Windows\System32\wsl.exe' `
        -Argument '-d CloudLabUbuntu -u root -- bash /mnt/c/cloudlab/cluster/install-bigdata-cluster.sh'
    $installSettings = New-ScheduledTaskSettingsSet `
        -ExecutionTimeLimit (New-TimeSpan -Hours 3) `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries
    Register-ScheduledTask `
        -TaskName 'CloudLabClusterInstall' `
        -Action $installAction `
        -Settings $installSettings `
        -User $serviceAccount `
        -Password $plainPassword `
        -RunLevel Limited `
        -Force | Out-Null

    Start-ScheduledTask -TaskName 'CloudLabClusterInstall'
    Write-Output 'SERVICE_CREDENTIAL_ROTATED'
    Write-Output 'CLUSTER_INSTALL_TASK_STARTED'
}
finally {
    $plainPassword = $null
    $credential = $null
    $securePassword = $null
}
