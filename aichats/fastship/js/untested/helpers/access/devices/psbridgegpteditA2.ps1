param([int]$Port=8765)
& {
  $global:PSBridgePolicy=@{Origin='https://halitziyakartal.github.io';Header='psbridgeCORSenforcerhere&tokenverification';Token='this is a simple token';RequireOrigin=$true;RequireHeader=$true}
  $global:PSBridgeDebuglogs=@(0,0,0,0) # requests, denied, executed, transport errors
  $listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$Port)
  try {
    $listener.Start(); Write-Host "[bridge] http://127.0.0.1:$Port/ | Ctrl+C stops"
    while($true){
      while(-not $listener.Pending()){Start-Sleep -Milliseconds 25}
      $client=$listener.AcceptTcpClient(); $stream=$null
      $status='200 OK'; $payload=$null; $cors=''; $global:PSBridgeDebuglogs[0]++
      try {
        $stream=$client.GetStream(); $stream.ReadTimeout=5000
        try {
          $bytes=[Collections.Generic.List[byte]]::new()
          do {
            $value=$stream.ReadByte(); if($value -lt 0){throw 'Incomplete headers'}; $bytes.Add([byte]$value); $count=$bytes.Count
          } until($count -ge 4 -and $bytes[$count-4] -eq 13 -and $bytes[$count-3] -eq 10 -and $bytes[$count-2] -eq 13 -and $bytes[$count-1] -eq 10)
          $lines=[Text.Encoding]::ASCII.GetString($bytes.ToArray()) -split "`r`n"; $headers=@{}
          if($lines[0] -notmatch '^(\S+) (\S+) HTTP/1\.[01]$'){throw 'Bad request line'}
          $method=$Matches[1]; $path=$Matches[2]
          foreach($line in $lines[1..($lines.Length-1)]){
            if(!$line){continue}; if($line -notmatch '^([^: ]+):\s*(.*?)\s*$'){throw 'Bad header'}
            $name=$Matches[1]; $value=$Matches[2]; if($headers.ContainsKey($name)){throw 'Duplicate header'}; $headers[$name]=$value
          }
          $policy=$global:PSBridgePolicy; $origin=$headers['Origin']
          $allowed=(-not $policy.RequireOrigin -or $origin -ceq $policy.Origin)
          if($allowed -and $origin){
            $requested=$headers['Access-Control-Request-Headers']; if(!$requested){$requested="Content-Type, $($policy.Header)"}
            $cors="Access-Control-Allow-Origin: $origin`r`nAccess-Control-Allow-Methods: GET, POST, OPTIONS`r`nAccess-Control-Allow-Headers: $requested`r`nAccess-Control-Allow-Private-Network: true`r`n"
          }
          if($headers['Host'] -notmatch '^(127\.0\.0\.1|localhost)(:\d+)?$' -or !$allowed -or ($method -ne 'OPTIONS' -and $policy.RequireHeader -and $headers[$policy.Header] -cne $policy.Token)){
            $status='403 Forbidden'; $payload=@{ok=$false;output='bad host, origin, or token'}; $global:PSBridgeDebuglogs[1]++
          } elseif($method -eq 'OPTIONS'){$status='204 No Content'}
          elseif($path -like '/ping*'){$payload=@{ok=$true;output='pong'}}
          elseif($method -eq 'POST'){
            if($headers['Transfer-Encoding'] -or $headers['Content-Length'] -notmatch '^\d+$'){throw 'Use a complete Content-Length body'}
            if($headers['Expect'] -ieq '100-continue'){$interim=[Text.Encoding]::ASCII.GetBytes("HTTP/1.1 100 Continue`r`n`r`n");$stream.Write($interim,0,$interim.Length);$stream.Flush()}
            $remaining=[long]$headers['Content-Length']; $body=[IO.MemoryStream]::new(); $buffer=New-Object byte[] 65536
            try {
              while($remaining -gt 0){$read=$stream.Read($buffer,0,[int][Math]::Min($remaining,$buffer.Length)); if($read -le 0){throw 'Incomplete body: execution refused'}; $body.Write($buffer,0,$read); $remaining-=$read}
              $script=[Text.UTF8Encoding]::new($false,$true).GetString($body.ToArray())
            } finally {$body.Dispose()}
            $global:PSBridgeDebuglogs[2]++
            $hadErrors=$false
            try {$payload=@{ok=$true;output=(& ([scriptblock]::Create($script)) *>&1 | ForEach-Object {if($_ -is [Management.Automation.ErrorRecord]){$hadErrors=$true};$_} | Out-String);hadErrors=$hadErrors;lastExitCode=$global:LASTEXITCODE}}
            catch {$payload=@{ok=$false;output=($_ | Out-String);hadErrors=$true;lastExitCode=$global:LASTEXITCODE}}
          } else {$status='404 Not Found'; $payload=@{ok=$false;output='not found'}}
        } catch {$status='400 Bad Request'; $payload=@{ok=$false;output=[string]$_}; $global:PSBridgeDebuglogs[3]++}
        $text=if($null -eq $payload){''}else{$payload | ConvertTo-Json -Compress}; $output=[Text.Encoding]::UTF8.GetBytes($text)
        $head=[Text.Encoding]::ASCII.GetBytes("HTTP/1.1 $status`r`n${cors}Content-Type: application/json; charset=utf-8`r`nContent-Length: $($output.Length)`r`nConnection: close`r`nCache-Control: no-store`r`n`r`n")
        $stream.Write($head,0,$head.Length); if($output.Length){$stream.Write($output,0,$output.Length)}; $stream.Flush()
      } catch {Write-Host "[bridge] connection error: $_"} finally {$client.Close()}
    }
  } finally {$listener.Stop(); Write-Host '[bridge] stopped'}
}
