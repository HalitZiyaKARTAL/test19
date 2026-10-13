param(
  [int]$Port = 8765,
  [string]$Origin = 'https://halitziyakartal.github.io',
  [string]$Token = 'this is a simple token',
  [string]$HeaderName = 'psbridgeCORSenforcerhere&tokenverification'
)

& {
  $global:PSBridgePolicy = [ordered]@{
    Origins = @(([Uri]$Origin).GetLeftPart([UriPartial]::Authority))
    Token = $Token; HeaderName = $HeaderName
    RequireOrigin = $true; RequireHeader = $true; AllowQueryToken = $false
    QueryToken = 'eval1ps'; HeaderTimeoutMs = 5000; BodyTimeoutMs = 0
  }
  $global:PSBridgeDebuglogs = [ordered]@{ total = 0; counts = @{}; recent = [Collections.Generic.Queue[string]]::new() }
  function Write-PSBridgeLog([int]$Function, [int]$Point) {
    $debug = $global:PSBridgeDebuglogs; $name = "$Function.$Point"
    $debug.total++; $debug.counts[$name] = 1 + [int]$debug.counts[$name]
    $debug.recent.Enqueue($name); if ($debug.recent.Count -gt 1000) { [void]$debug.recent.Dequeue() }
  }
  function Read-PSBridgeByte($Stream, [int]$TimeoutMs, $Clock) {
    Write-PSBridgeLog 2 1
    if ($TimeoutMs -gt 0) {
      $remaining = $TimeoutMs - [int]$Clock.ElapsedMilliseconds
      if ($remaining -le 0) { throw 'Request receive deadline exceeded.' }
      $Stream.ReadTimeout = [Math]::Max(1, $remaining)
    } else { $Stream.ReadTimeout = -1 }
    $value = $Stream.ReadByte()
    if ($value -lt 0) { throw 'Incomplete HTTP request.' }
    return $value
  }
  function Read-PSBridgeLine($Stream, [int]$TimeoutMs, $Clock) {
    Write-PSBridgeLog 3 1
    $bytes = [Collections.Generic.List[byte]]::new()
    while ($true) {
      $value = Read-PSBridgeByte $Stream $TimeoutMs $Clock
      if ($value -eq 13) {
        if ((Read-PSBridgeByte $Stream $TimeoutMs $Clock) -ne 10) { throw 'Invalid HTTP line ending.' }
        return [Text.Encoding]::ASCII.GetString($bytes.ToArray())
      }
      if ($value -eq 10) { throw 'Invalid HTTP line ending.' }
      $bytes.Add([byte]$value)
    }
  }
  function Read-PSBridgeBytes($Stream, [long]$Count, [int]$TimeoutMs, $Clock, $Destination) {
    Write-PSBridgeLog 4 1
    $buffer = New-Object byte[] 65536
    while ($Count -gt 0) {
      if ($TimeoutMs -gt 0) {
        $remaining = $TimeoutMs - [int]$Clock.ElapsedMilliseconds
        if ($remaining -le 0) { throw 'Request receive deadline exceeded.' }
        $Stream.ReadTimeout = [Math]::Max(1, $remaining)
      } else { $Stream.ReadTimeout = -1 }
      $read = $Stream.Read($buffer, 0, [int][Math]::Min($Count, $buffer.Length))
      if ($read -le 0) { throw 'Incomplete HTTP body; execution refused.' }
      $Destination.Write($buffer, 0, $read); $Count -= $read
    }
  }
  function Read-PSBridgeBody($Stream, $Headers) {
    Write-PSBridgeLog 5 1
    $clock = [Diagnostics.Stopwatch]::StartNew(); $timeout = [int]$global:PSBridgePolicy.BodyTimeoutMs
    $bytes = [IO.MemoryStream]::new()
    try {
      if ($Headers.ContainsKey('transfer-encoding')) {
        if ($Headers['transfer-encoding'] -ine 'chunked' -or $Headers.ContainsKey('content-length')) { throw 'Ambiguous or unsupported HTTP framing.' }
        while ($true) {
          $sizeLine = Read-PSBridgeLine $Stream $timeout $clock
          $sizeText = ($sizeLine -split ';', 2)[0]
          if ($sizeText -notmatch '^[0-9a-fA-F]+$') { throw 'Invalid chunk size.' }
          $size = [Convert]::ToInt64($sizeText, 16)
          if ($size -lt 0) { throw 'Invalid chunk size.' }
          if ($size -eq 0) {
            while ((Read-PSBridgeLine $Stream $timeout $clock) -ne '') { }
            break
          }
          Read-PSBridgeBytes $Stream $size $timeout $clock $bytes
          if ((Read-PSBridgeLine $Stream $timeout $clock) -ne '') { throw 'Invalid chunk ending.' }
        }
      } elseif ($Headers.ContainsKey('content-length')) {
        if ($Headers['content-length'] -notmatch '^\d+$') { throw 'Invalid Content-Length.' }
        Read-PSBridgeBytes $Stream ([long]$Headers['content-length']) $timeout $clock $bytes
      } else { throw 'POST requires Content-Length or chunked transfer encoding.' }
      return [Text.UTF8Encoding]::new($false, $true).GetString($bytes.ToArray())
    } finally { $bytes.Dispose() }
  }
  function Send-PSBridgeResponse($Stream, [int]$Status, $Payload, [string]$RequestOrigin, [string]$RequestedHeaders = '') {
    Write-PSBridgeLog 6 1
    $reason = @{200='OK';204='No Content';400='Bad Request';403='Forbidden';404='Not Found';500='Internal Server Error'}[$Status]
    $text = if ($null -eq $Payload) { '' } else { $Payload | ConvertTo-Json -Depth 12 -Compress }
    $body = [Text.Encoding]::UTF8.GetBytes($text)
    $headers = "HTTP/1.1 $Status $reason`r`nContent-Type: application/json; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`nCache-Control: no-store`r`n"
    if ($RequestOrigin) {
      $allowedHeaders = if ($RequestedHeaders) { $RequestedHeaders } else { "Content-Type, $($global:PSBridgePolicy.HeaderName)" }
      $headers += "Access-Control-Allow-Origin: $RequestOrigin`r`nAccess-Control-Allow-Methods: GET, POST, OPTIONS`r`nAccess-Control-Allow-Headers: $allowedHeaders`r`nAccess-Control-Allow-Credentials: true`r`nAccess-Control-Allow-Private-Network: true`r`nVary: Origin`r`n"
    }
    $headerBytes = [Text.Encoding]::ASCII.GetBytes($headers + "`r`n")
    $Stream.WriteTimeout = -1; $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($body.Length) { $Stream.Write($body, 0, $body.Length) }
    $Stream.Flush()
  }
  function Invoke-PSBridgeScript([string]$Body) {
    Write-PSBridgeLog 7 1
    $errors = [Collections.Generic.List[object]]::new(); $records = [Collections.Generic.List[object]]::new()
    try {
      & ([scriptblock]::Create($Body)) *>&1 | ForEach-Object {
        if ($_ -is [Management.Automation.ErrorRecord]) { $errors.Add($_) }
        $records.Add($_)
      }
      $output = $records.ToArray() | Out-String -Width 4096
      Write-PSBridgeLog 7 2
      return @{ ok=$true; output=[string]$output; hadErrors=($errors.Count -gt 0); lastExitCode=$global:LASTEXITCODE }
    } catch {
      Write-PSBridgeLog 7 3
      $prefix = $records.ToArray() | Out-String -Width 4096
      return @{ ok=$false; output=([string]$prefix + ($_ | Out-String)); hadErrors=$true; lastExitCode=$global:LASTEXITCODE }
    }
  }

  . (Join-Path $PSScriptRoot 'psbridge-native.ps1')
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
  try {
    $listener.Start(); Write-PSBridgeLog 1 1
    Write-Host "[bridge] http://127.0.0.1:$Port/ | origin: $($global:PSBridgePolicy.Origins -join ', ') | Ctrl+C stops"
    while ($true) {
      $pending = $listener.BeginAcceptTcpClient($null, $null)
      try {
        while (-not $pending.AsyncWaitHandle.WaitOne(100)) { }
        $client = $listener.EndAcceptTcpClient($pending)
      } finally { $pending.AsyncWaitHandle.Close() }
      $stream = $null; $responseOrigin = ''; $requestedHeaders = ''; $sent = $false; $stage = 'headers'
      try {
        Write-PSBridgeLog 1 2
        $stream = $client.GetStream(); $clock = [Diagnostics.Stopwatch]::StartNew()
        $line = Read-PSBridgeLine $stream $global:PSBridgePolicy.HeaderTimeoutMs $clock
        if ($line -notmatch '^(GET|POST|OPTIONS|[A-Z]+) (\S+) HTTP/1\.[01]$') { throw 'Invalid HTTP request line.' }
        $method = $Matches[1]; $target = $Matches[2]; $headers = @{}
        while (($line = Read-PSBridgeLine $stream $global:PSBridgePolicy.HeaderTimeoutMs $clock) -ne '') {
          if ($line -notmatch '^([!#$%&''*+.^_`|~0-9A-Za-z-]+):[ \t]*(.*)$') { throw 'Invalid HTTP header.' }
          $name = $Matches[1].ToLowerInvariant(); $value = $Matches[2].Trim()
          if ($headers.ContainsKey($name)) { throw "Duplicate HTTP header: $name" }
          $headers[$name] = $value
        }
        $requestOrigin = $headers['origin']; $policy = $global:PSBridgePolicy
        $originAllowed = (-not $policy.RequireOrigin) -or (@($policy.Origins) -ccontains $requestOrigin)
        if ($originAllowed -and $requestOrigin -and $requestOrigin -cne 'null') { $responseOrigin = $requestOrigin }
        if ($headers['host'] -notmatch '^(127\.0\.0\.1|localhost)(:\d+)?$') {
          Send-PSBridgeResponse $stream 403 @{ok=$false;output='bad host'} $responseOrigin; $sent=$true; continue
        }
        if (-not $originAllowed -or ($policy.RequireOrigin -and (-not $requestOrigin -or $requestOrigin -ceq 'null'))) {
          Send-PSBridgeResponse $stream 403 @{ok=$false;output='bad origin'} ''; $sent=$true; continue
        }
        if ($method -eq 'OPTIONS') {
          $requestedMethod = $headers['access-control-request-method']
          $requestedHeaders = $headers['access-control-request-headers']
          if (-not $requestOrigin -or $requestedMethod -notin @('GET','POST') -or ($requestedHeaders -and $requestedHeaders -notmatch '^[!#$%&''*+.^_`|~0-9A-Za-z, \t-]+$')) { throw 'Invalid preflight request.' }
          Send-PSBridgeResponse $stream 204 $null $responseOrigin $requestedHeaders; $sent=$true; continue
        }
        $headerToken = $headers[[string]$policy.HeaderName.ToLowerInvariant()]
        $tokenAllowed = $headerToken -and $headerToken -ceq $policy.Token
        if (-not $tokenAllowed -and -not $policy.RequireHeader -and $policy.AllowQueryToken) {
          foreach ($part in (($target -split '\?',2 | Select-Object -Last 1) -split '&')) {
            $pair = $part -split '=',2
            if ($pair.Count -eq 2 -and $pair[0] -ceq 't' -and [Uri]::UnescapeDataString($pair[1]) -ceq $policy.QueryToken) { $tokenAllowed=$true }
          }
        }
        if (-not $tokenAllowed) { Send-PSBridgeResponse $stream 403 @{ok=$false;output='bad token'} $responseOrigin; $sent=$true; continue }
        $path = ($target -split '\?',2)[0]
        if ($path -like '/ping*') { Send-PSBridgeResponse $stream 200 @{ok=$true;output='pong'} $responseOrigin; $sent=$true; continue }
        if ($method -ne 'POST') { Send-PSBridgeResponse $stream 404 @{ok=$false;output='not found'} $responseOrigin; $sent=$true; continue }
        $stage = 'body'
        if ($headers['expect'] -ieq '100-continue') {
          $interim = [Text.Encoding]::ASCII.GetBytes("HTTP/1.1 100 Continue`r`n`r`n"); $stream.Write($interim,0,$interim.Length); $stream.Flush()
        }
        $body = Read-PSBridgeBody $stream $headers; $stage = 'execution'; Write-PSBridgeLog 1 3
        $payload = Invoke-PSBridgeScript $body
        Send-PSBridgeResponse $stream 200 $payload $responseOrigin; $sent=$true
      } catch {
        Write-PSBridgeLog 1 4
        Write-Host "[bridge] $stage error: $_"
        if ($stream -and -not $sent) {
          try { $status = if ($stage -eq 'execution') {500} else {400}; Send-PSBridgeResponse $stream $status @{ok=$false;output=[string]$_} $responseOrigin } catch { }
        }
      } finally { $client.Close() }
    }
  } finally {
    Write-PSBridgeLog 1 5; $listener.Stop()
    if ('PSBridgeNative' -as [type]) { [PSBridgeNative]::Dispose() }
    Write-Host '[bridge] stopped'
  }
}
