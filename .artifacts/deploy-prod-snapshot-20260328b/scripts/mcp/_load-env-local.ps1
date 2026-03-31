Set-StrictMode -Version Latest

function Resolve-RepoRoot {
	param(
		[string]$ScriptRoot = $PSScriptRoot
	)

	return (Resolve-Path (Join-Path $ScriptRoot "..\..")).Path
}

function Convert-EnvValue {
	param(
		[Parameter(Mandatory = $true)]
		[string]$Value
	)

	$trimmed = $Value.Trim()
	if ($trimmed.Length -ge 2) {
		$first = $trimmed[0]
		$last = $trimmed[$trimmed.Length - 1]
		if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
			return $trimmed.Substring(1, $trimmed.Length - 2)
		}
	}

	return $trimmed
}

function Import-EnvLocal {
	param(
		[string]$RepoRoot = (Resolve-RepoRoot),
		[string]$EnvFileName = ".env.local"
	)

	$envPath = Join-Path $RepoRoot $EnvFileName
	if (-not (Test-Path $envPath)) {
		throw "Missing required env file: $envPath"
	}

	$loaded = @{}
	foreach ($line in Get-Content -Path $envPath) {
		$trimmed = $line.Trim()
		if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) {
			continue
		}

		$current = $trimmed
		if ($current.StartsWith("export ")) {
			$current = $current.Substring(7).Trim()
		}

		$separatorIndex = $current.IndexOf("=")
		if ($separatorIndex -lt 1) {
			continue
		}

		$key = $current.Substring(0, $separatorIndex).Trim()
		if ($key -notmatch "^[A-Za-z_][A-Za-z0-9_]*$") {
			continue
		}

		$rawValue = $current.Substring($separatorIndex + 1)
		$value = Convert-EnvValue -Value $rawValue
		$loaded[$key] = $value
		Set-Item -Path ("Env:{0}" -f $key) -Value $value
	}

	return $loaded
}

function Test-SecretValue {
	param(
		[AllowNull()]
		[string]$Value
	)

	if ([string]::IsNullOrWhiteSpace($Value)) {
		return $false
	}

	$trimmed = $Value.Trim()
	$placeholderPatterns = @(
		'^\$\{[A-Z0-9_]+\}$',
		'^your-',
		'^replace-',
		'^changeme$',
		'^__ROTATE_REQUIRED__$'
	)

	foreach ($pattern in $placeholderPatterns) {
		if ($trimmed -match $pattern) {
			return $false
		}
	}

	return $true
}
