& {
  $o='https://HalitZiyaKARTAL.github.io'; $hn='psbridgeCORSenforcerhere&tokenverification'; $t='this is a simple token'
  $J={param($k,$v) @{ok=$k;output=$v}|ConvertTo-Json -Compress}
  $L=[Net.HttpListener]::new(); $L.Prefixes.Add('http://127.0.0.1:8765/'); $L.Start()
  [Console]::CancelKeyPress.Add({ $L.Stop() })
  Write-Host "[bridge] http://127.0.0.1:8765/  (Ctrl+C stops)"
  try {
    while($L.IsListening){
      $ctx=$L.GetContext(); $rq=$ctx.Request; $rs=$ctx.Response
      try{
        $ok = $rq.Headers['Origin'] -eq $o
        "Origin: $(if($ok){$o}else{'null'})",
        'Methods: GET, POST, OPTIONS',
        "Headers: Content-Type, $hn",
        'Private-Network: true' | % { $rs.Headers.Add("Access-Control-Allow-$_") }
        $rs.ContentType='application/json; charset=utf-8'
        if($rq.HttpMethod -eq 'OPTIONS'){ $rs.StatusCode= if($ok){204}else{403}; $pl='' }
        elseif($rq.Headers[$hn] -ne $t){ $rs.StatusCode=403; $pl=& $J $false 'bad token' }
        elseif($rq.Url.AbsolutePath -like '/ping*'){ $pl=& $J $true 'pong' }
        elseif($rq.HttpMethod -eq 'POST'){ $body=[IO.StreamReader]::new($rq.InputStream).ReadToEnd(); Write-Host "[bridge] exec> $body"; try{ $pl=& $J $true (& ([scriptblock]::Create($body)) *>&1 | Out-String) }catch{ $pl=& $J $false ($_|Out-String) } }
        else{ $rs.StatusCode=404; $pl=& $J $false 'not found' }
        $by=[Text.Encoding]::UTF8.GetBytes([string]$pl); $rs.OutputStream.Write($by,0,$by.Length)
      }catch{ Write-Host "[bridge] err: $_" } finally{ $rs.Close() }
    }
  } finally { $L.Stop() }
}
