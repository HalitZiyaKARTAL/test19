phone_top_profile() {
  local -a H=(
    'phone_top_profile [options]'
    ''
    'Continuous low-priority adb top logger. Default: every report, unlimited,'
    '10/90% hourly evidence, 30% rich-observer duty, all packages inventoried.'
    ''
    '  --dir DIR           local output directory (~/storage/downloads)'
    '  --prefix NAME       filename prefix (phone_top)'
    '  --adb PATH          adb executable (adb)'
    '  --serial ID         target device; otherwise exactly one must be online'
    '  --uid 2000|any      required adb-shell UID (2000)'
    '  --rows N            top rows (50)'
    '  --delay SEC         top delay; empty uses top default'
    '  --top ARG           extra safe top argument; repeatable (-o/-m/-d/-b fixed)'
    '  --every-top        explicitly keep every top report (the default)'
    '  --every N           keep every Nth cold report (1)'
    '  --period SEC        minimum gap between cold reports (0)'
    '  --duration SEC      elapsed stream limit (0 = unlimited)'
    '  --until EPOCH       absolute stop time (0 = unlimited)'
    '  --max-reports N     saved-report limit (0 = unlimited)'
    '  --max-bytes N       approximate session-byte limit (0 = unlimited)'
    '  --low PERCENT       hourly baseline threshold (10)'
    '  --high PERCENT      hourly critical threshold (90)'
    '  --budget PERCENT    rich-observer wall-duty gate, 1..100 (30)'
    '  --cap N             rich background identities per pass (8; 0 disables)'
    '  --diag-timeout SEC  one-shot diagnostic timeout (30)'
    '  --allow REGEX       add an explained/active exception'
    '  --no-packages       skip package inventory, UID mapping, package probes'
    '  -h, --help          show this help'
    ''
    'Hot reports override --every/--period. Package inventory includes system and'
    'user apps. Files rotate daily; the final partial report is always retained.'
  )
  if (($# == 0)) || [[ $1 == -h || $1 == --help || $1 == help ]]; then
    printf '%s\n' "${H[@]}"
    return
  fi
  (
    export LC_ALL=C
    umask 077
    adb=adb
    serial=
    out=${HOME}/storage/downloads
    prefix=phone_top
    require_uid=2000
    rows=50
    delay=
    every=1
    period=0
    duration=0
    until=0
    max_reports=0
    max_bytes=0
    low_arg=10
    high_arg=90
    budget_arg=30
    cap=8
    diag=30
    packages=1
    allow='^(com\.android\.soundrecorder|com\.chrome\.dev|com\.android\.chrome|com\.termux)($|:)'
    top_extra=()
    declare -A OPT=(
      [--dir]=out [--prefix]=prefix [--adb]=adb [--serial]=serial
      [--uid]=require_uid [--rows]=rows [--delay]=delay [--every]=every
      [--period]=period [--duration]=duration [--until]=until
      [--max-reports]=max_reports [--max-bytes]=max_bytes
      [--low]=low_arg [--high]=high_arg [--budget]=budget_arg
      [--cap]=cap [--diag-timeout]=diag
    )
    die() {
      printf 'phone_top_profile: %s\n' "$*" >&2
      exit 2
    }
    uint() {
      [[ $1 =~ ^[0-9]{1,18}$ ]]
    }
    posint() {
      uint "$1" && ((10#$1 > 0))
    }
    valid_pkg() {
      [[ $1 =~ ^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)+$ ]]
    }
    while (($#)); do
      case $1 in
        --top) (($# > 1)) || die "$1 needs a value"; top_extra+=("$2"); shift 2 ;;
        --every-top) every=1; period=0; shift ;;
        --allow) (($# > 1)) || die "$1 needs a value"; allow="($allow)|($2)"; shift 2 ;;
        --no-packages) packages=0; shift ;;
        -h|--help|help) printf '%s\n' "${H[@]}"; exit ;;
        *)
          [[ -n $1 ]] || die "empty option"
          v=${OPT[$1]-}
          [[ -n $v ]] || die "unknown option: $1"
          (($# > 1)) || die "$1 needs a value"
          printf -v "$v" '%s' "$2"
          shift 2
          ;;
      esac
    done
    unset OPT
    [[ -d $out && -w $out ]] || die "output directory is not writable: $out"
    [[ $prefix =~ ^[A-Za-z0-9._-]{1,64}$ ]] || die "unsafe prefix"
    if [[ $require_uid != any ]]; then
      uint "$require_uid" || die "--uid must be a number or any"
      require_uid=$((10#$require_uid))
    fi
    [[ -z $delay || $delay =~ ^[0-9]+([.][0-9]+)?$ ]] || die "--delay must be numeric"
    for v in rows every diag; do
      posint "${!v}" || die "--${v//_/-} must be positive"
      printf -v "$v" '%d' "$((10#${!v}))"
    done
    for v in period duration until max_reports max_bytes cap; do
      uint "${!v}" || die "--${v//_/-} must be a nonnegative integer"
      printf -v "$v" '%d' "$((10#${!v}))"
    done
    [[ x =~ $allow ]]
    (($? != 2)) || die "invalid --allow regex"
    for x in "${top_extra[@]}"; do
      [[ $x =~ ^[-A-Za-z0-9_.,:=/%+]+$ ]] || die "unsafe --top argument: $x"
      [[ $x != --* && ! $x =~ ^-[^-]*[bdmnoOq] ]] ||
        die "$x conflicts with the continuous fixed stream"
    done
    command -v "$adb" >/dev/null 2>&1 || die "adb not found: $adb"
    command -v timeout >/dev/null 2>&1 || die "local timeout command is required"
    if [[ -z $serial ]]; then
      mapfile -t devices < <("$adb" devices 2>/dev/null | awk 'NR>1 && $2=="device"{print $1}')
      ((${#devices[@]} == 1)) || die "connect exactly one device or use --serial"
      serial=${devices[0]}
    fi
    [[ $serial =~ ^[A-Za-z0-9._:-]+$ ]] || die "unsafe serial"
    A=("$adb" -s "$serial")
    [[ $("${A[@]}" get-state 2>/dev/null) == device ]] || die "target is not ready"
    actual_uid=$("${A[@]}" shell -T id -u 2>/dev/null)
    actual_uid=${actual_uid//$'\r'/}
    [[ $require_uid == any || $actual_uid == "$require_uid" ]] ||
      die "adb shell UID is ${actual_uid:-unknown}, required $require_uid"
    ro() {
      local t=$1
      shift
      timeout -k 2s "${t}s" "${A[@]}" shell -T "$@"
    }
    declare -A P U K HB PIDUID C RP RCPU M FG KEY_BY_PID OK_BITS
    package_raw=
    package_rc=0
    add_package_line() {
      local l=$1 p= u=
      l=${l%$'\r'}
      if [[ $l =~ =([A-Za-z0-9_.]+)[[:space:]].*uid:([0-9]+) ]]; then
        p=${BASH_REMATCH[1]}
        u=${BASH_REMATCH[2]}
      elif [[ $l =~ ^package:([A-Za-z0-9_.]+).*uid:([0-9]+) ]]; then
        p=${BASH_REMATCH[1]}
        u=${BASH_REMATCH[2]}
      fi
      valid_pkg "$p" && uint "$u" || return
      P[$p]=$u
      case " ${U[$u]-} " in
        *" $p "*) ;;
        *) U[$u]="${U[$u]:+${U[$u]} }$p" ;;
      esac
    }
    parse_packages() {
      local l
      while IFS= read -r l; do
        add_package_line "$l"
      done <<<"$1"
    }
    if ((packages)); then
      package_raw=$(ro "$diag" pm list packages -f -i -U --show-versioncode --user current 2>&1)
      package_rc=$?
      parse_packages "$package_raw"
    fi
    stream_limit=$duration
    if ((until)); then
      now=$(date +%s)
      ((until > now)) || die "--until is not in the future"
      remain=$((until - now))
      ((stream_limit == 0 || remain < stream_limit)) && stream_limit=$remain
    fi
    normalized=0
    low=10
    high=90
    budget=30
    low100=1000
    high100=9000
    topmax=0
    normalize_thresholds() {
      local cores
      if ((topmax < 100)); then
        cores=$(ro "$diag" getconf _NPROCESSORS_ONLN 2>/dev/null)
        uint "$cores" && ((cores > 0)) && topmax=$((cores * 100))
      fi
      ((topmax >= 100)) || topmax=100
      if uint "$low_arg" && ((10#$low_arg <= topmax)); then low=$((10#$low_arg)); else low=10; fi
      if uint "$high_arg" && ((10#$high_arg <= topmax)); then high=$((10#$high_arg)); else high=90; fi
      if ((low > high)); then low=10; high=90; fi
      if uint "$budget_arg" && ((10#$budget_arg >= 1 && 10#$budget_arg <= 100)); then
        budget=$((10#$budget_arg))
      else
        budget=30
      fi
      low100=$((low * 100))
      high100=$((high * 100))
      normalized=1
    }
    pct100() {
      local x=${1%\%} i f
      [[ $x =~ ^([0-9]+)([.]([0-9]{1,2}))?$ ]] || return 1
      i=${BASH_REMATCH[1]}
      f=${BASH_REMATCH[3]}
      [[ -n $f ]] || f=0
      ((${#f} == 1)) && f=${f}0
      REPLY=$((10#$i * 100 + 10#$f))
    }
    out_day=
    file=
    ofd=
    bytes=0
    source_n=0
    saved_n=0
    last_saved=0
    hour_bucket=
    gate=0
    stop=0
    signal_no=0
    reason=running
    report=
    frame_epoch=0
    frame_stamp=
    frame_day=
    frame_hour=
    package_query=
    write_block() {
      local s=$1
      printf '%s\n' "$s" >&"$ofd" || {
        reason=write_error
        stop=1
        return 1
      }
      bytes=$((bytes + ${#s} + 1))
    }
    open_day() {
      [[ $out_day == "$frame_day" && -n $ofd ]] && return
      if [[ -n $ofd ]]; then exec {ofd}>&-; ofd=; fi
      file=$(mktemp "$out/${prefix}_${frame_stamp}_XXXXXX.txt") || {
        reason=create_error
        stop=1
        return 1
      }
      exec {ofd}>>"$file" || {
        reason=open_error
        stop=1
        return 1
      }
      out_day=$frame_day
      write_block "===== PROFILE day=$frame_day serial=$serial adb_uid=$actual_uid remote_writes=none packages=$packages package_rc=$package_rc ====="
      if ((packages)); then
        write_block $'===== PACKAGE_INVENTORY startup_snapshot system_and_user =====\n'"$package_raw"$'\n===== END_PACKAGE_INVENTORY ====='
      fi
      printf 'Writing %s\n' "$file"
    }
    query_process_uids() {
      local raw p u
      PIDUID=()
      raw=$(ro "$diag" ps -A -o PID,UID 2>/dev/null)
      while read -r p u; do
        uint "$p" && uint "$u" && PIDUID[$p]=$u
      done <<<"$raw"
    }
    query_package_uid() {
      local u=$1 q before=${U[$1]-}
      q=$(ro "$diag" pm list packages -f -i -U --show-versioncode --uid "$u" --user current 2>&1)
      package_query+=$'\n'"===== PACKAGE_UID_QUERY uid=$u ====="$'\n'"$q"$'\n===== END_PACKAGE_UID_QUERY ====='
      parse_packages "$q"
      [[ ${U[$u]-} != "$before" || -n ${U[$u]-} ]] || U[$u]=-
    }
    foreground() {
      local raw p
      FG=()
      raw=$(ro "$diag" "dumpsys activity activities 2>/dev/null | grep -E 'mResumedActivity|topResumedActivity|ResumedActivity' | head -n 12" 2>&1)
      FOREGROUND_RAW=$raw
      while read -r p; do
        p=${p%/}
        valid_pkg "$p" && FG[$p]=1
      done < <(printf '%s\n' "$raw" | grep -oE '[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)+/' | sort -u)
    }
    collect() {
      local cmd guard=':' key pid mask pkg crit=0 raw rc line okpid okmask
      KEY_BY_PID=()
      [[ $require_uid == any ]] || guard="[ \"\$(id -u)\" = $require_uid ] || exit 126"
      cmd="$guard; set --"
      for key in "${KEYS[@]}"; do
        mask=${M[$key]-0}
        ((mask)) || continue
        pid=${RP[$key]}
        pkg=-
        [[ $key == p:* ]] && pkg=${key#p:}
        [[ $pid =~ ^[1-9][0-9]*$ && $mask =~ ^[0-7]$ ]] || continue
        [[ $pkg == - ]] || valid_pkg "$pkg" || continue
        cmd+=" $pid $mask $pkg"
        KEY_BY_PID[$pid]=$key
        ((mask & 6)) && crit=1
      done
      cmd+='; while [ "$#" -ge 3 ]; do p=$1; m=$2; g=$3; shift 3; [ -r "/proc/$p/stat" ] && [ -r "/proc/$p/status" ] || { echo "@@MISS $p"; continue; }; echo "@@BEGIN pid=$p mask=$m package=$g"; ok=0; echo "--- /proc/$p/stat"; cat "/proc/$p/stat" 2>&1; a=$?; echo "--- /proc/$p/status"; cat "/proc/$p/status" 2>&1; b=$?; [ "$a" -eq 0 ] && [ "$b" -eq 0 ] && ok=1; for f in schedstat io cgroup; do echo "--- /proc/$p/$f"; cat "/proc/$p/$f" 2>&1; done; echo "--- THREADS"; ps -T -p "$p" -o PID,TID,USER,PR,NI,S,%CPU,%MEM,NAME 2>&1; if [ $((m & 5)) -ne 0 ] && [ "$g" != - ]; then echo "--- PACKAGE $g"; dumpsys package "$g" 2>&1; echo "--- APPOPS $g"; cmd appops get "$g" 2>&1; echo "--- JOBS $g"; dumpsys jobscheduler "$g" 2>&1; fi; if [ $((m & 6)) -ne 0 ]; then for f in smaps_rollup limits wchan; do echo "--- /proc/$p/$f"; cat "/proc/$p/$f" 2>&1; done; echo "--- MEMINFO $p"; dumpsys meminfo "$p" 2>&1; [ "$?" -eq 0 ] && ok=$((ok | 2)); fi; echo "@@OK $p $ok"; done'
      if ((crit)); then
        cmd+='; echo "--- SYSTEM_CPUINFO"; dumpsys cpuinfo 2>&1; echo "--- SYSTEM_MEMINFO"; cat /proc/meminfo 2>&1'
      fi
      raw=$(timeout -k 2s "${diag}s" "${A[@]}" shell -T "$cmd" 2>&1)
      rc=$?
      EVIDENCE_RAW=$'===== EVIDENCE rc='"$rc"$' =====\n'"$raw"$'\n===== END_EVIDENCE ====='
      OK_BITS=()
      while IFS= read -r line; do
        if [[ $line =~ ^@@OK[[:space:]]+([0-9]+)[[:space:]]+([0-7]+)$ ]]; then
          okpid=${BASH_REMATCH[1]}
          okmask=${BASH_REMATCH[2]}
          key=${KEY_BY_PID[$okpid]-}
          [[ -n $key ]] && OK_BITS[$key]=$okmask
        fi
      done <<<"$raw"
    }
    finish_report() {
      local partial=${1:-0} l pid user pr ni virt res shr state cpu mem name i base uid list key cache old cross due
      local keep=0 hot=0 rich=0 nonallowed=0 need_fg=0 work_start=0 work_ran=0 has_work=0 d b label mask
      local -a AP AU AC AN UNKNOWN ALLKEYS KEYS
      local -A UC
      [[ -n $report ]] || return
      if ((partial)); then
        open_day || return
        write_block "===== TOP source=$source_n time=$frame_stamp partial=1 ====="$'\n'"$report"$'\n===== END_TOP =====' || return
        ((saved_n++))
        report=
        return
      fi
      C=()
      RP=()
      RCPU=()
      M=()
      package_query=
      while IFS= read -r l; do
        if ((topmax == 0)) && [[ $l =~ ^[[:space:]]*([0-9]+)%cpu ]]; then
          topmax=${BASH_REMATCH[1]}
        fi
        read -r pid user pr ni virt res shr state cpu mem name <<<"$l"
        [[ $pid =~ ^[1-9][0-9]*$ && $user =~ ^[A-Za-z0-9_]+$ &&
           $name =~ ^[][A-Za-z0-9_.:+/@\ -]{1,128}$ ]] || continue
        pct100 "$cpu" || continue
        AP+=("$pid")
        AU+=("$user")
        AC+=("$REPLY")
        AN+=("$name")
      done <<<"$report"
      ((normalized)) || normalize_thresholds
      for ((i=0; i<${#AP[@]}; i++)); do
        UC[${AU[i]}]=$(( ${UC[${AU[i]}]-0} + AC[i] ))
      done
      for ((i=0; i<${#AP[@]}; i++)); do
        name=${AN[i]}
        cache="${AU[i]}|$name"
        if [[ -z ${K[$cache]+x} ]]; then
          if ((packages)); then
            if [[ -n ${P[$name]+x} ]]; then
              K[$cache]="p:$name"
            else
              base=${name%%:*}
              if [[ $base != "$name" && -n ${P[$base]+x} ]]; then
                K[$cache]="p:$base"
              elif (( ${UC[${AU[i]}]-0} >= low100 )); then
                UNKNOWN+=("$i")
              fi
            fi
          else
            K[$cache]="n:${AU[i]}:$name"
          fi
        fi
      done
      if ((${#UNKNOWN[@]})); then
        query_process_uids
        for i in "${UNKNOWN[@]}"; do
          pid=${AP[i]}
          name=${AN[i]}
          cache="${AU[i]}|$name"
          [[ -n ${K[$cache]+x} ]] && continue
          uid=${PIDUID[$pid]-}
          if uint "$uid"; then
            if [[ -z ${U[$uid]+x} ]]; then
              if ((uid >= 10000)); then query_package_uid "$uid"; else U[$uid]=-; fi
            fi
            list=${U[$uid]-}
            if [[ -n $list && $list != - && $list != *' '* ]]; then
              K[$cache]="p:$list"
            else
              K[$cache]="n:$uid:$name"
            fi
          else
            K[$cache]="n:${AU[i]}:$name"
          fi
        done
      fi
      for ((i=0; i<${#AP[@]}; i++)); do
        cache="${AU[i]}|${AN[i]}"
        [[ -n ${K[$cache]+x} ]] || continue
        key=${K[$cache]}
        if [[ -z ${C[$key]+x} ]]; then
          ALLKEYS+=("$key")
          C[$key]=0
          RCPU[$key]=-1
        fi
        C[$key]=$((C[$key] + AC[i]))
        if ((AC[i] > RCPU[$key])); then
          RCPU[$key]=${AC[i]}
          RP[$key]=${AP[i]}
        fi
      done
      for key in "${ALLKEYS[@]}"; do
        ((C[$key] >= low100)) && KEYS+=("$key")
      done
      ((${#KEYS[@]})) && hot=1
      [[ $frame_hour == "$hour_bucket" ]] || {
        hour_bucket=$frame_hour
        HB=()
      }
      for key in "${KEYS[@]}"; do
        cross=1
        ((C[$key] >= high100)) && cross=3
        old=${HB[$key]-0}
        due=$((cross & ~old))
        ((due)) && M[$key]=$due
      done
      if ((cap > 0 && SECONDS >= gate && hot)); then
        rich=1
        for key in "${KEYS[@]}"; do
          label=${key#*:}
          [[ $label =~ $allow ]] && continue
          nonallowed=1
          [[ $key == p:* ]] && need_fg=1
        done
        if ((nonallowed)); then
          work_start=$SECONDS
          work_ran=1
          ((need_fg)) && foreground
          b=0
          for key in "${KEYS[@]}"; do
            label=${key#*:}
            [[ $label =~ $allow ]] && continue
            if [[ $key == p:* && -n ${FG[${key#p:}]+x} ]]; then
              continue
            fi
            M[$key]=$(( ${M[$key]-0} | 4 ))
            ((++b >= cap)) && break
          done
        fi
      fi
      (( (source_n - 1) % every == 0 )) && keep=1
      ((period && last_saved && frame_epoch - last_saved < period)) && keep=0
      ((hot)) && keep=1
      if ((keep)); then
        open_day || return
        write_block "===== TOP source=$source_n time=$frame_stamp partial=0 topmax=$topmax low=$low high=$high budget=$budget ====="$'\n'"$report"$'\n===== END_TOP =====' || return
        ((saved_n++))
        last_saved=$frame_epoch
        [[ -z $package_query ]] || write_block "$package_query"
      fi
      for key in "${KEYS[@]}"; do
        ((${M[$key]-0})) && {
          has_work=1
          if ((!work_ran)); then work_start=$SECONDS; work_ran=1; fi
        }
      done
      if ((work_ran)); then
        ((keep)) || open_day || return
        if ((rich && need_fg)); then
          write_block $'===== FOREGROUND =====\n'"${FOREGROUND_RAW-}"$'\n===== END_FOREGROUND =====' || return
        fi
        if ((has_work)); then
          collect
          write_block "$EVIDENCE_RAW" || return
          for key in "${KEYS[@]}"; do
            mask=${OK_BITS[$key]-0}
            ((mask)) && HB[$key]=$(( ${HB[$key]-0} | (mask & ${M[$key]-0} & 3) ))
          done
        fi
        d=$((SECONDS - work_start))
        ((d < 1)) && d=1
        ((gate < work_start)) && gate=$work_start
        gate=$((gate + (d * 100 + budget - 1) / budget))
      fi
      if ((max_reports && saved_n >= max_reports)); then reason=max_reports; stop=1; fi
      if ((max_bytes && bytes >= max_bytes)); then reason=max_bytes; stop=1; fi
      report=
    }
    top_args=(shell -T nice -n 10 top -b -m "$rows" -o PID,USER,PR,NI,VIRT,RES,SHR,S,%CPU,%MEM,NAME:128)
    [[ -z $delay ]] || top_args+=(-d "$delay")
    top_args+=("${top_extra[@]}")
    if ((stream_limit)); then
      coproc TOP { timeout -k 2s "${stream_limit}s" "${A[@]}" "${top_args[@]}" 2>&1; }
    else
      coproc TOP { "${A[@]}" "${top_args[@]}" 2>&1; }
    fi
    exec {top_fd}<&"${TOP[0]}"
    top_pid=$TOP_PID
    trap 'signal_no=1; stop=1; reason=signal; kill "$top_pid" 2>/dev/null' HUP
    trap 'signal_no=2; stop=1; reason=signal; kill "$top_pid" 2>/dev/null' INT
    trap 'signal_no=15; stop=1; reason=signal; kill "$top_pid" 2>/dev/null' TERM
    while ((!stop)) && IFS= read -r -u "$top_fd" line; do
      line=${line%$'\r'}
      if [[ $line == Tasks:* || $line == Threads:* ]]; then
        finish_report 0
        ((stop)) && break
        read -r frame_epoch frame_stamp zone < <(date '+%s %Y%m%d_%H%M%S %z')
        frame_day=${frame_stamp:0:8}
        frame_hour="${frame_stamp:0:11}$zone"
        ((source_n++))
        report=$line
      elif [[ -n $report ]]; then
        report+=$'\n'"$line"
      fi
    done
    if [[ -n $report && $reason != write_error && $reason != create_error && $reason != open_error ]]; then
      finish_report 1
    fi
    kill "$top_pid" 2>/dev/null
    wait "$top_pid" 2>/dev/null
    top_rc=$?
    exec {top_fd}<&-
    if [[ -n $ofd ]]; then exec {ofd}>&-; ofd=; fi
    trap - HUP INT TERM
    status=0
    if ((signal_no)); then
      reason=signal_$signal_no
      status=$((128 + signal_no))
    elif [[ $reason == write_error || $reason == create_error || $reason == open_error ]]; then
      status=1
    elif [[ $reason == max_reports || $reason == max_bytes ]]; then
      status=0
    elif ((stream_limit && top_rc == 124)); then
      reason=deadline
      status=0
    elif ((top_rc)); then
      reason=top_error_$top_rc
      status=1
    else
      reason=top_ended
      status=1
    fi
    printf 'Stopped: %s; source=%d saved=%d bytes=%d%s\n' "$reason" "$source_n" "$saved_n" "$bytes" "${file:+; last=$file}"
    exit "$status"
  )
}
if [[ ${BASH_SOURCE[0]-} == "$0" ]]; then
  phone_top_profile "$@"
else
  phone_top_profile
fi
