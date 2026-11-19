$ErrorActionPreference = 'Stop'

$securePassword = Read-Host 'CloudLab service password' -AsSecureString
$serviceAccount = "$env:COMPUTERNAME\cloudlabsvc"
$credential = New-Object System.Management.Automation.PSCredential($serviceAccount, $securePassword)
$plainPassword = $credential.GetNetworkCredential().Password

try {
    $existing = Get-ScheduledTask -TaskName 'CloudLab'
    $settings = New-ScheduledTaskSettingsSet `
        -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -RestartCount 99 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -StartWhenAvailable `
        -MultipleInstances IgnoreNew `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries
    Register-ScheduledTask `
        -TaskName 'CloudLab' `
        -Action $existing.Actions `
        -Trigger $existing.Triggers `
        -Settings $settings `
        -User $serviceAccount `
        -Password $plainPassword `
        -RunLevel Limited `
        -Force | Out-Null
    Start-ScheduledTask -TaskName 'CloudLab'
    Write-Output 'CLOUDLAB_TASK_HARDENED'
}
finally {
    $plainPassword = $null
    $credential = $null
    $securePassword = $null
}
