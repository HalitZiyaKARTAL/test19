& { Set-StrictMode -Off
  $port=8765; $origin='https://halitziyakartal.github.io'
  $header='psbridgeCORSenforcerhere&tokenverification'; $token='this is a simple token'
  $utf8=[Text.UTF8Encoding]::new($false,$true)
  $protocol='psbridge.'+[Convert]::ToBase64String($utf8.GetBytes($token)).TrimEnd('=').Replace('+','-').Replace('/','_')
  $none=[Threading.CancellationToken]::None
  $state=[initialsessionstate]::CreateDefault(); $state.ApartmentState='STA'; $state.ThreadOptions='ReuseThread'
  $ps=[powershell]::Create($state)
  $sources=[Collections.Generic.List[object]]::new()
  $close={ param($peer) $peer.socket,$peer.client,$peer.message | ? {$_} | % Dispose; [void]$sources.Remove($peer) }
  $receive={ param($peer) $peer.read=$peer.socket.ReceiveAsync($peer.buffer,$none) }
  $listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$port)
  try {
    $listener.Start(); Write-Host "[bridge] http/ws://127.0.0.1:$port/ (Ctrl+C stops)"
    $incoming=@{read=$listener.AcceptTcpClientAsync()}; $sources.Add($incoming)
    while($true){
      $ready=[Threading.Tasks.Task]::WaitAny([Threading.Tasks.Task[]]@($sources|% {$_.read}),100)
      if($ready -lt 0){continue}
      $peer=$sources[$ready]; $sources.RemoveAt($ready); $sources.Add($peer)
      if($peer -eq $incoming){
        $client=$incoming.read.Result; $incoming.read=$listener.AcceptTcpClientAsync()
        try {
          $stream=$client.GetStream(); $stream.ReadTimeout=5000; $stream.WriteTimeout=30000
          $buffer=[byte[]]::new(1); $sources.Add(@{client=$client;stream=$stream;buffer=$buffer;read=$stream.ReadAsync($buffer,0,1)})
        } catch { $client.Close(); Write-Warning $_ }
        continue
      }
      $stream=$peer.stream; $code=$null; $status=400; $cors=''; $data=$null
      try {
        if(!$peer.socket){
          if($peer.read.Result -eq 0){ & $close $peer; continue }
          $reader=[IO.BinaryReader]::new($stream); $head=[string][char]$peer.buffer[0]
          do { $head+=[char]$reader.ReadByte(); if($head.Length -gt 16384){throw 'headers too large'} } until($head.EndsWith("`r`n`r`n"))
          $lines=$head -split "`r`n"
          if($lines[0] -cnotmatch '^(GET|POST|OPTIONS) /\S* HTTP/1\.[01]$'){throw 'bad request'}
          $method=$Matches[1]; $headers=@{}
          foreach($line in $lines[1..($lines.Length-3)]){
            if($line -notmatch '^([!#$%&''*+.^_`|~0-9a-z-]+):[ \t]*(.*?)[ \t]*$'){throw 'bad header'}
            $headers.Add($Matches[1],$Matches[2])
          }
          if($headers.ContainsKey('transfer-encoding')){throw 'use Content-Length'}
          if($headers.host -notmatch "^(127\.0\.0\.1|localhost)(:$port)?$" -or $headers.origin -cne $origin){$status=403; throw 'bad host or origin'}
          if($method -eq 'GET'){
            if($lines[0] -notlike '* HTTP/1.1' -or $headers.upgrade -ne 'websocket' -or $headers.connection -notmatch '(^|,)\s*upgrade\s*(,|$)' -or $headers['sec-websocket-version'] -ne '13' -or [Convert]::FromBase64String($headers['sec-websocket-key']).Length -ne 16){throw 'bad upgrade'}
            if($headers['sec-websocket-protocol'] -cne $protocol){$status=403; throw 'bad token'}
            $peer.socket=if(!$IsCoreCLR){
              [Net.WebSockets.WebSocket].GetMethod('CreateServerWebSocket',40).Invoke($null,@($stream,$protocol,16384,[TimeSpan]::FromSeconds(30),[Net.WebSockets.WebSocket]::CreateServerBuffer(16384)))
            } else { [Net.WebSockets.WebSocket]::CreateFromStream($stream,$true,$protocol,[TimeSpan]::FromSeconds(30)) }
            $peer.buffer=[ArraySegment[byte]]::new([byte[]]::new(16384)); $peer.message=[IO.MemoryStream]::new()
            $key=[Convert]::ToBase64String([Security.Cryptography.SHA1]::Create().ComputeHash($utf8.GetBytes($headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11')))
            $head=$utf8.GetBytes("HTTP/1.1 101 Switching Protocols`r`nUpgrade: websocket`r`nConnection: Upgrade`r`nSec-WebSocket-Accept: $key`r`nSec-WebSocket-Protocol: $protocol`r`n`r`n")
            $stream.Write($head,0,$head.Length); & $receive $peer
            continue
          }
          $cors=("Origin: $origin",'Methods: POST, OPTIONS',"Headers: Content-Type, $header",'Private-Network: true' | % {"Access-Control-Allow-$_`r`n"}) -join ''
          if($method -eq 'OPTIONS'){ $status=204; $data=[byte[]]@() }
          elseif($headers[$header] -cne $token){$status=403; throw 'bad token'}
          else {
            if($headers['content-length'] -notmatch '^\d+$'){throw 'missing or bad Content-Length'}
            $length=[int]$headers['content-length']
            $body=$reader.ReadBytes($length); if($body.Length -ne $length){throw 'incomplete body'}
            $code=$utf8.GetString($body)
          }
        } else {
          $received=$peer.read.Result
          if($received.MessageType -eq 'Close'){ [void]$peer.socket.CloseOutputAsync(1000,'',$none).Wait(30000); & $close $peer; continue }
          if($received.MessageType -ne 'Text'){throw 'send text commands'}
          $peer.message.Write($peer.buffer.Array,0,$received.Count)
          if(!$received.EndOfMessage){ & $receive $peer; continue }
          $code=$utf8.GetString($peer.message.ToArray()); $peer.message.SetLength(0)
        }
        if($null -ne $code){
          $status=200; Write-Host "PS> $code" -ForegroundColor Green
          $ps.Commands.Clear(); $ps.Streams.ClearStreams(); [void]$ps.AddScript($code,$false)
          $ps.Commands.Commands[0].MergeMyResults('All','Output'); $result=@($ps.Invoke())
          if($ps.HadErrors){ $status=500 }
          elseif($result.Count -eq 1 -and $result[0].bytes -is [byte[]]){
            $data=$result[0].bytes; $type='Binary'; $result="[binary: $($data.Length) bytes]"
          }
          $result=$result | % {
            $color=if($_ -is [Management.Automation.ErrorRecord]){'Red'}elseif($_ -is [Management.Automation.InformationRecord]){if($_.MessageData.ForegroundColor -ge 0){$_.MessageData.ForegroundColor}else{'Blue'}}else{'Yellow'}
            Write-Host ($_|Out-String -Width 4096).TrimEnd() -ForegroundColor $color; $_
          } | Out-String -Width 4096
        }
      } catch {
        $data=$null; $result=$_|Out-String
        if($status -in 200,500){ $status=500; Write-Host $result.TrimEnd() -ForegroundColor Red }
        elseif($peer.socket){ & $close $peer; Write-Warning $_; continue }
      }
      try {
        if($null -eq $data){ $type='Text'; if($peer.socket){$result="$status`n$result"}; $data=$utf8.GetBytes([string]$result) }
        if($peer.socket){
          if(!$peer.socket.SendAsync([ArraySegment[byte]]::new($data),$type,$true,$none).Wait(30000)){throw 'send timeout'}
          & $receive $peer
        } else {
          $framing=if($status -eq 204){''}else{ $mime=if($type -eq 'Binary'){'application/octet-stream'}else{'text/plain; charset=utf-8'}; "Content-Type: $mime`r`nContent-Length: $($data.Length)`r`n"}
          $head=$utf8.GetBytes("HTTP/1.1 $status Response`r`nCache-Control: no-store`r`nConnection: close`r`n$cors$framing`r`n")
          $stream.Write($head,0,$head.Length); $stream.Write($data,0,$data.Length)
          $peer.client.Client.Shutdown('Send'); $stream.CopyTo([IO.Stream]::Null)
        }
      } catch { if($peer.socket){ & $close $peer }; Write-Warning $_ } finally { if(!$peer.socket){ & $close $peer } }
    }
  } finally { foreach($peer in $sources.ToArray()){ if($peer.client){ & $close $peer } }; $listener.Stop(); $ps.Dispose() }
}
