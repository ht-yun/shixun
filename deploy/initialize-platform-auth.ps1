param(
    [string]$Username = 'cloudlab-admin',
    [string]$DisplayName = 'CloudLab Admin',
    [ValidateSet('admin', 'teacher', 'student')][string]$Role = 'admin'
)
$ErrorActionPreference = 'Stop'
$securePassword = Read-Host 'Initial CloudLab account password' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
$plainPassword = $null
try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = 'C:\Program Files\nodejs\node.exe'
    $escapedUsername = $Username.Replace('"', '\"')
    $escapedDisplayName = $DisplayName.Replace('"', '\"')
    $start.Arguments = "`"C:\cloudlab\scripts\initialize-platform-auth.js`" `"C:\cloudlab\cloudlab-auth.json`" `"$escapedUsername`" `"$escapedDisplayName`" $Role"
    $start.UseShellExecute = $false
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = [System.Diagnostics.Process]::Start($start)
    $process.StandardInput.WriteLine($plainPassword)
    $process.StandardInput.Close()
    $output = $process.StandardOutput.ReadToEnd()
    $errorOutput = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) {
        $message = $errorOutput.Trim()
        if (-not $message) { $message = "Authentication initialization failed with code $($process.ExitCode)" }
        throw $message
    }
    Write-Output $output.Trim()
}
finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $plainPassword = $null
    $securePassword = $null
}
