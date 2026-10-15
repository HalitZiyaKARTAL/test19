& { Set-StrictMode -Off
  $port=8765; $origin='https://halitziyakartal.github.io'
  $header='psbridgeCORSenforcerhere&tokenverification'; $token='this is a simple token'
  $utf8=[Text.UTF8Encoding]::new($false,$true)
  $state=[initialsessionstate]::CreateDefault(); $state.ApartmentState='STA'; $state.ThreadOptions='ReuseThread'
  $ps=[powershell]::Create($state)
  $listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$port)
  try {
    $listener.Start(); Write-Host "[bridge] http://127.0.0.1:$port/ (Ctrl+C stops)"
    while($true){
      $accept=$listener.AcceptTcpClientAsync(); while(!$accept.Wait(100)){}; $client=$accept.Result
      $stream=$null; $status=400; $cors=''; $data=$null
      try {
        $stream=$client.GetStream(); $stream.ReadTimeout=5000; $stream.WriteTimeout=30000
        $reader=[IO.BinaryReader]::new($stream); $head=''
        do { $head+=[char]$reader.ReadByte(); if($head.Length -gt 16384){throw 'headers too large'} } until($head.EndsWith("`r`n`r`n"))
        $lines=$head -split "`r`n"
        if($lines[0] -cnotmatch '^(POST|OPTIONS) /\S* HTTP/1\.[01]$'){throw 'bad request'}
        $method=$Matches[1]; $headers=@{}
        foreach($line in $lines[1..($lines.Length-3)]){
          if($line -notmatch '^([!#$%&''*+.^_`|~0-9a-z-]+):[ \t]*(.*?)[ \t]*$' -or $headers.ContainsKey($Matches[1])){throw 'bad or duplicate header'}
          $headers[$Matches[1]]=$Matches[2]
        }
        if($headers.ContainsKey('transfer-encoding')){throw 'use Content-Length'}
        $status=403
        if($headers.host -notmatch "^(127\.0\.0\.1|localhost)(:$port)?$" -or $headers.origin -cne $origin){throw 'bad host or origin'}
        $cors=("Origin: $origin",'Methods: POST, OPTIONS',"Headers: Content-Type, $header",'Private-Network: true' | % {"Access-Control-Allow-$_`r`n"}) -join ''
        if($method -eq 'OPTIONS'){ $status=204; $data=[byte[]]@() }
        elseif($headers[$header] -cne $token){throw 'bad token'}
        else {
          $status=400
          if($headers['content-length'] -notmatch '^\d+$'){throw 'missing or bad Content-Length'}
          $length=[int]$headers['content-length']
          $body=$reader.ReadBytes($length); if($body.Length -ne $length){throw 'incomplete body'}
          $code=$utf8.GetString($body); $status=200; Write-Host "PS> $code" -ForegroundColor Green
          $ps.Commands.Clear(); $ps.Streams.ClearStreams(); [void]$ps.AddScript($code,$false)
          $ps.Commands.Commands[0].MergeMyResults('All','Output'); $result=@($ps.Invoke())
          if($ps.HadErrors){ $status=500 }
          elseif($result.Count -eq 1 -and $result[0].bytes -is [byte[]]){
            $data=$result[0].bytes; $type='application/octet-stream'; $result="[binary: $($data.Length) bytes]"
          }
          $result=$result | % {
            $color=if($_ -is [Management.Automation.ErrorRecord]){'Red'}elseif($_ -is [Management.Automation.InformationRecord]){if($_.MessageData.ForegroundColor -ge 0){$_.MessageData.ForegroundColor}else{'Blue'}}else{'Yellow'}
            Write-Host ($_|Out-String -Width 4096).TrimEnd() -ForegroundColor $color; $_
          } | Out-String -Width 4096
        }
      } catch { $data=$null; $result=$_|Out-String; if($status -in 200,500){ $status=500; Write-Host $result.TrimEnd() -ForegroundColor Red } }
      try { if($null -eq $stream){continue}
        if($null -eq $data){ $type='text/plain; charset=utf-8'; $data=$utf8.GetBytes([string]$result) }
        $framing=if($status -eq 204){''}else{"Content-Type: $type`r`nContent-Length: $($data.Length)`r`n"}
        $head=$utf8.GetBytes("HTTP/1.1 $status Response`r`nCache-Control: no-store`r`nConnection: close`r`n$cors$framing`r`n")
        $stream.Write($head,0,$head.Length); $stream.Write($data,0,$data.Length)
        $client.Client.Shutdown('Send'); $stream.CopyTo([IO.Stream]::Null)
      } catch { Write-Warning $_ } finally { $client.Close() }
    }
  } finally { $listener.Stop(); $ps.Dispose() }
}
