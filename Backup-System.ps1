param(
  [Parameter(Mandatory = $true, ParameterSetName = "Create")]
  [string]$Destination,

  [Parameter(Mandatory = $true, ParameterSetName = "Verify")]
  [string]$VerifyBackup,

  [Parameter(Mandatory = $true, ParameterSetName = "Restore")]
  [string]$RestoreBackup,

  [Parameter(Mandatory = $true, ParameterSetName = "Restore")]
  [string]$RestoreDestination
)

$ErrorActionPreference = "Stop"
$script:BackupPrefix = "TartarSchool-Backup-"
$script:Magic = [Text.Encoding]::ASCII.GetBytes("TARTAR-SCHOOL-BACKUP-V1`n")
$script:SaltLength = 16
$script:IvLength = 16
$script:MacLength = 32
$script:Iterations = 600000

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-PassphraseBytes {
  param([switch]$Confirm)

  $first = Read-Host "Enter a unique backup passphrase (at least 16 characters)" -AsSecureString
  if ($first.Length -lt 16) {
    throw "Use a passphrase of at least 16 characters."
  }
  $firstPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($first)
  try {
    $firstText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($firstPtr)
    if ($Confirm) {
      $second = Read-Host "Re-enter the backup passphrase" -AsSecureString
      $secondPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($second)
      try {
        $secondText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secondPtr)
        if ($firstText -cne $secondText) {
          throw "The passphrases do not match."
        }
      } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secondPtr)
        $second.Dispose()
        Remove-Variable secondText -ErrorAction SilentlyContinue
      }
    }
    return [Text.Encoding]::UTF8.GetBytes($firstText)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($firstPtr)
    $first.Dispose()
    Remove-Variable firstText -ErrorAction SilentlyContinue
  }
}

function Get-BackupKeys {
  param(
    [Parameter(Mandatory = $true)][byte[]]$Passphrase,
    [Parameter(Mandatory = $true)][byte[]]$Salt
  )
  $kdf = [Security.Cryptography.Rfc2898DeriveBytes]::new(
    $Passphrase, $Salt, $script:Iterations, [Security.Cryptography.HashAlgorithmName]::SHA256
  )
  try {
    $material = $kdf.GetBytes(64)
    $encryptionKey = New-Object byte[] 32
    $authenticationKey = New-Object byte[] 32
    [Array]::Copy($material, 0, $encryptionKey, 0, 32)
    [Array]::Copy($material, 32, $authenticationKey, 0, 32)
    [Array]::Clear($material, 0, $material.Length)
    return ,@($encryptionKey, $authenticationKey)
  } finally {
    $kdf.Dispose()
  }
}

function Test-BytesEqual {
  param([byte[]]$Left, [byte[]]$Right)
  if ($Left.Length -ne $Right.Length) { return $false }
  $difference = 0
  for ($i = 0; $i -lt $Left.Length; $i++) {
    $difference = $difference -bor ($Left[$i] -bxor $Right[$i])
  }
  return $difference -eq 0
}

function Get-BackupManifest {
  param([Parameter(Mandatory = $true)][string]$Path)

  $manifestPath = Join-Path $Path "manifest.json"
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Backup manifest is missing."
  }
  try {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  } catch {
    throw "Backup manifest is not valid JSON."
  }
  if ($manifest.formatVersion -ne 1 -or -not $manifest.files) {
    throw "Backup manifest format is not supported or contains no files."
  }
  return $manifest
}

function Test-BackupFolder {
  param([Parameter(Mandatory = $true)][string]$Path)

  $backupPath = (Get-Item -LiteralPath $Path).FullName
  $manifest = Get-BackupManifest -Path $backupPath
  $listed = @{}

  foreach ($entry in $manifest.files) {
    $relative = [string]$entry.path
    if (-not $relative -or [IO.Path]::IsPathRooted($relative) -or $relative.Contains("..")) {
      throw "Backup manifest contains an unsafe file path."
    }
    $filePath = Join-Path $backupPath $relative
    if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
      throw "Backup file is missing: $relative"
    }
    $actualHash = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash
    if ($actualHash -ne [string]$entry.sha256) {
      throw "Backup integrity check failed: $relative"
    }
    $listed[$relative] = $true

    if ([IO.Path]::GetExtension($filePath).ToLowerInvariant() -eq ".json") {
      try {
        $json = Get-Content -LiteralPath $filePath -Raw | ConvertFrom-Json
      } catch {
        throw "Backup JSON is invalid: $relative"
      }
      if (($relative -eq "state.json" -or $relative -match "^backups[\\/]+state.*\.json$") -and
          ($null -eq $json.state -or $json.state -isnot [System.Management.Automation.PSCustomObject])) {
        throw "School state backup has an invalid structure: $relative"
      }
    }
  }

  $actualFiles = Get-ChildItem -LiteralPath $backupPath -File -Recurse |
    Where-Object { $_.FullName -ne (Join-Path $backupPath "manifest.json") }
  foreach ($file in $actualFiles) {
    $relative = $file.FullName.Substring($backupPath.Length).TrimStart("\")
    if (-not $listed.ContainsKey($relative)) {
      throw "Backup contains an unlisted file: $relative"
    }
  }

  $portalData = Join-Path $backupPath "data.json"
  if (Test-Path -LiteralPath $portalData -PathType Leaf) {
    $data = Get-Content -LiteralPath $portalData -Raw | ConvertFrom-Json
    foreach ($resource in @($data.resources)) {
      if ($resource.id) {
        $upload = Join-Path (Join-Path $backupPath "uploads") ([string]$resource.id)
        if (-not (Test-Path -LiteralPath $upload -PathType Leaf)) {
          throw "A learner resource is missing from the backup."
        }
      }
    }
  }
  return $manifest
}

function Protect-BackupArchive {
  param(
    [Parameter(Mandatory = $true)][string]$ArchivePath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [Parameter(Mandatory = $true)][byte[]]$Passphrase
  )

  $salt = New-Object byte[] $script:SaltLength
  $iv = New-Object byte[] $script:IvLength
  $random = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $random.GetBytes($salt)
    $random.GetBytes($iv)
  } finally {
    $random.Dispose()
  }
  $keys = Get-BackupKeys -Passphrase $Passphrase -Salt $salt
  $aes = [Security.Cryptography.Aes]::Create()
  $input = $null
  $output = $null
  $crypto = $null
  try {
    $aes.KeySize = 256
    $aes.BlockSize = 128
    $aes.Mode = [Security.Cryptography.CipherMode]::CBC
    $aes.Padding = [Security.Cryptography.PaddingMode]::PKCS7
    $aes.Key = $keys[0]
    $aes.IV = $iv
    $input = [IO.File]::OpenRead($ArchivePath)
    $output = [IO.File]::Create($OutputPath)
    $output.Write($script:Magic, 0, $script:Magic.Length)
    $output.Write($salt, 0, $salt.Length)
    $output.Write($iv, 0, $iv.Length)
    $crypto = [Security.Cryptography.CryptoStream]::new(
      $output, $aes.CreateEncryptor(), [Security.Cryptography.CryptoStreamMode]::Write
    )
    $input.CopyTo($crypto)
    $crypto.FlushFinalBlock()
  } finally {
    if ($crypto) { $crypto.Dispose() }
    if ($input) { $input.Dispose() }
    if ($output) { $output.Dispose() }
    $aes.Dispose()
  }

  $macProvider = [Security.Cryptography.HMACSHA256]::new($keys[1])
  $signedFile = $null
  $append = $null
  try {
    $signedFile = [IO.File]::OpenRead($OutputPath)
    $mac = $macProvider.ComputeHash($signedFile)
    $signedFile.Dispose()
    $signedFile = $null
    $append = [IO.File]::Open($OutputPath, [IO.FileMode]::Append, [IO.FileAccess]::Write)
    $append.Write($mac, 0, $mac.Length)
  } finally {
    if ($signedFile) { $signedFile.Dispose() }
    if ($append) { $append.Dispose() }
    $macProvider.Dispose()
    [Array]::Clear($keys[0], 0, $keys[0].Length)
    [Array]::Clear($keys[1], 0, $keys[1].Length)
  }
}

function Unprotect-BackupArchive {
  param(
    [Parameter(Mandatory = $true)][string]$BackupPath,
    [Parameter(Mandatory = $true)][string]$ArchivePath,
    [Parameter(Mandatory = $true)][byte[]]$Passphrase
  )

  $input = [IO.File]::OpenRead($BackupPath)
  $cipherPath = $ArchivePath + ".cipher"
  $cipher = $null
  $plain = $null
  $crypto = $null
  $aes = $null
  $macProvider = $null
  $keys = $null
  try {
    $headerLength = $script:Magic.Length + $script:SaltLength + $script:IvLength
    if ($input.Length -le ($headerLength + $script:MacLength + 15)) {
      throw "Encrypted backup is too small or truncated."
    }

    $magic = New-Object byte[] $script:Magic.Length
    $salt = New-Object byte[] $script:SaltLength
    $iv = New-Object byte[] $script:IvLength
    if ($input.Read($magic, 0, $magic.Length) -ne $magic.Length -or
        $input.Read($salt, 0, $salt.Length) -ne $salt.Length -or
        $input.Read($iv, 0, $iv.Length) -ne $iv.Length -or
        -not (Test-BytesEqual -Left $magic -Right $script:Magic)) {
      throw "File is not a supported Tartar encrypted backup."
    }

    $keys = Get-BackupKeys -Passphrase $Passphrase -Salt $salt
    $signedLength = $input.Length - $script:MacLength
    $input.Position = 0
    $macProvider = [Security.Cryptography.HMACSHA256]::new($keys[1])
    $buffer = New-Object byte[] 1048576
    $remaining = $signedLength
    while ($remaining -gt 0) {
      $count = [int][Math]::Min($buffer.Length, $remaining)
      $read = $input.Read($buffer, 0, $count)
      if ($read -le 0) { throw "Encrypted backup is truncated." }
      [void]$macProvider.TransformBlock($buffer, 0, $read, $buffer, 0)
      $remaining -= $read
    }
    [void]$macProvider.TransformFinalBlock((New-Object byte[] 0), 0, 0)
    $actualMac = $macProvider.Hash
    $input.Position = $signedLength
    $expectedMac = New-Object byte[] $script:MacLength
    if ($input.Read($expectedMac, 0, $expectedMac.Length) -ne $expectedMac.Length -or
        -not (Test-BytesEqual -Left $actualMac -Right $expectedMac)) {
      throw "Backup authentication failed. The passphrase may be wrong or the file may be damaged."
    }

    $cipherLength = $signedLength - $headerLength
    $input.Position = $headerLength
    $cipher = [IO.File]::Create($cipherPath)
    $remaining = $cipherLength
    while ($remaining -gt 0) {
      $count = [int][Math]::Min($buffer.Length, $remaining)
      $read = $input.Read($buffer, 0, $count)
      if ($read -le 0) { throw "Encrypted backup is truncated." }
      $cipher.Write($buffer, 0, $read)
      $remaining -= $read
    }
    $cipher.Dispose()
    $cipher = $null

    $input.Dispose()
    $input = $null
    $cipher = [IO.File]::OpenRead($cipherPath)
    $plain = [IO.File]::Create($ArchivePath)
    $aes = [Security.Cryptography.Aes]::Create()
    $aes.KeySize = 256
    $aes.BlockSize = 128
    $aes.Mode = [Security.Cryptography.CipherMode]::CBC
    $aes.Padding = [Security.Cryptography.PaddingMode]::PKCS7
    $aes.Key = $keys[0]
    $aes.IV = $iv
    $crypto = [Security.Cryptography.CryptoStream]::new(
      $cipher, $aes.CreateDecryptor(), [Security.Cryptography.CryptoStreamMode]::Read
    )
    $crypto.CopyTo($plain)
    $crypto.Dispose()
    $crypto = $null
    $cipher = $null
    $plain.Dispose()
    $plain = $null
  } finally {
    if ($crypto) { $crypto.Dispose() }
    if ($cipher) { $cipher.Dispose() }
    if ($plain) { $plain.Dispose() }
    if ($input) { $input.Dispose() }
    if ($aes) { $aes.Dispose() }
    if ($macProvider) { $macProvider.Dispose() }
    if ($keys) {
      [Array]::Clear($keys[0], 0, $keys[0].Length)
      [Array]::Clear($keys[1], 0, $keys[1].Length)
    }
    if (Test-Path -LiteralPath $cipherPath) {
      Remove-Item -LiteralPath $cipherPath -Force
    }
  }
}

function Verify-EncryptedBackup {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][byte[]]$Passphrase
  )

  $backupFile = (Get-Item -LiteralPath $Path).FullName
  $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("TartarVerify-" + [Guid]::NewGuid().ToString("N"))
  $archive = Join-Path $tempRoot "backup.zip"
  $expanded = Join-Path $tempRoot "contents"
  New-Item -ItemType Directory -Path $expanded -Force | Out-Null
  try {
    Unprotect-BackupArchive -BackupPath $backupFile -ArchivePath $archive -Passphrase $Passphrase
    [IO.Compression.ZipFile]::ExtractToDirectory($archive, $expanded)
    $manifest = Test-BackupFolder -Path $expanded
    Write-Output ("Encrypted backup verified: {0} files, created {1}" -f $manifest.files.Count, $manifest.createdUtc)
  } finally {
    if (Test-Path -LiteralPath $tempRoot) {
      Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
  }
}

function Restore-EncryptedBackup {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$DestinationPath,
    [Parameter(Mandatory = $true)][byte[]]$Passphrase
  )

  $sourceRoot = (Get-Item -LiteralPath $PSScriptRoot).FullName.TrimEnd("\")
  $destinationFull = [IO.Path]::GetFullPath($DestinationPath).TrimEnd("\")
  if ($destinationFull -ieq $sourceRoot -or
      $destinationFull.StartsWith($sourceRoot + "\", [StringComparison]::OrdinalIgnoreCase) -or
      $sourceRoot.StartsWith($destinationFull + "\", [StringComparison]::OrdinalIgnoreCase)) {
    throw "Restore destination must be outside the application folder."
  }
  if (Test-Path -LiteralPath $destinationFull) {
    throw "Restore destination must not already exist. Choose a new, empty test folder."
  }

  $parent = Split-Path -Parent $destinationFull
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
  $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("TartarRestore-" + [Guid]::NewGuid().ToString("N"))
  $archive = Join-Path $tempRoot "backup.zip"
  $expanded = Join-Path $tempRoot "contents"
  $stagingRestore = Join-Path $parent (".tartar-restore-" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $expanded -Force | Out-Null
  try {
    Unprotect-BackupArchive -BackupPath $Path -ArchivePath $archive -Passphrase $Passphrase
    [IO.Compression.ZipFile]::ExtractToDirectory($archive, $expanded)
    $manifest = Test-BackupFolder -Path $expanded
    New-Item -ItemType Directory -Path $stagingRestore | Out-Null
    Get-ChildItem -LiteralPath $expanded -Force | Copy-Item -Destination $stagingRestore -Recurse -Force
    Test-BackupFolder -Path $stagingRestore | Out-Null
    Move-Item -LiteralPath $stagingRestore -Destination $destinationFull
    Write-Output ("Backup restored and verified: {0} files to {1}" -f $manifest.files.Count, $destinationFull)
  } finally {
    if (Test-Path -LiteralPath $stagingRestore) {
      Remove-Item -LiteralPath $stagingRestore -Recurse -Force
    }
    if (Test-Path -LiteralPath $tempRoot) {
      Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
  }
}

if ($PSCmdlet.ParameterSetName -eq "Verify" -or $PSCmdlet.ParameterSetName -eq "Restore") {
  $passphrase = Get-PassphraseBytes
  try {
    if ($PSCmdlet.ParameterSetName -eq "Verify") {
      Verify-EncryptedBackup -Path $VerifyBackup -Passphrase $passphrase
    } else {
      Restore-EncryptedBackup -Path $RestoreBackup -DestinationPath $RestoreDestination -Passphrase $passphrase
    }
  } finally {
    [Array]::Clear($passphrase, 0, $passphrase.Length)
  }
  exit 0
}

$sourceRoot = (Get-Item -LiteralPath $PSScriptRoot).FullName.TrimEnd("\")
$destinationRoot = [IO.Path]::GetFullPath($Destination).TrimEnd("\")
if ($destinationRoot.StartsWith($sourceRoot + "\", [StringComparison]::OrdinalIgnoreCase) -or
    $sourceRoot.StartsWith($destinationRoot + "\", [StringComparison]::OrdinalIgnoreCase) -or
    $destinationRoot -ieq $sourceRoot) {
  throw "The backup destination cannot be inside, equal to, or above the application folder."
}
New-Item -ItemType Directory -Path $destinationRoot -Force | Out-Null
$destinationRoot = (Get-Item -LiteralPath $destinationRoot).FullName.TrimEnd("\")

$passphrase = Get-PassphraseBytes -Confirm
$lockPath = Join-Path $destinationRoot ".tartar-school-backup-lock"
$lockCreated = $false
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("TartarBackup-" + [Guid]::NewGuid().ToString("N"))
$stamp = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssfffZ")
$backupPath = Join-Path $destinationRoot ($script:BackupPrefix + $stamp + ".tsb")
$partialPath = $backupPath + ".tmp"

try {
  try {
    New-Item -ItemType Directory -Path $lockPath -ErrorAction Stop | Out-Null
    $lockCreated = $true
  } catch {
    throw "Another backup may be running, or a stale backup lock exists."
  }

  $stagingPath = Join-Path $tempRoot "contents"
  $archivePath = Join-Path $tempRoot "backup.zip"
  New-Item -ItemType Directory -Path $stagingPath -Force | Out-Null
  $manifestFiles = New-Object System.Collections.Generic.List[object]
  $candidates = @(
    (Join-Path $sourceRoot "uploads"),
    (Join-Path $sourceRoot "backups"),
    (Join-Path $sourceRoot "state.json"),
    (Join-Path $sourceRoot "data.json"),
    (Join-Path $sourceRoot "codes.json"),
    (Join-Path $sourceRoot "users.json"),
    (Join-Path $sourceRoot "admissions.json"),
    (Join-Path $sourceRoot "club-requests.json")
  )

  foreach ($candidate in $candidates) {
    if (-not (Test-Path -LiteralPath $candidate)) { continue }
    $item = Get-Item -LiteralPath $candidate
    if ($item.PSIsContainer) {
      $sourceFiles = @(Get-ChildItem -LiteralPath $candidate -File -Recurse -Force)
    } else {
      $sourceFiles = @($item)
    }

    foreach ($sourceFile in $sourceFiles) {
      $relative = $sourceFile.FullName.Substring($sourceRoot.Length).TrimStart("\")
      $targetFile = Join-Path $stagingPath $relative
      $targetDir = Split-Path -Parent $targetFile
      New-Item -ItemType Directory -Path $targetDir -Force | Out-Null

      $copied = $false
      for ($attempt = 1; $attempt -le 3 -and -not $copied; $attempt++) {
        $before = (Get-FileHash -LiteralPath $sourceFile.FullName -Algorithm SHA256).Hash
        Copy-Item -LiteralPath $sourceFile.FullName -Destination $targetFile -Force
        $after = (Get-FileHash -LiteralPath $sourceFile.FullName -Algorithm SHA256).Hash
        $copyHash = (Get-FileHash -LiteralPath $targetFile -Algorithm SHA256).Hash
        if ($before -eq $after -and $after -eq $copyHash) {
          $copied = $true
        } elseif ($attempt -lt 3) {
          Start-Sleep -Seconds 2
        }
      }
      if (-not $copied) {
        throw "A source file kept changing or could not be copied reliably: $relative"
      }

      $manifestFiles.Add([PSCustomObject]@{
        path = $relative
        sha256 = $copyHash
        bytes = (Get-Item -LiteralPath $targetFile).Length
      })
    }
  }

  if ($manifestFiles.Count -eq 0) {
    throw "No application data files were found to back up."
  }

  $manifest = [PSCustomObject]@{
    formatVersion = 1
    createdUtc = [DateTime]::UtcNow.ToString("o")
    files = $manifestFiles.ToArray()
  }
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $stagingPath "manifest.json") -Encoding UTF8
  $checked = Test-BackupFolder -Path $stagingPath
  [IO.Compression.ZipFile]::CreateFromDirectory(
    $stagingPath, $archivePath, [IO.Compression.CompressionLevel]::Optimal, $false
  )
  Protect-BackupArchive -ArchivePath $archivePath -OutputPath $partialPath -Passphrase $passphrase
  Verify-EncryptedBackup -Path $partialPath -Passphrase $passphrase
  Move-Item -LiteralPath $partialPath -Destination $backupPath
  Write-Output "Encrypted backup created: $backupPath"
  Write-Output "Confirm Google Drive reports that the file has finished syncing."

} finally {
  if (Test-Path -LiteralPath $partialPath) {
    Remove-Item -LiteralPath $partialPath -Force
  }
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
  if ($lockCreated -and (Test-Path -LiteralPath $lockPath)) {
    Remove-Item -LiteralPath $lockPath -Force
  }
  [Array]::Clear($passphrase, 0, $passphrase.Length)
}
