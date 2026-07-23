phone_top_profile_v5() {
  local -a H=(
    'phone_top_profile_v5 [options]'
    ''
    'Continuous low-priority adb top logger. Default: every report, unlimited,'
    '10/90% hourly evidence, 30% rich duty, package+system context, no logcat.'
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
    '  --core-only         skip default power/screen/activity/network context'
    '  --logcat            max evidence: full process/context + bounded logs (sensitive)'
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
    low=10
    high=90
    budget=30
    cap=8
    diag=30
    packages=1
    context=1
    logs=0
    allow='^(com\.android\.soundrecorder|com\.chrome\.dev|com\.android\.chrome|com\.termux)($|:)'
    top_extra=()
    declare -A OPT=(
      [--dir]=out [--prefix]=prefix [--adb]=adb [--serial]=serial
      [--uid]=require_uid [--rows]=rows [--delay]=delay [--every]=every
      [--period]=period [--duration]=duration [--until]=until
      [--max-reports]=max_reports [--max-bytes]=max_bytes
      [--low]=low [--high]=high [--budget]=budget
      [--cap]=cap [--diag-timeout]=diag
    )
    die() {
      printf 'phone_top_profile_v5: %s\n' "$*" >&2
      exit 2
    }
    uint() {
      [[ $1 =~ ^[0-9]{1,18}$ ]]
    }
    valid_pkg() {
      [[ $1 =~ ^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)+$ ]]
    }
    while (($#)); do
      case $1 in
        --top)
          (($# > 1)) || die "$1 needs a value"
          [[ $2 =~ ^[-A-Za-z0-9_.,:=/%+]+$ &&
             $2 != --* && ! $2 =~ ^-[^-]*[bdmnoOq] ]] ||
            die "$2 conflicts with the continuous fixed stream"
          top_extra+=("$2")
          shift 2
          ;;
        --every-top) every=1; period=0; shift ;;
        --core-only) context=0; shift ;;
        --logcat) logs=1; shift ;;
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
    ((logs)) && context=1
    [[ -d $out && -w $out ]] || die "output directory is not writable: $out"
    [[ $prefix =~ ^[A-Za-z0-9._-]{1,64}$ ]] || die "unsafe prefix"
    if [[ $require_uid != any ]]; then
      uint "$require_uid" || die "--uid must be a number or any"
      require_uid=$((10#$require_uid))
    fi
    [[ -z $delay || $delay =~ ^[0-9]+([.][0-9]+)?$ ]] || die "--delay must be numeric"
    for v in rows every diag; do
      uint "${!v}" && ((10#${!v} > 0)) ||
        die "--${v//_/-} must be positive"
      printf -v "$v" '%d' "$((10#${!v}))"
    done
    for v in period duration until max_reports max_bytes cap; do
      uint "${!v}" || die "--${v//_/-} must be a nonnegative integer"
      printf -v "$v" '%d' "$((10#${!v}))"
    done
    [[ x =~ $allow ]]
    (($? != 2)) || die "invalid --allow regex"
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
    reason=running
    ro() {
      local t=$1
      shift
      [[ $reason == running ]] || return 130
      timeout -k 2s "${t}s" "${A[@]}" shell -T "$@"
    }
    declare -A P=() U=() K=() HB=()
    PM=(pm list packages -f -i -U --show-versioncode)
    package_raw=
    package_rc=0
    parse_packages() {
      local l p u
      while IFS= read -r l; do
        p=
        u=
        l=${l%$'\r'}
        if [[ $l =~ =([A-Za-z0-9_.]+)[[:space:]].*uid:([0-9]+) ]]; then
          p=${BASH_REMATCH[1]}
          u=${BASH_REMATCH[2]}
        elif [[ $l =~ ^package:([A-Za-z0-9_.]+).*uid:([0-9]+) ]]; then
          p=${BASH_REMATCH[1]}
          u=${BASH_REMATCH[2]}
        fi
        valid_pkg "$p" && uint "$u" || continue
        P[$p]=$u
        case " ${U[$u]-} " in
          *" $p "*) ;;
          *) U[$u]="${U[$u]:+${U[$u]} }$p" ;;
        esac
      done <<<"$1"
    }
    if ((packages)); then
      package_raw=$(ro "$diag" "${PM[@]}" --user current 2>&1)
      package_rc=$?
      parse_packages "$package_raw"
    fi
    if ((until)); then
      now=$(date +%s)
      ((until > now)) || die "--until is not in the future"
      remain=$((until - now))
      ((duration == 0 || remain < duration)) && duration=$remain
    fi
    high100=-1
    topmax=0
    normalize_thresholds() {
      local cores
      if ((topmax < 100)); then
        cores=$(ro "$diag" getconf _NPROCESSORS_ONLN 2>/dev/null)
        uint "$cores" && ((cores > 0)) && topmax=$((cores * 100))
      fi
      ((topmax >= 100)) || topmax=100
      if uint "$low" && ((10#$low <= topmax)); then low=$((10#$low)); else low=10; fi
      if uint "$high" && ((10#$high <= topmax)); then high=$((10#$high)); else high=90; fi
      if ((low > high)); then low=10; high=90; fi
      if uint "$budget" && ((10#$budget >= 1 && 10#$budget <= 100)); then
        budget=$((10#$budget))
      else
        budget=30
      fi
      low100=$((low * 100))
      high100=$((high * 100))
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
    report=
    frame_epoch=0
    frame_stamp=
    frame_day=
    frame_hour=
    write_block() {
      local s=$1
      printf '%s\n' "$s" >&"$ofd" || {
        [[ $reason == signal_* ]] || reason=write_error
        return 1
      }
      bytes=$((bytes + ${#s} + 1))
    }
    open_day() {
      [[ $out_day == "$frame_day" && -n $ofd ]] && return
      if [[ -n $ofd ]]; then exec {ofd}>&-; ofd=; fi
      file=$(mktemp "$out/${prefix}_${frame_stamp}_XXXXXX.txt") || {
        [[ $reason == signal_* ]] || reason=create_error
        return 1
      }
      exec {ofd}>>"$file" || {
        [[ $reason == signal_* ]] || reason=open_error
        return 1
      }
      out_day=$frame_day
      write_block "===== PROFILE day=$frame_day serial=$serial adb_uid=$actual_uid remote_writes=none packages=$packages package_rc=$package_rc context=$context logcat=$logs =====" ||
        return
      if ((packages)); then
        write_block $'===== PACKAGE_INVENTORY startup_snapshot system_and_user =====\n'"$package_raw"$'\n===== END_PACKAGE_INVENTORY =====' ||
          return
      fi
      printf 'Writing %s\n' "$file"
    }
    query_process_uids() {
      local p u
      PIDUID=()
      while read -r p u; do
        uint "$p" && uint "$u" && PIDUID[$p]=$u
      done < <(ro "$diag" ps -A -o PID,UID 2>/dev/null)
    }
    query_package_uid() {
      local u=$1 q
      q=$(ro "$diag" "${PM[@]}" --uid "$u" --user current 2>&1)
      package_query+=$'\n'"===== PACKAGE_UID_QUERY uid=$u ====="$'\n'"$q"$'\n===== END_PACKAGE_UID_QUERY ====='
      parse_packages "$q"
      [[ -n ${U[$u]-} ]] || U[$u]=-
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
      local cmd guard=':' key pid mask pkg priority crit=0 raw rc line okpid okmask context_cmd package_alts= uid_pattern= escaped uid focus_count=0 selected=0 complete marker log_producer_rc
      KEY_BY_PID=()
      OK_BITS=()
      marker="@@PHONE_TOP_${BASHPID}_${RANDOM}_${RANDOM}@@"
      [[ $require_uid == any ]] || guard="[ \"\$(id -u)\" = $require_uid ] || exit 126"
      cmd='set --'
      for priority in 2 0; do
        for key in "${KEYS[@]}"; do
          mask=${M[$key]-0}
          ((mask && (mask & 2) == priority)) || continue
          pkg=-
          [[ $key == p:* ]] && pkg=${key#p:}
          if ((selected < 64)); then
            pid=${RP[$key]}
            if [[ $pid =~ ^[1-9][0-9]*$ && $mask =~ ^[0-7]$ ]] &&
               { [[ $pkg == - ]] || valid_pkg "$pkg"; }; then
              cmd+=" $pid $mask $pkg"
              KEY_BY_PID[$pid]=$key
              ((mask & 6)) && crit=1
              ((selected+=1))
            fi
          fi
          if ((context && focus_count < 16)) && [[ $pkg != - ]] &&
             valid_pkg "$pkg" && ((${#pkg} <= 255)); then
            escaped=${pkg//./\\.}
            package_alts="${package_alts:+$package_alts|}$escaped"
            uid=${P[$pkg]-}
            uint "$uid" && uid_pattern="${uid_pattern:+$uid_pattern|}$uid"
            ((focus_count+=1))
          fi
          ((selected >= 64 && (context == 0 || focus_count >= 16))) &&
            break 2
        done
      done
      cmd+='; while [ "$#" -ge 3 ]; do p=$1; m=$2; g=$3; shift 3; r=/proc/$p; [ -r "$r/stat" ] && [ -r "$r/status" ] || { echo "@@MISS $p"; continue; }; echo "@@BEGIN pid=$p mask=$m package=$g"; ok=0; echo "--- $r/stat"; cat "$r/stat" 2>&1; a=$?; echo "--- $r/status"; cat "$r/status" 2>&1; b=$?; [ "$a" -eq 0 ] && [ "$b" -eq 0 ] && ok=1; for f in schedstat io cgroup; do echo "--- $r/$f"; cat "$r/$f" 2>&1; done; echo "--- THREADS"; ps -T -p "$p" -o PID,TID,USER,PR,NI,S,%CPU,%MEM,NAME 2>&1 | head -n 512; if [ $((m & 1)) -ne 0 ] && [ "$g" != - ]; then echo "--- PACKAGE $g"; dumpsys package "$g" 2>&1 | head -c 262144; echo; echo "--- APPOPS $g"; cmd appops get "$g" 2>&1 | head -c 131072; echo; echo "--- JOBS $g exact-package-context"; dumpsys jobscheduler "$g" 2>&1 | grep -F -B 2 -A 32 -e "$g" -e "Permission Denial" -e "Invalid package" -e "Unknown option" 2>/dev/null | head -c 131072; echo; fi; if [ $((m & 6)) -ne 0 ]; then for f in smaps_rollup limits wchan; do echo "--- $r/$f"; cat "$r/$f" 2>&1; done; echo "--- MEMINFO $p"; dumpsys meminfo "$p" 2>&1; [ "$?" -eq 0 ] && ok=$((ok | 2)); fi; echo "@@OK $p $ok"; done'
      if ((crit)); then
        cmd+='; echo "--- SYSTEM_CPUINFO"; dumpsys cpuinfo 2>&1 | head -c 262144; echo; echo "--- SYSTEM_MEMINFO"; cat /proc/meminfo 2>&1'
      fi
      cmd+="; echo \"$marker\""
      cmd="$guard; { $cmd; } | head -c 4194304"
      raw=$(ro "$diag" "$cmd" 2>&1)
      rc=$?
      [[ $reason == running ]] || return 130
      complete=0
      [[ ${raw##*$'\n'} == "$marker" ]] && complete=1
      while IFS= read -r line; do
        if [[ $line =~ ^@@OK[[:space:]]+([0-9]+)[[:space:]]+([0-7]+)$ ]]; then
          okpid=${BASH_REMATCH[1]}
          okmask=${BASH_REMATCH[2]}
          key=${KEY_BY_PID[$okpid]-}
          [[ -n $key ]] && OK_BITS[$key]=$okmask
        fi
      done <<<"$raw"
      write_block $'===== EVIDENCE transport_rc='"$rc"$' complete='"$complete"$' selected='"$selected"$' cap=64 =====\n'"$raw"$'\n===== END_EVIDENCE =====' ||
        return
      [[ $reason == running ]] || return 130
      if ((context)); then
        context_cmd='errors="permission denial|can.t find|not found|bad command|unknown|error"'
        context_cmd+='; echo "--- CONTEXT_BATTERY_STATE"; dumpsys battery 2>&1 | head -n 120; echo "--- CONTEXT_POWER_SUPPLIES raw_kernel_units"; n=0; for s in /sys/class/power_supply/*; do [ -d "$s" ] || continue; n=$((n+1)); [ "$n" -le 16 ] || break; for f in type online status health capacity current_now current_avg input_current_now current_max input_current_limit voltage_now voltage_max power_now charge_now charge_counter energy_now temp cycle_count; do p="$s/$f"; [ -r "$p" ] || continue; echo "### $p"; cat "$p" 2>&1; done; done'
        context_cmd+='; echo "--- CONTEXT_THERMAL"; dumpsys thermalservice 2>&1 | head -n 240; echo "--- CONTEXT_SCREEN_POWER_WAKELOCKS"; dumpsys power 2>&1 | head -n 480; echo "--- CONTEXT_DISPLAY"; dumpsys display 2>&1 | grep -i -E "mGlobalDisplayState|Display Power State|mScreenState|state=|mBrightness|$errors" | head -n 240'
        context_cmd+='; echo "--- CONTEXT_FOCUS"; dumpsys window windows 2>&1 | grep -i -E "mCurrentFocus|mFocusedApp|mTopFocusedDisplayId|mObscuringWindow|$errors" | head -n 120; echo "--- CONTEXT_ACTIVE_TASKS"; dumpsys activity activities 2>&1 | grep -i -E "mResumedActivity|topResumedActivity|ResumedActivity|mFocusedApp|RootTask|Task[{]|$errors" | head -n 320'
        context_cmd+='; echo "--- CONTEXT_PSI"; for f in cpu memory io; do echo "### /proc/pressure/$f"; cat "/proc/pressure/$f" 2>&1; done'
        context_cmd+='; echo "--- CONTEXT_ALARMS summary"; dumpsys alarm 2>&1 | grep -i -E -A 8 "wakeup|top alarms|alarm stats|recent.*alarm|pending alarm|$errors" | head -n 320'
        if [[ -n $package_alts ]]; then
          context_cmd+="; echo \"--- CONTEXT_ALARMS packages=$package_alts\"; dumpsys alarm 2>&1 | grep -i -E -A 8 \"(^|[^[:alnum:]_.])($package_alts)([^[:alnum:]_.]|\$)|\$errors\" | head -n 640"
        fi
        context_cmd+='; echo "--- CONTEXT_CONNECTIVITY"; dumpsys connectivity 2>&1 | grep -i -E "NetworkAgentInfo|NetworkRequest|NetworkCallback|Keepalive|VALIDATED|CAPTIVE_PORTAL|Default network|LinkProperties|$errors" | head -n 480'
        if [[ -n $uid_pattern ]]; then
          context_cmd+="; echo \"--- CONTEXT_NETSTATS uids=$uid_pattern\"; dumpsys netstats detail 2>&1 | grep -i -E -A 8 \"(^|[^[:alnum:]_])uid=($uid_pattern)([^0-9]|\$)|\$errors\" | head -n 640"
        fi
        context_cmd+='; echo "--- CONTEXT_NET_DEV"; cat /proc/net/dev 2>&1 | head -n 128; echo "--- CONTEXT_DISKSTATS"; cat /proc/diskstats 2>&1 | head -n 256'
        context_cmd="$guard; { $context_cmd; echo \"$marker\"; } | head -c 1048576"
        raw=$(ro "$diag" "$context_cmd" 2>&1)
        rc=$?
        [[ $reason == running ]] || return 130
        complete=0
        [[ ${raw##*$'\n'} == "$marker" ]] && complete=1
        write_block $'===== SYSTEM_CONTEXT transport_rc='"$rc"$' complete='"$complete"$' focus='"$focus_count"$' cap=16 bytes_cap=1048576 =====\n'"$raw"$'\n===== END_SYSTEM_CONTEXT =====' ||
          return
      fi
      [[ $reason == running ]] || return 130
      if ((logs)); then
        cmd="$guard; { echo logcatinfostart; echo \"--- LOGCAT latest=256 buffers=all filter=*:V\"; l=\$(logcat -b all -d -t 256 -v threadtime \"*:V\" 2>&1); x=\$?; printf \"%s\\n\" \"\$l\" | head -n 512; echo \"logcatinforc=\$x\"; echo logcatinfoend; } | head -c 262144"
        raw=$(ro "$diag" "$cmd" 2>&1)
        rc=$?
        [[ $reason == running ]] || return 130
        complete=0
        log_producer_rc=unknown
        if [[ ${raw##*$'\n'} == logcatinfoend ]]; then
          complete=1
          line=${raw%$'\n'*}
          line=${line##*$'\n'}
          [[ $line =~ ^logcatinforc=([0-9]+)$ ]] &&
            log_producer_rc=${BASH_REMATCH[1]}
        fi
        write_block $'===== LOGCAT_CONTEXT transport_rc='"$rc"$' producer_rc='"$log_producer_rc"$' complete='"$complete"$' sensitive=1 records=256 lines_cap=512 bytes_cap=262144 =====\n'"$raw"$'\n===== END_LOGCAT_CONTEXT =====' ||
          return
      fi
    }
    finish_report() {
      local partial=${1:-0} l pid user pr ni virt res shr state cpu mem name i base uid list key cache old cross due
      local keep=0 need_fg=0 work_start=-1 d b label mask package_query= FOREGROUND_RAW=
      local -a AP=() AU=() AC=() AN=() UNKNOWN=() ALLKEYS=() KEYS=()
      local -A UC=() PIDUID=() C=() RP=() RCPU=() M=() FG=() KEY_BY_PID=() OK_BITS=()
      [[ -n $report ]] || return
      if ((partial)); then
        open_day || return
        write_block "===== TOP source=$source_n time=$frame_stamp partial=1 ====="$'\n'"$report"$'\n===== END_TOP =====' || return
        ((saved_n++))
        report=
        return
      fi
      while IFS= read -r l; do
        if ((topmax == 0)) && [[ $l =~ ^[[:space:]]*([0-9]+)%cpu ]]; then
          topmax=${BASH_REMATCH[1]}
        fi
        read -r pid user pr ni virt res shr state cpu mem name <<<"$l"
        [[ $pid =~ ^[1-9][0-9]*$ && $user =~ ^[A-Za-z0-9_]+$ &&
           $name =~ ^[][A-Za-z0-9_.:+/@\ -]{1,128}$ ]] || continue
        [[ $user == shell && $name == top ]] && continue
        pct100 "$cpu" || continue
        AP+=("$pid")
        AU+=("$user")
        AC+=("$REPLY")
        AN+=("$name")
        UC[$user]=$(( ${UC[$user]-0} + REPLY ))
      done <<<"$report"
      ((high100 < 0)) && normalize_thresholds
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
        fi
        C[$key]=$((C[$key] + AC[i]))
        if ((AC[i] > ${RCPU[$key]:--1})); then
          RCPU[$key]=${AC[i]}
          RP[$key]=${AP[i]}
        fi
      done
      [[ $frame_hour == "$hour_bucket" ]] || {
        hour_bucket=$frame_hour
        HB=()
      }
      for key in "${ALLKEYS[@]}"; do
        ((C[$key] >= low100)) || continue
        KEYS+=("$key")
        cross=1
        ((C[$key] >= high100)) && cross=3
        old=${HB[$key]-0}
        due=$((cross & ~old))
        ((due)) && M[$key]=$((due | logs * 4))
      done
      if ((cap > 0 && SECONDS >= gate && ${#KEYS[@]})); then
        b=0
        for key in "${KEYS[@]}"; do
          label=${key#*:}
          [[ $label =~ $allow ]] && continue
          b=1
          [[ $key == p:* ]] && need_fg=1
        done
        if ((b)); then
          ((work_start < 0)) && work_start=$SECONDS
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
      [[ $reason == running ]] || return
      (( (source_n - 1) % every == 0 )) && keep=1
      ((period && last_saved && frame_epoch - last_saved < period)) && keep=0
      ((${#KEYS[@]})) && keep=1
      if ((keep)); then
        open_day || return
        write_block "===== TOP source=$source_n time=$frame_stamp partial=0 topmax=$topmax low=$low high=$high budget=$budget ====="$'\n'"$report"$'\n===== END_TOP =====' || return
        ((saved_n++))
        last_saved=$frame_epoch
        [[ -z $package_query ]] || write_block "$package_query" || return
        report=
      fi
      [[ $reason == running ]] || return
      if ((${#M[@]} && work_start < 0)); then
        work_start=$SECONDS
      fi
      if ((work_start >= 0)); then
        if ((need_fg)); then
          write_block $'===== FOREGROUND =====\n'"${FOREGROUND_RAW-}"$'\n===== END_FOREGROUND =====' || return
        fi
        if ((${#M[@]})); then
          collect || return
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
      if [[ $reason == running ]]; then
        if ((max_reports && saved_n >= max_reports)); then reason=max_reports; fi
        if ((max_bytes && bytes >= max_bytes)); then reason=max_bytes; fi
      fi
      report=
    }
    top_args=(shell -T nice -n 10 top -b -m "$rows" -o PID,USER,PR,NI,VIRT,RES,SHR,S,%CPU,%MEM,NAME:128)
    [[ -z $delay ]] || top_args+=(-d "$delay")
    top_args+=("${top_extra[@]}")
    if ((duration)); then
      coproc TOP { timeout -k 2s "${duration}s" "${A[@]}" "${top_args[@]}" 2>&1; }
    else
      coproc TOP { "${A[@]}" "${top_args[@]}" 2>&1; }
    fi
    exec {top_fd}<&"${TOP[0]}"
    top_pid=$TOP_PID
    for signal in 1 2 15; do
      trap "reason=signal_$signal; kill \"$top_pid\" 2>/dev/null" "$signal"
    done
    while [[ $reason == running ]] && IFS= read -r -u "$top_fd" line; do
      line=${line%$'\r'}
      if [[ $line == Tasks:* || $line == Threads:* ]]; then
        finish_report 0
        [[ $reason == running ]] || break
        read -r frame_epoch frame_stamp zone < <(date '+%s %Y%m%d_%H%M%S %z')
        frame_day=${frame_stamp:0:8}
        frame_hour="${frame_stamp:0:11}$zone"
        ((source_n++))
        report=$line
      elif [[ -n $report ]]; then
        report+=$'\n'"$line"
      fi
    done
    if [[ -n $report && $reason != *_error ]]; then
      finish_report 1
    fi
    kill "$top_pid" 2>/dev/null
    wait "$top_pid" 2>/dev/null
    top_rc=$?
    exec {top_fd}<&-
    if [[ -n $ofd ]]; then exec {ofd}>&-; ofd=; fi
    trap - 1 2 15
    status=1
    case $reason in
      signal_*) status=$((128 + ${reason#signal_})) ;;
      max_reports|max_bytes) status=0 ;;
      running)
        if ((duration && top_rc == 124)); then reason=deadline; status=0
        elif ((top_rc)); then reason=top_error_$top_rc
        else reason=top_ended
        fi
        ;;
    esac
    printf 'Stopped: %s; source=%d saved=%d bytes=%d%s\n' "$reason" "$source_n" "$saved_n" "$bytes" "${file:+; last=$file}"
    exit "$status"
  )
}
if [[ ${BASH_SOURCE[0]-} == "$0" ]]; then
  phone_top_profile_v5 "$@"
else
  phone_top_profile_v5
fi
