phone_top_profile_v6() {
  phone_top_profile_v6_usage() {
    printf '%s\n' \
      'phone_top_profile_v6 [options]' \
      '' \
      'Continuous Android top plus asynchronous read-only hot-process evidence.' \
      'With no arguments this help is shown; collection never starts.' \
      '' \
      'Core:' \
      '  --every-top              save every top report (default)' \
      '  --every N                save every Nth report; hot reports override' \
      '  --period SEC             minimum ordinary-save spacing; hot overrides' \
      '  --rows N                 top row limit (default 80)' \
      '  --delay SEC              pass top refresh delay; default is top native cadence' \
      '  --top-arg ARG            append one safe token to top; repeatable' \
      '  --dir DIR                output directory (default ~/storage/downloads)' \
      '  --prefix NAME            filename prefix (default phone_top)' \
      '' \
      'Hot evidence:' \
      '  --low PCT                first threshold (default/fallback 10)' \
      '  --high PCT               second threshold (default/fallback 90)' \
      '  --probe-refresh MODE     hourly (default), daily, or off' \
      '  --observer-budget PCT    optional diagnostic duty budget (default 30)' \
      '  --batch-cap N            targets per diagnostic worker (default 6)' \
      '  --diag-timeout SEC       each read-only adb diagnostic timeout (default 20)' \
      '  --context / --core-only  context on (default) or process-only' \
      '  --logcat                 add bounded logcat evidence; default off' \
      '  --surveillance / --no-surveillance  optional background repeats' \
      '  --allow-regex REGEX      optional-repeat exemption (default Chrome/Termux)' \
      '  --packages / --no-packages          package inventory and package probes' \
      '' \
      'Compression and growth policy:' \
      '  --delta-match PCT        unknown-hash previous-state match (default 80)' \
      '  --data-saver MODE        max, high, mid (default), low, or none' \
      '  --hour-cap SIZE          override saver hourly threshold' \
      '  --day-cap SIZE           override saver daily threshold' \
      '  --total-cap SIZE         override saver run threshold' \
      '  --checkpoint SEC         occurrence/checkpoint flush (default 300)' \
      '  SIZE accepts decimal B/K/KB/M/MB/G/GB, -1, or unlimited.' \
      '  Saver 0 means optional work is disabled immediately; -1 is unlimited.' \
      '  Presets hour/day/run MB: max 0/0/0, high 1/10/100,' \
      '  mid 10/100/unlimited, low 100/unlimited/unlimited, none all unlimited.' \
      '  Saver limits never suppress top or the first 10/90 probe per epoch.' \
      '' \
      'Stop and transport:' \
      '  --duration TIME          stop after elapsed time; 10m/2h/1d accepted' \
      '  --until EPOCH            stop at Unix epoch' \
      '  --max-reports N          zero is unlimited' \
      '  --max-bytes SIZE         complete-record hard stop; 0/unlimited is unlimited' \
      '  --source-timeout SEC     restart silent/dead top source (default 60)' \
      '  --adb PATH               adb executable (default adb)' \
      '  --serial SERIAL          select target; otherwise exactly one is required' \
      '  --require-uid UID|any    adb shell UID guard (default 2000)' \
      '  -h, --help               show help' \
      '' \
      'Files are unique full-timestamp TXT files, rotate daily, and are never' \
      'overwritten. Termux owns policy, hashes, compression and writing; adb' \
      'shell performs only bounded read-only extraction. Output can contain' \
      'package, notification and device metadata; keep shared TXT files private.'
  }

  (($#)) || {
    phone_top_profile_v6_usage
    return 0
  }
  case ${1-} in
    -h|--help)
      phone_top_profile_v6_usage
      return 0
      ;;
  esac

  (
    set +e
    set +u
    set +x
    set +E
    set +T
    set +o pipefail
    trap - ERR DEBUG RETURN
    export LC_ALL=C
    umask 077

    reason=running
    finalized=0
    out=${HOME}/storage/downloads
    prefix=phone_top
    adb=adb
    serial=
    require_uid=2000
    rows=80
    delay=
    every=1
    period=0
    duration=0
    until=0
    max_reports=0
    max_bytes=0
    low_arg=10
    high_arg=90
    low=10
    high=90
    low100=1000
    high100=9000
    topmax=0
    thresholds_ready=0
    refresh=hourly
    budget=30
    batch_cap=6
    diag_timeout=20
    source_timeout=60
    checkpoint_interval=300
    delta_match=80
    saver=mid
    hour_override=
    day_override=
    total_override=
    context=1
    logs=0
    packages=1
    surveillance=1
    allow='(^|[.:])(com\.chrome\.dev|com\.android\.chrome|com\.termux)($|[.:])'
    probe_cap=4194304
    context_cap=2621440
    package_cap=4194304
    frame_cap=1048576
    declare -a top_extra=()

    die() {
      printf 'CONFIGURATION ERROR: %s\n' "$*" >&2
      exit 2
    }
    dec() {
      local x=${1-}
      [[ $x =~ ^[0-9]{1,18}$ ]] || return 1
      REPLY=$((10#$x))
    }
    uint() {
      dec "${1-}"
    }
    posint() {
      dec "${1-}" && ((REPLY > 0))
    }
    scaled_dec() {
      local x=${1-} mult=${2-1} n
      dec "$x" || return 1
      n=$REPLY
      ((n <= 9223372036854775807 / mult)) || return 1
      REPLY=$((n * mult))
    }
    valid_pkg() {
      [[ ${1-} =~ ^[A-Za-z0-9_]+([.][A-Za-z0-9_]+)+$ ]]
    }
    valid_prefix() {
      [[ ${1-} =~ ^[A-Za-z0-9_.-]{1,80}$ ]]
    }
    valid_top_arg() {
      [[ ${1-} =~ ^[-A-Za-z0-9_.,:+%=/]+$ ]]
    }
    parse_time() {
      local x=${1-} n m=1
      case $x in
        *[sS]) n=${x%?}; m=1 ;;
        *[mM]) n=${x%?}; m=60 ;;
        *[hH]) n=${x%?}; m=3600 ;;
        *[dD]) n=${x%?}; m=86400 ;;
        *) n=$x ;;
      esac
      scaled_dec "$n" "$m"
    }
    parse_size() {
      local x=${1-} n suffix mult=1
      x=${x,,}
      case $x in
        -1|unlimited|inf|infinite)
          REPLY=-1
          return 0
          ;;
      esac
      [[ $x =~ ^([0-9]+)(b|k|kb|m|mb|g|gb)?$ ]] || return 1
      n=${BASH_REMATCH[1]}
      suffix=${BASH_REMATCH[2]}
      case $suffix in
        k|kb) mult=1000 ;;
        m|mb) mult=1000000 ;;
        g|gb) mult=1000000000 ;;
      esac
      scaled_dec "$n" "$mult"
    }
    pct100() {
      local x=${1%\%} i f whole
      [[ $x =~ ^([0-9]+)([.]([0-9]{1,2}))?$ ]] || return 1
      i=${BASH_REMATCH[1]}
      f=${BASH_REMATCH[3]}
      dec "$i" || return 1
      whole=$REPLY
      ((whole <= 1000000)) || return 1
      [[ -n $f ]] || f=0
      ((${#f} == 1)) && f=${f}0
      REPLY=$((whole * 100 + 10#$f))
    }
    esc() {
      REPLY=${1//\\/\\\\}
      REPLY=${REPLY//$'\t'/\\t}
      REPLY=${REPLY//$'\r'/\\r}
      REPLY=${REPLY//$'\n'/\\n}
    }
    clock_snapshot() {
      date '+%s|%Y%m%d_%H%M%S_%N|%Y%m%d|%Y%m%d%H|%Y-%m-%dT%H:%M:%S%z'
    }

    while (($#)); do
      opt=$1
      shift
      case $opt in
        -h|--help)
          phone_top_profile_v6_usage
          exit 0
          ;;
        --every-top)
          every=1
          period=0
          ;;
        --every|--period|--rows|--delay|--top-arg|--dir|--prefix|--low|--high|--probe-refresh|--observer-budget|--batch-cap|--diag-timeout|--delta-match|--data-saver|--hour-cap|--day-cap|--total-cap|--checkpoint|--duration|--until|--max-reports|--max-bytes|--source-timeout|--adb|--serial|--require-uid|--allow-regex)
          (($#)) || die "$opt needs a value"
          val=$1
          shift
          case $opt in
            --every) every=$val ;;
            --period) period=$val ;;
            --rows) rows=$val ;;
            --delay) delay=$val ;;
            --top-arg) top_extra+=("$val") ;;
            --dir) out=$val ;;
            --prefix) prefix=$val ;;
            --low) low_arg=$val ;;
            --high) high_arg=$val ;;
            --probe-refresh) refresh=$val ;;
            --observer-budget) budget=$val ;;
            --batch-cap) batch_cap=$val ;;
            --diag-timeout) diag_timeout=$val ;;
            --delta-match) delta_match=$val ;;
            --data-saver) saver=$val ;;
            --hour-cap) hour_override=$val ;;
            --day-cap) day_override=$val ;;
            --total-cap) total_override=$val ;;
            --checkpoint) checkpoint_interval=$val ;;
            --duration) duration=$val ;;
            --until) until=$val ;;
            --max-reports) max_reports=$val ;;
            --max-bytes) max_bytes=$val ;;
            --source-timeout) source_timeout=$val ;;
            --adb) adb=$val ;;
            --serial) serial=$val ;;
            --require-uid) require_uid=$val ;;
            --allow-regex) allow=$val ;;
          esac
          ;;
        --context) context=1 ;;
        --core-only) context=0 ;;
        --logcat) logs=1 ;;
        --surveillance) surveillance=1 ;;
        --no-surveillance) surveillance=0 ;;
        --packages) packages=1 ;;
        --no-packages) packages=0 ;;
        *) die "unknown option: $opt" ;;
      esac
    done

    posint "$every" || die "--every must be positive"
    every=$REPLY
    parse_time "$period" || die "bad --period"
    period=$REPLY
    posint "$rows" || die "--rows must be positive"
    rows=$REPLY
    if [[ -n $delay ]]; then
      [[ $delay =~ ^[0-9]+([.][0-9]+)?$ ]] || die "bad --delay"
    fi
    case $refresh in hourly|daily|off) ;; *) die "bad --probe-refresh" ;; esac
    if dec "$budget" && ((REPLY >= 1 && REPLY <= 100)); then
      budget=$REPLY
    else
      budget=30
    fi
    posint "$batch_cap" || die "--batch-cap must be positive"
    batch_cap=$REPLY
    ((batch_cap <= 32)) || batch_cap=32
    parse_time "$diag_timeout" || die "bad --diag-timeout"
    diag_timeout=$REPLY
    ((diag_timeout >= 2)) || diag_timeout=2
    if dec "$delta_match" && ((REPLY <= 100)); then
      delta_match=$REPLY
    else
      delta_match=80
    fi
    parse_time "$checkpoint_interval" || die "bad --checkpoint"
    checkpoint_interval=$REPLY
    ((checkpoint_interval >= 10)) || checkpoint_interval=10
    parse_time "$duration" || die "bad --duration"
    duration=$REPLY
    dec "$until" || die "bad --until"
    until=$REPLY
    dec "$max_reports" || die "bad --max-reports"
    max_reports=$REPLY
    parse_size "$max_bytes" || die "bad --max-bytes"
    max_bytes=$REPLY
    ((max_bytes >= 0)) || max_bytes=0
    parse_time "$source_timeout" || die "bad --source-timeout"
    source_timeout=$REPLY
    ((source_timeout >= 5)) || source_timeout=5
    if [[ -n $delay ]]; then
      suggested_timeout=$(awk -v d="$delay" 'BEGIN { printf "%d", d*3+5.999 }')
      posint "$suggested_timeout" &&
        ((REPLY > source_timeout)) &&
        source_timeout=$REPLY
    fi
    valid_prefix "$prefix" || die "unsafe --prefix"
    for val in "${top_extra[@]}"; do
      valid_top_arg "$val" || die "unsafe --top-arg token"
    done
    ((logs == 0 || context)) || die "--logcat requires context; remove --core-only"
    [[ -d $out && -w $out ]] || die "output directory is not writable: $out"
    case $require_uid in
      any) ;;
      *) dec "$require_uid" || die "bad --require-uid"; require_uid=$REPLY ;;
    esac
    case $saver in
      max) hour_cap=0; day_cap=0; total_cap=0 ;;
      high) hour_cap=1000000; day_cap=10000000; total_cap=100000000 ;;
      mid) hour_cap=10000000; day_cap=100000000; total_cap=-1 ;;
      low) hour_cap=100000000; day_cap=-1; total_cap=-1 ;;
      none) hour_cap=-1; day_cap=-1; total_cap=-1 ;;
      *) die "bad --data-saver" ;;
    esac
    if [[ -n $hour_override ]]; then
      parse_size "$hour_override" || die "bad --hour-cap"
      hour_cap=$REPLY
    fi
    if [[ -n $day_override ]]; then
      parse_size "$day_override" || die "bad --day-cap"
      day_cap=$REPLY
    fi
    if [[ -n $total_override ]]; then
      parse_size "$total_override" || die "bad --total-cap"
      total_cap=$REPLY
    fi

    for tool in timeout sha256sum gzip base64 awk head tail wc mktemp cmp cp mv \
      mkdir grep cat date sleep rm rmdir truncate; do
      command -v "$tool" >/dev/null 2>&1 || die "missing local command: $tool"
    done
    command -v "$adb" >/dev/null 2>&1 || die "adb not found: $adb"

    runtime=$(mktemp -d "${TMPDIR:-/tmp}/phone_top_v6.XXXXXXXX") ||
      die "cannot create private Termux workspace"
    [[ -n $runtime && -d $runtime ]] || die "private workspace validation failed"
    trap '[[ -n ${runtime-} && $runtime == "${TMPDIR:-/tmp}/phone_top_v6."* ]] && rm -rf -- "$runtime"' EXIT

    declare -a A=("$adb")
    if [[ -z $serial ]]; then
      mapfile -t devices < <(
        timeout -k 2s "${diag_timeout}s" "$adb" devices 2>/dev/null |
          awk 'NR>1 && $2=="device" {print $1}'
      )
      ((${#devices[@]} == 1)) || die "use --serial; ready adb devices=${#devices[@]}"
      serial=${devices[0]}
    fi
    [[ $serial =~ ^[A-Za-z0-9._:-]+$ ]] || die "unsafe serial"
    A+=(-s "$serial")
    [[ $(timeout -k 2s "${diag_timeout}s" "${A[@]}" get-state 2>/dev/null) == device ]] ||
      die "adb target is not ready"
    actual_uid=$(timeout -k 2s "${diag_timeout}s" "${A[@]}" shell -T id -u 2>/dev/null)
    actual_uid=${actual_uid//$'\r'/}
    case $require_uid in
      any) ;;
      *) [[ $actual_uid == "$require_uid" ]] ||
           die "adb shell UID is ${actual_uid:-unknown}, required $require_uid" ;;
    esac
    boot_id=$(timeout -k 2s "${diag_timeout}s" "${A[@]}" shell -T \
      cat /proc/sys/kernel/random/boot_id 2>/dev/null)
    boot_id=${boot_id//$'\r'/}
    [[ $boot_id =~ ^[A-Fa-f0-9-]{8,64}$ ]] || boot_id=unknown

    ro() {
      local seconds=$1
      shift
      timeout -k 2s "${seconds}s" "${A[@]}" shell -T "$@"
    }

    package_file=$runtime/packages.txt
    declare -A PKG_UID=() UID_PKGS=()
    parse_packages() {
      local line pkg uid
      while IFS= read -r line; do
        line=${line%$'\r'}
        pkg=
        uid=
        if [[ $line =~ =([A-Za-z0-9_.]+)[[:space:]].*uid:([0-9]+) ]]; then
          pkg=${BASH_REMATCH[1]}
          uid=${BASH_REMATCH[2]}
        elif [[ $line =~ ^package:([A-Za-z0-9_.]+).*uid:([0-9]+) ]]; then
          pkg=${BASH_REMATCH[1]}
          uid=${BASH_REMATCH[2]}
        fi
        valid_pkg "$pkg" && uint "$uid" || continue
        PKG_UID[$pkg]=$uid
        case " ${UID_PKGS[$uid]-} " in
          *" $pkg "*) ;;
          *) UID_PKGS[$uid]="${UID_PKGS[$uid]:+${UID_PKGS[$uid]} }$pkg" ;;
        esac
      done <"$package_file"
    }
    package_rc=disabled
    capture_packages() {
      local uid_now n
      local -a pipe_status
      PKG_UID=()
      UID_PKGS=()
      : >"$package_file"
      ((packages)) || {
        package_rc=disabled
        return 0
      }
      uid_now=$(ro "$diag_timeout" id -u 2>/dev/null)
      uid_now=${uid_now//$'\r'/}
      if [[ $require_uid != any && $uid_now != "$require_uid" ]]; then
        package_rc=uid_guard_${uid_now:-unavailable}
        return 0
      fi
      ro "$diag_timeout" pm list packages -f -i -U --show-versioncode \
        --user current 2>&1 | head -c "$package_cap" >"$package_file"
      pipe_status=("${PIPESTATUS[@]}")
      package_rc=${pipe_status[0]:-125}
      if bytes_file "$package_file"; then
        n=$REPLY
        ((n < package_cap)) || package_rc=${package_rc}_truncated
      fi
      parse_packages
    }

    declare -A PROBED=() PROBE_RETRY=()
    declare -A Q_ENTITY=() Q_EPOCH=() Q_DEPTH=() Q_BITS=() Q_REASON=() Q_LAST=()
    declare -A Q_CPU=() Q_PID=() Q_PKG=() Q_ACTIVE=() Q_AFTER=() INFLIGHT=()
    declare -A FLIGHT_BITS=()
    declare -A B_KEY=() B_BITS=() B_EPOCH=() B_SOURCE=() B_REASON=()
    declare -A B_PID=() B_DEPTH=() B_PKG=() B_CPU=()
    declare -a Q_ORDER=()
    batch_serial=0

    declare -A HASH_STATE=() PREV_ID=() PREV_PATH=() PREV_DEPTH=()
    declare -A STATE_DEPTH=() ENTITY_ID=() ENTITY_DEFINED=()
    declare -A ENTITY_LABEL=() ENTITY_KIND=() ENTITY_PACKAGE=()
    declare -A OCC_COUNT=() OCC_TIMES=() OCC_SOURCES=() OCC_REASONS=() OCC_EPOCHS=()
    declare -a OCC_ORDER=()
    entity_serial=0
    state_serial=0
    top_serial=0
    last_top_key=
    last_top_id=
    last_hot_hash=

    ofd=
    file=
    out_day=
    run_hour=
    probe_epoch=run_$BASHPID
    record_seq=0
    source_n=0
    saved_n=0
    run_bytes=0
    day_bytes=0
    hour_bytes=0
    file_bytes=0
    last_saved_epoch=0
    next_checkpoint=$((SECONDS + checkpoint_interval))
    run_start_epoch=$(date +%s)
    run_start_seconds=$SECONDS
    worker_pid=
    worker_reaped=0
    worker_stage=
    worker_started=0
    top_pid=
    top_fd=
    remote_top_pid=
    source_attempt=0
    source_retry=0
    frame_open=0
    report=
    frame_epoch=0
    frame_stamp=
    frame_day=
    frame_hour=
    frame_iso=
    fg_package=
    gate_until=0
    context_epoch_done=
    context_retry_epoch=
    context_retry_count=0
    worker_context_epoch=
    healthy_frames=0
    source_noise=
    frame_overflow=0

    sha_file() {
      local rest
      read -r REPLY rest < <(sha256sum -- "$1")
      [[ $REPLY =~ ^[0-9a-f]{64}$ ]]
    }
    bytes_file() {
      REPLY=$(wc -c <"$1")
      REPLY=${REPLY//[[:space:]]/}
      uint "$REPLY"
    }
    sha_text() {
      local rest
      read -r REPLY rest < <(printf '%s' "$1" | sha256sum)
      [[ $REPLY =~ ^[0-9a-f]{64}$ ]]
    }
    emit_record() {
      local type=$1 meta=$2 mode=$3 payload=$4 body_n body_h header footer delta candidate rc
      [[ -n $ofd ]] || return 1
      case $meta in
        *$'\n'*|*$'\r'*) reason=serializer_meta_error; return 1 ;;
      esac
      if [[ $mode == file ]]; then
        [[ -f $payload && -r $payload ]] || {
          reason=serializer_payload_error
          return 1
        }
        bytes_file "$payload" || {
          reason=serializer_count_error
          return 1
        }
        body_n=$REPLY
        sha_file "$payload" || {
          reason=serializer_hash_error
          return 1
        }
        body_h=$REPLY
      else
        body_n=${#payload}
        sha_text "$payload" || {
          reason=serializer_hash_error
          return 1
        }
        body_h=$REPLY
      fi
      candidate=$((record_seq + 1))
      printf -v header '@BEGIN seq=%d type=%s bytes=%d sha256=%s%s%s\n' \
        "$candidate" "$type" "$body_n" "$body_h" "${meta:+ }" "$meta"
      printf -v footer '\n@END seq=%d\n' "$candidate"
      delta=$((${#header} + body_n + ${#footer}))
      if ((max_bytes && run_bytes + delta > max_bytes)); then
        reason=max_bytes
        return 75
      fi
      if [[ $mode == file ]]; then
        printf '%s' "$header" >&"$ofd" &&
          cat -- "$payload" >&"$ofd" &&
          printf '%s' "$footer" >&"$ofd"
      else
        printf '%s%s%s' "$header" "$payload" "$footer" >&"$ofd"
      fi
      rc=$?
      if ((rc)); then
        exec {ofd}>&-
        ofd=
        truncate -s "$file_bytes" -- "$file" 2>/dev/null
        reason=write_error
        return 1
      fi
      record_seq=$candidate
      file_bytes=$((file_bytes + delta))
      day_bytes=$((day_bytes + delta))
      hour_bytes=$((hour_bytes + delta))
      run_bytes=$((run_bytes + delta))
      return 0
    }
    emit_text() {
      emit_record "$1" "$2" text "$3"
    }

    saver_open() {
      ((hour_cap < 0 || hour_bytes < hour_cap)) &&
        ((day_cap < 0 || day_bytes < day_cap)) &&
        ((total_cap < 0 || run_bytes < total_cap))
    }
    ensure_entity() {
      local key=$1 kind=$2 label=$3 pkg=${4--} body eid el ep
      if [[ -z ${ENTITY_ID[$key]-} ]]; then
        ((entity_serial++))
        ENTITY_ID[$key]=E$entity_serial
        ENTITY_KIND[$key]=$kind
        ENTITY_LABEL[$key]=$label
        ENTITY_PACKAGE[$key]=$pkg
      fi
      eid=${ENTITY_ID[$key]}
      if [[ -z ${ENTITY_DEFINED[$key]-} && -n $ofd ]]; then
        esc "$label"
        el=$REPLY
        esc "$pkg"
        ep=$REPLY
        body="entity=$eid"$'\n'"kind=$kind"$'\n'"label=$el"$'\n'"package=$ep"
        emit_text ENTITY "entity=$eid" "$body" || return
        ENTITY_DEFINED[$key]=1
      fi
      REPLY=$eid
    }
    add_occurrence() {
      local sid=$1 stamp=$2 source=$3 why=${4-0} epoch=${5--}
      if [[ -z ${OCC_COUNT[$sid]-} ]]; then
        OCC_COUNT[$sid]=0
        OCC_TIMES[$sid]=
        OCC_SOURCES[$sid]=
        OCC_REASONS[$sid]=
        OCC_EPOCHS[$sid]=
        OCC_ORDER+=("$sid")
      fi
      OCC_COUNT[$sid]=$((OCC_COUNT[$sid] + 1))
      OCC_TIMES[$sid]+="${OCC_TIMES[$sid]:+,}$stamp"
      OCC_SOURCES[$sid]+="${OCC_SOURCES[$sid]:+,}$source"
      OCC_REASONS[$sid]+="${OCC_REASONS[$sid]:+,}$why"
      OCC_EPOCHS[$sid]+="${OCC_EPOCHS[$sid]:+,}$epoch"
    }
    flush_occurrences() {
      local sid body= count=0
      local -a done=()
      [[ -n $ofd ]] || return 0
      for sid in "${OCC_ORDER[@]}"; do
        [[ -n ${OCC_COUNT[$sid]-} ]] || continue
        body+="SEEN state=$sid count=${OCC_COUNT[$sid]} at={${OCC_TIMES[$sid]}} sources={${OCC_SOURCES[$sid]}} reasons={${OCC_REASONS[$sid]}} epochs={${OCC_EPOCHS[$sid]}}"$'\n'
        done+=("$sid")
        ((count++))
      done
      if ((count)); then
        emit_text SEEN_BATCH "states=$count" "$body" || return
        for sid in "${done[@]}"; do
          unset 'OCC_COUNT[$sid]' 'OCC_TIMES[$sid]' 'OCC_SOURCES[$sid]' \
            'OCC_REASONS[$sid]' 'OCC_EPOCHS[$sid]'
        done
      fi
      OCC_ORDER=()
    }
    delta_plan() {
      local old=$1 fresh=$2 old_n new_n max
      bytes_file "$old" || return 1
      old_n=$REPLY
      bytes_file "$fresh" || return 1
      new_n=$REPLY
      max=$old_n
      ((new_n > max)) && max=$new_n
      read -r DELTA_PREFIX DELTA_SUFFIX DELTA_SIM DELTA_OLD_LINES DELTA_NEW_LINES < <(
        awk -v maximum="$max" '
          FILENAME==ARGV[1] { a[++na]=$0; next }
          FILENAME==ARGV[2] { b[++nb]=$0; next }
          END {
            m=(na<nb?na:nb)
            while (p<m && a[p+1]==b[p+1]) p++
            while (s<m-p && a[na-s]==b[nb-s]) s++
            c=0
            for (i=1;i<=p;i++) c+=length(a[i])+1
            for (i=0;i<s;i++) c+=length(a[na-i])+1
            ratio=(maximum?int(c*100/maximum):100)
            print p+0,s+0,ratio+0,na+0,nb+0
          }
        ' "$old" "$fresh"
      )
      uint "$DELTA_PREFIX" && uint "$DELTA_SUFFIX" &&
        uint "$DELTA_SIM" && uint "$DELTA_NEW_LINES"
    }
    build_verified_delta() {
      local old=$1 fresh=$2 delta=$3 rebuilt=$4 end fresh_n rebuilt_n fresh_h rebuilt_h
      delta_plan "$old" "$fresh" || return 1
      ((DELTA_SIM >= delta_match)) || return 1
      end=$((DELTA_NEW_LINES - DELTA_SUFFIX))
      awk -v first="$((DELTA_PREFIX + 1))" -v last="$end" \
        'NR>=first && NR<=last {print}' "$fresh" >"$delta" || return 1
      : >"$rebuilt" || return 1
      ((DELTA_PREFIX == 0)) || head -n "$DELTA_PREFIX" "$old" >>"$rebuilt"
      cat "$delta" >>"$rebuilt" || return 1
      ((DELTA_SUFFIX == 0)) || tail -n "$DELTA_SUFFIX" "$old" >>"$rebuilt"
      bytes_file "$fresh" || return 1
      fresh_n=$REPLY
      bytes_file "$rebuilt" || return 1
      rebuilt_n=$REPLY
      ((fresh_n == rebuilt_n)) || return 1
      sha_file "$fresh" || return 1
      fresh_h=$REPLY
      sha_file "$rebuilt" || return 1
      rebuilt_h=$REPLY
      [[ $fresh_h == "$rebuilt_h" ]] || return 1
      cmp -s -- "$fresh" "$rebuilt"
    }
    store_state() {
      local key=$1 schema=$2 raw=$3 stamp=$4 source=$5 why=${6-0} epoch=${7--}
      local eid n sha hash_key state_key sid candidate previous old_path old_depth
      local fresh delta rebuilt payload type meta depth payload_n latest encoded packed
      [[ -f $raw ]] || return 1
      ensure_entity "$key" "${ENTITY_KIND[$key]-unknown}" "${ENTITY_LABEL[$key]-$key}" \
        "${ENTITY_PACKAGE[$key]--}" || return
      eid=$REPLY
      bytes_file "$raw" || return 1
      n=$REPLY
      sha_file "$raw" || return 1
      sha=$REPLY
      hash_key="$key"$'\x1f'"$schema"$'\x1f'"$n"$'\x1f'"$sha"
      sid=${HASH_STATE[$hash_key]-}
      state_key="$key"$'\x1f'"$schema"
      if [[ -n $sid ]]; then
        fresh=$state_dir/latest_$eid
        cp -- "$raw" "$fresh.new" && mv -- "$fresh.new" "$fresh" || return 1
        PREV_ID[$state_key]=$sid
        PREV_PATH[$state_key]=$fresh
        PREV_DEPTH[$state_key]=${STATE_DEPTH[$sid]-0}
        add_occurrence "$sid" "$stamp" "$source" "$why" "$epoch"
        return 0
      fi

      candidate=$((state_serial + 1))
      sid=S$candidate
      fresh=$state_dir/fresh_$sid
      cp -- "$raw" "$fresh" || return 1
      previous=${PREV_ID[$state_key]-}
      old_path=${PREV_PATH[$state_key]-}
      old_depth=${PREV_DEPTH[$state_key]-0}
      type=STATE_FULL
      payload=$fresh
      depth=0
      meta="state=$sid entity=$eid schema=$schema state_bytes=$n state_sha256=$sha codec=full"

      if [[ -n $previous && -f $old_path ]] && ((old_depth < 16)); then
        delta=$state_dir/delta_$sid
        rebuilt=$state_dir/rebuilt_$sid
        if build_verified_delta "$old_path" "$fresh" "$delta" "$rebuilt"; then
          bytes_file "$delta" || return 1
          payload_n=$REPLY
          if ((payload_n < n)); then
            type=STATE_DELTA
            payload=$delta
            depth=$((old_depth + 1))
            meta="state=$sid entity=$eid schema=$schema base=$previous prefix_lines=$DELTA_PREFIX suffix_lines=$DELTA_SUFFIX similarity=$DELTA_SIM state_bytes=$n state_sha256=$sha codec=prefix-suffix-v1"
          fi
        fi
      fi

      payload_n=$(wc -c <"$payload")
      encoded=$state_dir/encoded_$sid
      packed=$state_dir/packed_$sid
      if gzip -1 -n -c -- "$payload" >"$packed" &&
         base64 -w 0 "$packed" >"$encoded" &&
         bytes_file "$encoded" && ((REPLY < payload_n)); then
        payload=$encoded
        type=${type}_GZIP64
        meta+=" transport=gzip64 payload_raw_bytes=$payload_n"
      else
        rm -f -- "$encoded"
      fi
      rm -f -- "$packed"

      emit_record "$type" "$meta" file "$payload" || return
      state_serial=$candidate
      HASH_STATE[$hash_key]=$sid
      STATE_DEPTH[$sid]=$depth
      latest=$state_dir/latest_$eid
      cp -- "$fresh" "$latest.new" && mv -- "$latest.new" "$latest" || {
        reason=state_cache_error
        return 1
      }
      PREV_ID[$state_key]=$sid
      PREV_PATH[$state_key]=$latest
      PREV_DEPTH[$state_key]=$depth
      rm -f -- "$fresh" "${delta-}" "${rebuilt-}" "${encoded-}" 2>/dev/null
      add_occurrence "$sid" "$stamp" "$source" "$why" "$epoch"
    }

    reset_daily_storage() {
      if [[ -n ${state_dir-} && $state_dir == "$runtime/state_"* ]]; then
        rm -rf -- "$state_dir"
      fi
      HASH_STATE=()
      PREV_ID=()
      PREV_PATH=()
      PREV_DEPTH=()
      STATE_DEPTH=()
      ENTITY_ID=()
      ENTITY_DEFINED=()
      ENTITY_LABEL=()
      ENTITY_KIND=()
      ENTITY_PACKAGE=()
      OCC_COUNT=()
      OCC_TIMES=()
      OCC_SOURCES=()
      OCC_REASONS=()
      OCC_EPOCHS=()
      OCC_ORDER=()
      state_serial=0
      entity_serial=0
      top_serial=0
      last_top_key=
      last_top_id=
      last_hot_hash=
      state_dir=$runtime/state_$out_day
      mkdir -p -- "$state_dir" || {
        reason=state_dir_error
        return 1
      }
    }
    unique_open() {
      local stamp=$1 candidate attempt rc
      for ((attempt=0; attempt<64; attempt++)); do
        candidate=$out/${prefix}_${stamp}_${RANDOM}${RANDOM}.txt
        set -o noclobber
        { exec {ofd}>"$candidate"; } 2>/dev/null
        rc=$?
        set +o noclobber
        if ((rc == 0)); then
          file=$candidate
          return 0
        fi
        ofd=
      done
      return 1
    }
    open_day() {
      local day=$1 stamp=$2 config allow_out top_out
      out_day=$day
      record_seq=0
      day_bytes=0
      file_bytes=0
      unique_open "$stamp" || {
        reason=create_error
        return 1
      }
      reset_daily_storage || return
      capture_packages
      esc "$allow"
      allow_out=$REPLY
      top_out=${top_extra[*]-}
      config="version=6"$'\n'"created_from=$stamp"$'\n'"serial=$serial"$'\n'"adb_uid=$actual_uid"$'\n'"boot_id=$boot_id"$'\n'"remote_writes=none"$'\n'"top=every_$every period_$period rows_$rows delay_${delay:-native}"$'\n'"thresholds=${low_arg}/${high_arg} refresh=$refresh"$'\n'"observer_budget=$budget batch_cap=$batch_cap context=$context logcat=$logs packages=$packages"$'\n'"data_saver=$saver caps=$hour_cap/$day_cap/$total_cap delta_match=$delta_match checkpoint=$checkpoint_interval"
      config+=$'\n'"top_extra=${top_out:-none} surveillance=$surveillance allow_regex=$allow_out"
      config+=$'\n'"limits=duration_$duration until_$until reports_$max_reports bytes_$max_bytes source_timeout_$source_timeout require_uid_$require_uid"
      config+=$'\n''reason_bits=low:1 high:2 optional:4 context:8'
      emit_text CONFIG "day=$day" "$config" || return
      if ((packages)); then
        emit_record PACKAGE_INVENTORY "capture=daily rc=$package_rc" file "$package_file" ||
          return
      fi
      printf 'Writing %s\n' "$file"
    }
    checkpoint() {
      local why=${1-periodic} body active=0 key
      flush_occurrences || return
      compact_queue
      for key in "${Q_ORDER[@]}"; do
        [[ ${Q_ACTIVE[$key]-0} == 1 ]] && ((active++))
      done
      body="reason=$why"$'\n'"source=$source_n saved=$saved_n records=$record_seq"$'\n'"file_bytes=$file_bytes hour_bytes=$hour_bytes day_bytes=$day_bytes run_bytes=$run_bytes"$'\n'"queue=${#Q_ORDER[@]} worker=${worker_pid:-none} probe_epoch=$probe_epoch"
      body=${body/queue=${#Q_ORDER[@]}/queue=$active}
      emit_text CHECKPOINT "reason=$why" "$body"
      next_checkpoint=$((SECONDS + checkpoint_interval))
    }

    compact_queue() {
      local key
      local -a fresh=()
      local -A seen=()
      for key in "${Q_ORDER[@]}"; do
        [[ ${Q_ACTIVE[$key]-0} == 1 && -z ${seen[$key]-} ]] || continue
        fresh+=("$key")
        seen[$key]=1
      done
      Q_ORDER=("${fresh[@]}")
    }

    discard_queue() {
      local mode=$1 why=$2 qkey bits key eid tier retry_key body= count=0
      compact_queue
      for qkey in "${Q_ORDER[@]}"; do
        [[ ${Q_ACTIVE[$qkey]-0} == 1 ]] || continue
        bits=${Q_BITS[$qkey]-0}
        [[ $mode == all || $bits == 0 ]] || continue
        key=${Q_ENTITY[$qkey]-}
        if ((bits)) && [[ -n $key && -n $ofd ]]; then
          ensure_entity "$key" "${ENTITY_KIND[$key]-unknown}" \
            "${ENTITY_LABEL[$key]-$key}" "${ENTITY_PACKAGE[$key]--}" || return
          eid=$REPLY
          ((bits & 2)) && tier=H || tier=L
          body+="entity=$eid tier=$tier epoch=${Q_EPOCH[$qkey]--} source=${Q_LAST[$qkey]-0} pid=${Q_PID[$qkey]-0} cpu100=${Q_CPU[$qkey]-0} reason_bits=${Q_REASON[$qkey]-0}"$'\n'
          ((count++))
        fi
        if ((bits)) && [[ -n $key ]]; then
          retry_key=${Q_EPOCH[$qkey]-}$'\x1f'$key$'\x1f'$bits
          unset 'PROBE_RETRY[$retry_key]'
        fi
        unset 'Q_ENTITY[$qkey]' 'Q_EPOCH[$qkey]' 'Q_DEPTH[$qkey]' \
          'Q_BITS[$qkey]' 'Q_REASON[$qkey]' 'Q_LAST[$qkey]' \
          'Q_CPU[$qkey]' 'Q_PID[$qkey]' 'Q_PKG[$qkey]' \
          'Q_AFTER[$qkey]' 'Q_ACTIVE[$qkey]'
      done
      compact_queue
      ((count == 0)) ||
        emit_text PROBE_DROPPED "reason=$why count=$count" "$body"
    }

    queue_probe() {
      local entity=$1 depth=$2 bits=$3 why=$4 source=$5 cpu=$6 pid=$7
      local pkg=${8--} epoch=${9-$probe_epoch} tier qkey
      if ((bits & 2)); then tier=H
      elif ((bits & 1)); then tier=L
      else tier=O
      fi
      qkey=$entity$'\x1e'$epoch$'\x1e'$tier
      QUEUE_KEY=$qkey
      if ((bits == 0)) && (( ${INFLIGHT[$entity]-0} )); then
        return 0
      fi
      Q_ENTITY[$qkey]=$entity
      Q_EPOCH[$qkey]=$epoch
      if ((depth > ${Q_DEPTH[$qkey]-0})); then Q_DEPTH[$qkey]=$depth; fi
      Q_BITS[$qkey]=$(( ${Q_BITS[$qkey]-0} | bits ))
      Q_REASON[$qkey]=$(( ${Q_REASON[$qkey]-0} | why ))
      Q_LAST[$qkey]=$source
      if ((cpu > ${Q_CPU[$qkey]:--1})); then
        Q_CPU[$qkey]=$cpu
        Q_PID[$qkey]=$pid
        Q_PKG[$qkey]=$pkg
      fi
      if [[ ${Q_ACTIVE[$qkey]-0} == 0 ]]; then
        Q_ORDER+=("$qkey")
        Q_ACTIVE[$qkey]=1
      fi
    }

    read -r -d '' REMOTE_TARGET <<'P6_TARGET'
guard_uid=$1
p=$2
depth=$3
pkg=$4
nonce=$5

if [ "$guard_uid" != any ] && [ "$(id -u)" != "$guard_uid" ]; then
  printf '@@P6_TERMINAL:%s:UID_GUARD\n' "$nonce"
  exit 46
fi
if [ ! -r "/proc/$p/stat" ] || [ ! -r "/proc/$p/status" ]; then
  printf '@@P6_TERMINAL:%s:PID_GONE\n' "$nonce"
  exit 44
fi
if [ "$pkg" != - ]; then
  actual=$(tr '\000' '\n' <"/proc/$p/cmdline" 2>/dev/null | head -n 1)
  case "$actual" in
    "$pkg"|"$pkg":*) ;;
    *)
      printf '@@P6_TERMINAL:%s:PID_CHANGED\n' "$nonce"
      exit 47
      ;;
  esac
fi
s1=$(cat "/proc/$p/stat" 2>/dev/null) || {
  printf '@@P6_TERMINAL:%s:STAT_DENIED\n' "$nonce"
  exit 45
}
tail1=${s1##*) }
set -- $tail1
[ "$#" -ge 20 ] || {
  printf '@@P6_TERMINAL:%s:STAT_MALFORMED\n' "$nonce"
  exit 45
}
start1=${20}
printf '%s\n' '--- IDENTITY'
printf 'pid=%s start_ticks=%s package=%s\n' "$p" "$start1" "$pkg"
printf '%s\n' '--- PROC_STAT'
printf '%s\n' "$s1"
printf '%s\n' '--- PROC_STATUS'
cat "/proc/$p/status" 2>&1
for f in schedstat cgroup io; do
  printf '%s\n' "--- PROC_$f"
  head -c 65536 "/proc/$p/$f" 2>&1
  printf '\n'
done
printf '%s\n' '--- THREADS projection=head-c-262144'
ps -T -p "$p" -o PID,TID,UID,PR,NI,S,%CPU,%MEM,NAME 2>&1 | head -c 262144
printf '\n'

if [ "$pkg" != - ]; then
  printf '%s\n' '--- PACKAGE projection=head-c-524288'
  dumpsys package "$pkg" 2>&1 | head -c 524288
  printf '\n--- APPOPS projection=head-c-196608\n'
  cmd appops get --user current "$pkg" 2>&1 | head -c 196608
  printf '\n--- UID_STATE\n'
  uid=$(awk '/^Uid:/{print $2; exit}' "/proc/$p/status" 2>/dev/null)
  cmd activity get-uid-state "$uid" 2>&1
  printf '%s\n' '--- JOBS package-scoped-projection'
  dumpsys jobscheduler "$pkg" 2>&1 | head -c 262144
  printf '\n--- SERVICES package-scoped-projection\n'
  dumpsys activity services "$pkg" 2>&1 | head -c 196608
  printf '\n--- PROVIDERS package-scoped-projection\n'
  dumpsys activity providers "$pkg" 2>&1 | head -c 196608
  printf '\n--- ALARMS package-match-projection\n'
  dumpsys alarm 2>&1 | grep -F -B 2 -A 12 "$pkg" | head -c 196608
  printf '\n--- NOTIFICATIONS package-match-projection\n'
  dumpsys notification 2>&1 | grep -F -B 2 -A 12 "$pkg" | head -c 196608
  printf '\n--- BATTERYSTATS package-projection\n'
  dumpsys batterystats "$pkg" 2>&1 | head -c 262144
  printf '\n'
fi

if [ "$depth" -ge 2 ]; then
  for f in smaps_rollup limits wchan oom_score oom_score_adj; do
    printf '%s\n' "--- PROC_$f"
    head -c 393216 "/proc/$p/$f" 2>&1
    printf '\n'
  done
  printf '%s\n' '--- MEMINFO'
  dumpsys meminfo "$p" 2>&1 | head -c 524288
  printf '\n--- CPUINFO process-match-projection\n'
  dumpsys cpuinfo 2>&1 | grep -F -B 2 -A 6 "$p" | head -c 196608
  printf '\n--- SYSTEM_MEMINFO\n'
  head -c 196608 /proc/meminfo 2>&1
  printf '\n'
fi

s2=$(cat "/proc/$p/stat" 2>/dev/null) || {
  printf '@@P6_TERMINAL:%s:PID_CHANGED\n' "$nonce"
  exit 47
}
tail2=${s2##*) }
set -- $tail2
[ "$#" -ge 20 ] || {
  printf '@@P6_TERMINAL:%s:PID_CHANGED\n' "$nonce"
  exit 47
}
[ "${20}" = "$start1" ] || {
  printf '@@P6_TERMINAL:%s:PID_CHANGED\n' "$nonce"
  exit 47
}
printf '@@P6_OK:%s:%s:%s\n' "$nonce" "$p" "$start1"
P6_TARGET

    read -r -d '' REMOTE_CONTEXT <<'P6_CONTEXT'
guard_uid=$1
with_logs=$2
nonce=$3
if [ "$guard_uid" != any ] && [ "$(id -u)" != "$guard_uid" ]; then
  printf '@@P6_CONTEXT_FAIL:%s:UID_GUARD\n' "$nonce"
  exit 46
fi
printf '%s\n' '--- BATTERY'
dumpsys battery 2>&1 | head -c 65536
printf '\n--- POWER_SUPPLY\n'
for d in /sys/class/power_supply/*; do
  [ -d "$d" ] || continue
  for f in type online status health capacity current_now current_avg voltage_now power_now charge_counter temp cycle_count; do
    [ -r "$d/$f" ] || continue
    printf '%s=' "$d/$f"
    cat "$d/$f" 2>&1
  done
done
printf '%s\n' '--- THERMAL'
dumpsys thermalservice 2>&1 | head -c 196608
printf '\n--- POWER_SCREEN_WAKELOCK\n'
dumpsys power 2>&1 | grep -i -E 'Wakefulness=|mWakefulness=|mScreenOn=|Display Power|Wake Locks|PARTIAL_WAKE_LOCK|FULL_WAKE_LOCK' | head -c 131072
printf '\n--- DISPLAY\n'
dumpsys display 2>&1 | grep -i -E 'mGlobalDisplayState|Display Power State|mScreenState|state=|mBrightness' | head -c 131072
printf '\n--- FOCUS_VISIBLE\n'
dumpsys activity activities 2>&1 | grep -i -E 'mResumedActivity|topResumedActivity|ResumedActivity|mFocusedApp|visible=true|state=RESUMED' | head -c 196608
printf '\n--- WINDOW_FOCUS\n'
dumpsys window windows 2>&1 | grep -i -E 'mCurrentFocus|mFocusedApp|mTopFocusedDisplayId' | head -c 65536
printf '\n--- CALL_TELECOM\n'
dumpsys telecom 2>&1 | grep -i -E 'CallAudio|mIsInCall|isInCall|foregroundCall|state=|AudioRoute' | head -c 131072
printf '\n--- AUDIO\n'
dumpsys audio 2>&1 | grep -i -E 'mode:|MODE_IN_CALL|MODE_IN_COMMUNICATION|active|AudioFocus' | head -c 131072
printf '\n--- MEMORY\n'
head -c 196608 /proc/meminfo 2>&1
for f in cpu memory io; do
  printf '\n--- PSI_%s\n' "$f"
  cat "/proc/pressure/$f" 2>&1
done
printf '\n--- NETWORK\n'
cat /proc/net/dev 2>&1
dumpsys connectivity 2>&1 | grep -i -E 'Default network|VALIDATED|CAPTIVE_PORTAL|NetworkAgentInfo|Keepalive' | head -c 196608
printf '\n'
if [ "$with_logs" = 1 ]; then
  printf '%s\n' 'logcatinfostart'
  logcat -b all -d -t 256 -v threadtime 2>&1 | head -c 524288
  printf '\n%s\n' 'logcatinfoend'
fi
printf '@@P6_CONTEXT_OK:%s\n' "$nonce"
P6_CONTEXT

    worker_capture() {
      local script=$1 out_file=$2 cap=$3 ok_marker=$4 terminal_marker=$5
      local tmp rc n quality last
      tmp=$out_file.capture
      timeout -k 2s "${diag_timeout}s" "${A[@]}" shell -T sh -s \
        <"$script" >"$tmp" 2>&1 &
      remote_child=$!
      wait "$remote_child"
      rc=$?
      remote_child=
      if bytes_file "$tmp"; then n=$REPLY; else n=0; fi
      last=$(tail -n 1 "$tmp")
      case $last in
        "$ok_marker"*) quality=complete ;;
        "$terminal_marker"*) quality=terminal ;;
        *) quality=incomplete ;;
      esac
      if ((n > cap)); then
        head -c "$cap" "$tmp" >"$out_file"
        quality=${quality}_truncated
        rm -f -- "$tmp"
      else
        mv -- "$tmp" "$out_file"
      fi
      printf '%s\t%s\n' "$rc" "$quality" >"$out_file.meta"
    }

    worker_collect() {
      local stage=$1 manifest=$2 idx pid depth pkg nonce script marker
      local remote_child= rc quality
      trap '[[ -z ${remote_child-} ]] || { kill "$remote_child" 2>/dev/null; wait "$remote_child" 2>/dev/null; }; exit 143' HUP INT TERM
      : >"$stage/results"
      while IFS=$'\t' read -r idx pid depth pkg; do
        if posint "$pid" && [[ $depth =~ ^[12]$ ]] &&
           { [[ $pkg == - ]] || valid_pkg "$pkg"; }; then
          nonce="${BASHPID}_${RANDOM}_${idx}"
          script=$stage/request_$idx.sh
          {
            printf "set -- '%s' '%s' '%s' '%s' '%s'\n" \
              "$require_uid" "$pid" "$depth" "$pkg" "$nonce"
            printf '%s\n' "$REMOTE_TARGET"
          } >"$script"
          marker="@@P6_OK:$nonce:"
          worker_capture "$script" "$stage/target_$idx.raw" "$probe_cap" \
            "$marker" "@@P6_TERMINAL:$nonce:"
          read -r rc quality <"$stage/target_$idx.raw.meta"
          printf '%s\t%s\t%s\n' "$idx" "$rc" "$quality" >>"$stage/results"
        else
          : >"$stage/target_$idx.raw"
          printf '%s\t%s\n' 64 terminal >"$stage/target_$idx.raw.meta"
          printf '%s\t%s\t%s\n' "$idx" 64 terminal >>"$stage/results"
        fi
      done <"$manifest"
      if [[ -n $worker_context_epoch ]]; then
        nonce="${BASHPID}_${RANDOM}_context"
        script=$stage/context.sh
        {
          printf "set -- '%s' '%s' '%s'\n" "$require_uid" "$logs" "$nonce"
          printf '%s\n' "$REMOTE_CONTEXT"
        } >"$script"
        worker_capture "$script" "$stage/context.raw" "$context_cap" \
          "@@P6_CONTEXT_OK:$nonce" "@@P6_CONTEXT_FAIL:$nonce"
      fi
    }

    launch_worker() {
      local pass qkey key bits idx selected=0 mandatory=0 manifest token fkey
      [[ -z $worker_pid ]] || return 0
      compact_queue
      ((batch_serial++))
      worker_stage=$runtime/batch_$batch_serial
      mkdir -p -- "$worker_stage" || {
        reason=worker_stage_error
        return 1
      }
      manifest=$worker_stage/requests.tsv
      : >"$manifest"
      for pass in 2 1 0; do
        for qkey in "${Q_ORDER[@]}"; do
          [[ ${Q_ACTIVE[$qkey]-0} == 1 ]] || continue
          bits=${Q_BITS[$qkey]-0}
          key=${Q_ENTITY[$qkey]-}
          [[ -n $key ]] || continue
          case $pass in
            2) ((bits & 2)) || continue ;;
            1) ((bits && (bits & 2) == 0)) || continue ;;
            0) ((bits == 0)) || continue ;;
          esac
          if (( ${Q_AFTER[$qkey]-0} > SECONDS )); then
            continue
          fi
          if ((pass == 0)) &&
             { ! saver_open || ((SECONDS < gate_until)); }; then
            unset 'Q_ENTITY[$qkey]' 'Q_EPOCH[$qkey]' 'Q_DEPTH[$qkey]' \
              'Q_BITS[$qkey]' 'Q_REASON[$qkey]' 'Q_LAST[$qkey]' \
              'Q_CPU[$qkey]' 'Q_PID[$qkey]' 'Q_PKG[$qkey]' \
              'Q_AFTER[$qkey]' 'Q_ACTIVE[$qkey]'
            continue
          fi
          ((selected < batch_cap)) || break 2
          ((selected++))
          idx=$selected
          printf '%s\t%s\t%s\t%s\n' "$idx" "${Q_PID[$qkey]}" \
            "${Q_DEPTH[$qkey]}" "${Q_PKG[$qkey]:--}" >>"$manifest"
          token=$batch_serial:$idx
          B_KEY[$token]=$key
          B_BITS[$token]=$bits
          B_EPOCH[$token]=${Q_EPOCH[$qkey]}
          B_SOURCE[$token]=${Q_LAST[$qkey]}
          B_REASON[$token]=${Q_REASON[$qkey]-0}
          B_PID[$token]=${Q_PID[$qkey]}
          B_DEPTH[$token]=${Q_DEPTH[$qkey]}
          B_PKG[$token]=${Q_PKG[$qkey]:--}
          B_CPU[$token]=${Q_CPU[$qkey]:-0}
          ((bits)) && mandatory=1
          INFLIGHT[$key]=$(( ${INFLIGHT[$key]-0} + 1 ))
          fkey=$key$'\x1f'${Q_EPOCH[$qkey]}
          FLIGHT_BITS[$fkey]=$(( ${FLIGHT_BITS[$fkey]-0} | bits ))
          unset 'Q_ENTITY[$qkey]' 'Q_EPOCH[$qkey]' 'Q_DEPTH[$qkey]' \
            'Q_BITS[$qkey]' 'Q_REASON[$qkey]' 'Q_LAST[$qkey]' \
            'Q_CPU[$qkey]' 'Q_PID[$qkey]' 'Q_PKG[$qkey]' \
            'Q_AFTER[$qkey]' 'Q_ACTIVE[$qkey]'
        done
      done
      compact_queue
      if ((selected == 0)); then
        rmdir -- "$worker_stage" 2>/dev/null
        worker_stage=
        return 0
      fi
      worker_count=$selected
      worker_started=$SECONDS
      worker_context_epoch=
      if ((context)) &&
         { ((logs || mandatory)) ||
           [[ $context_epoch_done != "$probe_epoch" ]]; }; then
        worker_context_epoch=$probe_epoch
      fi
      (
        trap 'x=$?; trap - EXIT; printf "%s\n" "$x" >"$worker_stage/exit.part"; mv -- "$worker_stage/exit.part" "$worker_stage/READY"; exit "$x"' EXIT
        worker_collect "$worker_stage" "$manifest"
      ) &
      worker_pid=$!
      worker_reaped=0
    }

    requeue_snapshot() {
      local batch=$1 idx token key bits fkey mask
      for ((idx=1; idx<=worker_count; idx++)); do
        token=$batch:$idx
        key=${B_KEY[$token]-}
        [[ -n $key ]] || continue
        bits=${B_BITS[$token]-0}
        if ((bits)); then
          queue_probe "$key" "${B_DEPTH[$token]:-$((bits & 2 ? 2 : 1))}" "$bits" \
            "${B_REASON[$token]-0}" "${B_SOURCE[$token]-0}" \
            "${B_CPU[$token]-0}" "${B_PID[$token]:-1}" "${B_PKG[$token]:--}" \
            "${B_EPOCH[$token]-$probe_epoch}"
        fi
        if (( ${INFLIGHT[$key]-0} > 1 )); then
          INFLIGHT[$key]=$((INFLIGHT[$key] - 1))
        else
          unset 'INFLIGHT[$key]'
        fi
        fkey=$key$'\x1f'${B_EPOCH[$token]-}
        mask=$(( ${FLIGHT_BITS[$fkey]-0} & ~bits ))
        if ((mask)); then FLIGHT_BITS[$fkey]=$mask
        else unset 'FLIGHT_BITS[$fkey]'
        fi
        unset 'B_KEY[$token]' 'B_BITS[$token]' 'B_EPOCH[$token]' \
          'B_SOURCE[$token]' 'B_REASON[$token]' 'B_PID[$token]' \
          'B_DEPTH[$token]' 'B_PKG[$token]' 'B_CPU[$token]'
      done
      compact_queue
    }

    stop_owned() {
      local pid=$1 i state= rc=127
      if [[ $pid =~ ^[1-9][0-9]*$ ]]; then
        kill "$pid" 2>/dev/null
        for ((i=0; i<20; i++)); do
          kill -0 "$pid" 2>/dev/null || break
          if [[ -r /proc/$pid/stat ]]; then
            read -r _ _ state _ </proc/"$pid"/stat
            [[ $state == Z ]] && break
          fi
          sleep 0.1
        done
        kill -0 "$pid" 2>/dev/null && [[ $state != Z ]] &&
          kill -9 "$pid" 2>/dev/null
        wait "$pid" 2>/dev/null
        rc=$?
      fi
      REPLY=$rc
    }

    requeue_finished_worker() {
      local batch=$batch_serial
      requeue_snapshot "$batch"
      [[ -n $worker_stage && $worker_stage == "$runtime/"* ]] &&
        rm -rf -- "$worker_stage"
      worker_pid=
      worker_reaped=0
      worker_stage=
      worker_count=0
    }

    cancel_worker() {
      [[ -n $worker_pid ]] || return 0
      if ((worker_reaped == 0)); then
        stop_owned "$worker_pid"
        worker_reaped=1
      fi
      requeue_finished_worker
    }

    reap_worker() {
      local batch=$batch_serial idx token key bits req_epoch source why rc quality
      local raw canon terminal=0 elapsed quiet ctx_rc ctx_quality rkey attempts
      local fkey mask tier
      [[ -n $worker_pid && -f $worker_stage/READY ]] || return 0
      if ((worker_reaped == 0)); then
        wait "$worker_pid"
        worker_reaped=1
      fi
      worker_pid=
      elapsed=$((SECONDS - worker_started))
      ((elapsed >= 1)) || elapsed=1
      quiet=$(( (elapsed * (100 - budget) + budget - 1) / budget ))
      gate_until=$((SECONDS + quiet))
      for ((idx=1; idx<=worker_count; idx++)); do
        token=$batch:$idx
        key=${B_KEY[$token]-}
        [[ -n $key ]] || continue
        bits=${B_BITS[$token]-0}
        req_epoch=${B_EPOCH[$token]-}
        source=${B_SOURCE[$token]-0}
        why=${B_REASON[$token]-0}
        raw=$worker_stage/target_$idx.raw
        if [[ -f $raw.meta ]]; then
          read -r rc quality <"$raw.meta"
        else
          rc=125
          quality=incomplete
          : >"$raw"
        fi
        canon=$worker_stage/target_$idx.canon
        {
          printf 'transport_rc=%s quality=%s\n' "$rc" "$quality"
          awk '$0 !~ /^@@P6_(OK|TERMINAL):/' "$raw"
        } >"$canon" || {
          reason=state_stage_error
          return 1
        }
        store_state "$key" "target_v1_$quality" "$canon" \
          "$(date '+%H:%M:%S')" "$source" "$why" "$req_epoch" || return
        rkey=
        ((bits)) && rkey=$req_epoch$'\x1f'$key$'\x1f'$bits
        terminal=0
        case $quality in complete*|terminal*) terminal=1 ;; esac
        if ((terminal)); then
          [[ -z $rkey ]] || unset 'PROBE_RETRY[$rkey]'
          if [[ $rc != 44 && $rc != 47 &&
                $req_epoch == "$probe_epoch" ]]; then
            PROBED[$key]=$(( ${PROBED[$key]-0} | bits ))
          fi
        elif ((bits)) && [[ $rc != 44 && $rc != 47 ]]; then
          attempts=${PROBE_RETRY[$rkey]-0}
          if ((attempts < 1)); then
            PROBE_RETRY[$rkey]=$((attempts + 1))
            queue_probe "$key" "${B_DEPTH[$token]:-$((bits & 2 ? 2 : 1))}" \
              "$bits" "$why" "$source" "${B_CPU[$token]-0}" \
              "${B_PID[$token]:-1}" "${B_PKG[$token]:--}" "$req_epoch"
            Q_AFTER[$QUEUE_KEY]=$gate_until
          else
            unset 'PROBE_RETRY[$rkey]'
            ((bits & 2)) && tier=H || tier=L
            emit_text PROBE_EXHAUSTED \
              "entity=${ENTITY_ID[$key]} tier=$tier epoch=$req_epoch" \
              "source=$source rc=$rc quality=$quality reason_bits=$why attempts=2" ||
              return
            if [[ $req_epoch == "$probe_epoch" ]]; then
              PROBED[$key]=$(( ${PROBED[$key]-0} | bits ))
            fi
          fi
        elif ((bits)); then
          unset 'PROBE_RETRY[$rkey]'
        fi
        if (( ${INFLIGHT[$key]-0} > 1 )); then
          INFLIGHT[$key]=$((INFLIGHT[$key] - 1))
        else
          unset 'INFLIGHT[$key]'
        fi
        fkey=$key$'\x1f'$req_epoch
        mask=$(( ${FLIGHT_BITS[$fkey]-0} & ~bits ))
        if ((mask)); then FLIGHT_BITS[$fkey]=$mask
        else unset 'FLIGHT_BITS[$fkey]'
        fi
        unset 'B_KEY[$token]' 'B_BITS[$token]' \
          'B_EPOCH[$token]' \
          'B_SOURCE[$token]' 'B_REASON[$token]' 'B_PID[$token]' \
          'B_DEPTH[$token]' 'B_PKG[$token]' 'B_CPU[$token]'
      done

      if ((context)) && [[ -f $worker_stage/context.raw ]]; then
        read -r ctx_rc ctx_quality <"$worker_stage/context.raw.meta"
        canon=$worker_stage/context.canon
        {
          printf 'transport_rc=%s quality=%s\n' "$ctx_rc" "$ctx_quality"
          awk '$0 !~ /^@@P6_(CONTEXT_OK|CONTEXT_FAIL):/' "$worker_stage/context.raw"
        } >"$canon" || {
          reason=context_stage_error
          return 1
        }
        key='s:device_context'
        ensure_entity "$key" system device_context - || return
        store_state "$key" "context_v1_$ctx_quality" "$canon" \
          "$(date '+%H:%M:%S')" "$source_n" 8 "$worker_context_epoch" || return
        case $ctx_quality in
          complete*|terminal*)
            context_epoch_done=$worker_context_epoch
            context_retry_count=0
            ;;
          *)
            if [[ $context_retry_epoch == "$worker_context_epoch" ]]; then
              ((context_retry_count++))
            else
              context_retry_epoch=$worker_context_epoch
              context_retry_count=1
            fi
            ((context_retry_count < 2)) ||
              context_epoch_done=$worker_context_epoch
            ;;
        esac
        fg_package=$(awk '
          /^--- FOCUS_VISIBLE/ { focus=1; next }
          /^--- / && focus { exit }
          focus && match($0,/[A-Za-z0-9_]+([.][A-Za-z0-9_]+)+[/]/) {
            x=substr($0,RSTART,RLENGTH-1); print x; exit
          }
        ' "$canon")
      fi

      [[ -n $worker_stage && $worker_stage == "$runtime/"* ]] &&
        rm -rf -- "$worker_stage"
      worker_pid=
      worker_reaped=0
      worker_stage=
      worker_count=0
      worker_context_epoch=
      compact_queue
      return 0
    }

    close_output() {
      local why=${1-day_end} rc=0
      [[ -n $ofd ]] || return 0
      if [[ $reason != write_error && $reason != max_bytes ]]; then
        flush_occurrences || rc=$?
        if ((rc == 0)); then
          emit_text DAY_END "reason=$why" \
            "day=$out_day records=$record_seq source=$source_n saved=$saved_n file_bytes=$file_bytes" ||
            rc=$?
        fi
      fi
      [[ -n $ofd ]] && exec {ofd}>&-
      ofd=
      return "$rc"
    }

    advance_epochs() {
      local day=$1 hour=$2 stamp=$3 new_day=0
      if [[ $out_day == "$day" && -n $ofd ]]; then
        :
      else
        if [[ -n $ofd ]]; then
          if [[ -n $worker_pid ]]; then
            if [[ -f $worker_stage/READY ]]; then
              reap_worker || return
            else
              cancel_worker || return
            fi
          fi
          discard_queue all day_rotate || return
          if [[ -n $run_hour ]]; then
            flush_occurrences || return
            emit_text HOUR_END "hour=$run_hour" \
              "hour=$run_hour bytes=$hour_bytes source=$source_n saved=$saved_n" ||
              return
          fi
          close_output day_rotate || return
        fi
        case $refresh in
          hourly|daily)
            PROBED=()
            PROBE_RETRY=()
            fg_package=
            ;;
        esac
        hour_bytes=0
        open_day "$day" "$stamp" || return
        run_hour=
        new_day=1
      fi
      if [[ $run_hour == "$hour" ]]; then
        :
      else
        if [[ -n $run_hour ]]; then
          discard_queue optional hour_rotate || return
          flush_occurrences || return
          emit_text HOUR_END "hour=$run_hour" \
            "hour=$run_hour bytes=$hour_bytes source=$source_n saved=$saved_n" ||
            return
        fi
        run_hour=$hour
        ((new_day)) || hour_bytes=0
        case $refresh in
          hourly)
            PROBED=()
            fg_package=
            probe_epoch=$hour
            ;;
          daily) probe_epoch=$day ;;
          off) ;;
        esac
      fi
    }

    normalize_thresholds() {
      local maximum=$topmax
      ((maximum >= 100)) || maximum=100
      if dec "$low_arg" && ((REPLY <= maximum)); then
        low=$REPLY
      else
        low=10
      fi
      if dec "$high_arg" && ((REPLY <= maximum)); then
        high=$REPLY
      else
        high=90
      fi
      if ((low > high)); then low=10; high=90; fi
      low100=$((low * 100))
      high100=$((high * 100))
      thresholds_ready=1
    }

    resolve_target() {
      local user=$1 args=$2 base pkg=
      if [[ -n ${PKG_UID[$args]+x} ]]; then
        pkg=$args
      else
        base=${args%%:*}
        [[ -n ${PKG_UID[$base]+x} ]] && pkg=$base
      fi
      if [[ -n $pkg ]]; then
        TARGET_KEY=p:$pkg
        TARGET_KIND=package
        TARGET_LABEL=$pkg
        TARGET_PKG=$pkg
      elif [[ $args == \[*\] ]]; then
        TARGET_KEY=k:$args
        TARGET_KIND=kernel
        TARGET_LABEL=$args
        TARGET_PKG=-
      else
        TARGET_KEY=n:$user:$args
        TARGET_KIND=process
        TARGET_LABEL=$user:$args
        TARGET_PKG=-
      fi
    }

    save_top_payload() {
      local raw=$1 partial=$2 parse_quality=$3 raw_n raw_h gz b64 type payload save_rc
      local top_key top_id candidate
      bytes_file "$raw" || return 1
      raw_n=$REPLY
      sha_file "$raw" || return 1
      raw_h=$REPLY
      top_key=$raw_n:$raw_h
      if [[ $top_key == "$last_top_key" ]]; then
        emit_text TOP_REF \
          "source=$source_n captured=$frame_iso partial=$partial parse=$parse_quality top=$last_top_id raw_bytes=$raw_n raw_sha256=$raw_h" ""
        return $?
      fi
      candidate=$((top_serial + 1))
      top_id=T$candidate
      gz=$runtime/top_$source_n.gz
      b64=$runtime/top_$source_n.b64
      if gzip -1 -n -c -- "$raw" >"$gz" &&
         base64 -w 0 "$gz" >"$b64" &&
         bytes_file "$b64" && ((REPLY < raw_n)); then
        type=TOP_GZIP64
        payload=$b64
      else
        type=TOP_RAW
        payload=$raw
      fi
      emit_record "$type" \
        "source=$source_n captured=$frame_iso partial=$partial parse=$parse_quality top=$top_id raw_bytes=$raw_n raw_sha256=$raw_h" \
        file "$payload"
      save_rc=$?
      rm -f -- "$gz" "$b64"
      if ((save_rc == 0)); then
        top_serial=$candidate
        last_top_key=$top_key
        last_top_id=$top_id
      fi
      return "$save_rc"
    }

    finish_frame() {
      local partial=${1-0} raw line pid user pr ni virt res shr state cpu mem timep args
      local saw_header=0 row_count=0 bad_rows=0 cpu100 key pkg hot=0 keep=0
      local crossed due explained body= parse_quality=complete hot_hash fkey
      local -a ORDER=()
      local -A CPU=() HOTCPU=() HOTPID=() KIND=() LABEL=() PKG=()
      [[ -n $report ]] || return 0
      advance_epochs "$frame_day" "$frame_hour" "$frame_stamp" || return
      raw=$runtime/top_$source_n.raw
      printf '%s\n' "$report" >"$raw" || {
        reason=top_stage_error
        return 1
      }

      while IFS= read -r line; do
        if ((topmax == 0)) &&
           [[ $line =~ ^[[:space:]]*([0-9]+)%cpu ]]; then
          if dec "${BASH_REMATCH[1]}" && ((REPLY <= 1000000)); then
            topmax=$REPLY
          fi
        fi
        if [[ $line =~ ^[[:space:]]*PID[[:space:]]+USER[[:space:]]+ ]]; then
          saw_header=1
          continue
        fi
        ((saw_header)) || continue
        [[ -n $line ]] || continue
        read -r pid user pr ni virt res shr state cpu mem timep args <<<"$line"
        if posint "$pid" && [[ $user =~ ^[^[:space:]]+$ ]] &&
           pct100 "$cpu" && [[ -n $args ]]; then
          cpu100=$REPLY
          ((row_count++))
          [[ -n $remote_top_pid && $pid == "$remote_top_pid" ]] && continue
          if [[ -n $worker_pid ]]; then
            case $args in
              sh|sh\ *|*/sh|*/sh\ *|dumpsys*|*/dumpsys*|\
              grep*|*/grep*|head*|*/head*|cat*|*/cat*|ps*|*/ps*|\
              cmd*|*/cmd*|logcat*|*/logcat*|awk*|*/awk*|\
              tr|tr\ *|*/tr|*/tr\ *)
                continue
                ;;
            esac
          fi
          resolve_target "$user" "$args"
          key=$TARGET_KEY
          if [[ -z ${CPU[$key]+x} ]]; then
            ORDER+=("$key")
            CPU[$key]=0
            HOTCPU[$key]=-1
            KIND[$key]=$TARGET_KIND
            LABEL[$key]=$TARGET_LABEL
            PKG[$key]=$TARGET_PKG
          fi
          CPU[$key]=$((CPU[$key] + cpu100))
          if ((cpu100 > HOTCPU[$key])); then
            HOTCPU[$key]=$cpu100
            HOTPID[$key]=$pid
          fi
        else
          ((bad_rows++))
        fi
      done <<<"$report"
      ((thresholds_ready)) || normalize_thresholds
      ((saw_header && row_count)) || parse_quality=raw_only
      ((bad_rows == 0)) || parse_quality=partial_$bad_rows

      for key in "${ORDER[@]}"; do
        ((CPU[$key] >= low100)) && hot=1
      done
      if ((partial)); then
        keep=1
      elif (((source_n - 1) % every == 0)); then
        keep=1
      fi
      if ((period && last_saved_epoch &&
            frame_epoch - last_saved_epoch < period && hot == 0 && partial == 0)); then
        keep=0
      fi
      ((hot)) && keep=1
      if ((keep)); then
        save_top_payload "$raw" "$partial" "$parse_quality" || return
        ((saved_n++))
        last_saved_epoch=$frame_epoch
      fi

      if ((partial == 0 && saw_header && row_count)); then
        for key in "${ORDER[@]}"; do
          ensure_entity "$key" "${KIND[$key]}" "${LABEL[$key]}" "${PKG[$key]}" ||
            return
          crossed=0
          ((CPU[$key] >= low100)) && crossed=$((crossed | 1))
          ((CPU[$key] >= high100)) && crossed=$((crossed | 2))
          due=$((crossed & ~${PROBED[$key]-0} & 3))
          fkey=$key$'\x1f'$probe_epoch
          due=$((due & ~${FLIGHT_BITS[$fkey]-0}))
          if ((due & 1)); then
            queue_probe "$key" 1 1 1 "$source_n" "${CPU[$key]}" \
              "${HOTPID[$key]}" "${PKG[$key]}"
          fi
          if ((due & 2)); then
            queue_probe "$key" 2 2 3 "$source_n" "${CPU[$key]}" \
              "${HOTPID[$key]}" "${PKG[$key]}"
          fi
          if ((CPU[$key] >= low100)); then
            body+="entity=${ENTITY_ID[$key]} cpu=$((CPU[$key]/100)).$((CPU[$key]%100)) pid=${HOTPID[$key]} crossed=$crossed due=$due"$'\n'
            if ((surveillance)) && saver_open && ((SECONDS >= gate_until)); then
              explained=0
              [[ ${LABEL[$key]} =~ $allow ]] && explained=1
              [[ -n $fg_package && ${PKG[$key]} == "$fg_package" ]] && explained=1
              ((context)) && [[ $context_epoch_done != "$probe_epoch" ]] &&
                explained=1
              if ((explained == 0)); then
                queue_probe "$key" 2 0 4 "$source_n" "${CPU[$key]}" \
                  "${HOTPID[$key]}" "${PKG[$key]}"
              fi
            fi
          fi
        done
        if [[ -n $body ]]; then
          sha_text "$body" || return
          hot_hash=$REPLY
          if [[ $hot_hash == "$last_hot_hash" ]]; then
            :
          else
            emit_text HOT_INDEX "source=$source_n low=$low high=$high" "$body" ||
              return
            last_hot_hash=$hot_hash
          fi
        else
          last_hot_hash=
        fi
      fi

      rm -f -- "$raw"
      report=
      if [[ $reason == running ]]; then
        if ((max_reports && saved_n >= max_reports)); then reason=max_reports; fi
      fi
    }

    check_limits() {
      local now
      [[ $reason == running ]] || return
      if ((duration && SECONDS - run_start_seconds >= duration)); then
        reason=duration
        return
      fi
      if ((until)); then
        now=$(date +%s)
        ((now < until)) || {
          reason=until
          return
        }
      fi
      if ((max_bytes && run_bytes >= max_bytes)); then reason=max_bytes; fi
    }
    fail_as() {
      [[ $reason != running ]] || reason=$1
      return 1
    }

    start_top() {
      local top_script arg
      ((source_attempt++))
      top_script=$runtime/top_request.sh
      {
        printf "guard='%s'\n" "$require_uid"
        printf '%s\n' \
          'if [ "$guard" != any ] && [ "$(id -u)" != "$guard" ]; then' \
          '  printf "P6_TOP_UID_GUARD actual=%s required=%s\n" "$(id -u)" "$guard"' \
          '  exit 46' \
          'fi' \
          'printf "P6_TOP_PID=%s\n" "$$"'
        printf "exec nice -n 10 top -b -m '%s' -o '%s'" "$rows" \
          'PID,USER,PR,NI,VIRT,RES,SHR,S,%CPU,%MEM,TIME+,ARGS:192'
        [[ -z $delay ]] || printf " -d '%s'" "$delay"
        for arg in "${top_extra[@]}"; do printf " '%s'" "$arg"; done
        printf '\n'
      } >"$top_script" || {
        reason=top_stage_error
        return 1
      }
      exec {top_fd}< <("${A[@]}" shell -T sh -s <"$top_script" 2>&1) || {
        reason=top_fd_error
        return 1
      }
      top_pid=$!
      remote_top_pid=
      healthy_frames=0
      source_noise=
    }

    stop_top() {
      local rc=127
      if [[ $top_fd =~ ^[0-9]+$ ]]; then
        exec {top_fd}<&-
        top_fd=
      fi
      if [[ $top_pid =~ ^[1-9][0-9]*$ ]]; then
        stop_owned "$top_pid"
        rc=$REPLY
      fi
      top_pid=
      TOP_RC=$rc
    }

    source_record() {
      local read_rc=$1 top_rc=$2 noise=
      IFS='|' read -r now_epoch now_stamp now_day now_hour now_iso \
        <<<"$(clock_snapshot)"
      advance_epochs "$now_day" "$now_hour" "$now_stamp" || return
      if [[ -n $source_noise ]]; then
        esc "$source_noise"
        noise=$'\n'"preframe=$REPLY"
      fi
      emit_text SOURCE_EVENT "attempt=$source_attempt" \
        "attempt=$source_attempt read_rc=$read_rc top_rc=$top_rc retry=$source_retry$noise"
    }

    on_signal() {
      [[ $reason == running ]] && reason=signal_$1
      [[ $top_pid =~ ^[1-9][0-9]*$ ]] && kill "$top_pid" 2>/dev/null
    }

    drain_final_worker() {
      local qkey active=0 cycles=0 limit
      case $reason in max_reports|duration|until) ;; *) return 0 ;; esac
      if [[ -n $worker_pid ]]; then
        if [[ -f $worker_stage/READY ]]; then
          reap_worker || return
        else
          cancel_worker || return
        fi
      fi
      discard_queue optional final_optional || return
      compact_queue
      for qkey in "${Q_ORDER[@]}"; do
        [[ ${Q_ACTIVE[$qkey]-0} == 1 && ${Q_BITS[$qkey]-0} != 0 ]] &&
          ((active++))
      done
      limit=$(( (2 * active + batch_cap - 1) / batch_cap + 2 ))
      while ((cycles < limit)); do
        active=0
        for qkey in "${Q_ORDER[@]}"; do
          [[ ${Q_ACTIVE[$qkey]-0} == 1 &&
             ${Q_BITS[$qkey]-0} != 0 ]] || continue
          Q_AFTER[$qkey]=0
          ((active++))
        done
        ((active)) || break
        launch_worker || return
        [[ -n $worker_pid ]] || break
        wait "$worker_pid" 2>/dev/null
        worker_reaped=1
        if [[ -f $worker_stage/READY ]]; then
          reap_worker || return
        else
          worker_pid=
          requeue_finished_worker || return
        fi
        ((cycles++))
      done
    }

    finalize_run() {
      local status=$1
      ((finalized == 0)) || return
      finalized=1
      trap - HUP INT TERM
      if ((frame_open)) && [[ $reason == running || $reason == signal_* ||
                              $reason == duration || $reason == until ||
                              $reason == max_reports ]]; then
        finish_frame 1 || fail_as final_frame_error
        frame_open=0
      fi
      stop_top
      drain_final_worker || fail_as final_worker_error
      if [[ -n $worker_pid ]]; then
        if [[ -f $worker_stage/READY && -n $ofd ]]; then
          reap_worker || fail_as final_worker_error
        else
          cancel_worker
        fi
      fi
      if [[ -n $ofd && $reason != write_error && $reason != max_bytes ]]; then
        discard_queue all "$reason" || fail_as final_drop_error
      fi
      if [[ -n $ofd ]]; then
        if [[ $reason == write_error || $reason == max_bytes ]]; then
          flush_occurrences 2>/dev/null
        else
          checkpoint final || fail_as final_checkpoint_error
        fi
        close_output "$reason" || fail_as final_close_error
      fi
      if [[ -n $runtime && $runtime == "${TMPDIR:-/tmp}/phone_top_v6."* ]]; then
        rm -rf -- "$runtime"
      fi
      printf 'Stopped: %s; source=%d saved=%d bytes=%d%s\n' \
        "$reason" "$source_n" "$saved_n" "$run_bytes" "${file:+; last=$file}"
      case $reason in
        signal_1) status=129 ;;
        signal_2) status=130 ;;
        signal_15) status=143 ;;
        *_error|serializer_*|state_*) status=1 ;;
      esac
      return "$status"
    }

    trap 'on_signal 1' HUP
    trap 'on_signal 2' INT
    trap 'on_signal 15' TERM

    if ((until && until <= run_start_epoch)); then
      reason=until
    else
      start_top || fail_as top_start_error
    fi

    while [[ $reason == running ]]; do
      line=
      if IFS= read -r -t "$source_timeout" -u "$top_fd" line; then
        line=${line%$'\r'}
        if [[ $line =~ ^P6_TOP_PID=([1-9][0-9]*)$ ]]; then
          remote_top_pid=${BASH_REMATCH[1]}
        elif [[ $line == Tasks:* || $line == Threads:* ]]; then
          IFS='|' read -r next_epoch next_stamp next_day next_hour next_iso \
            <<<"$(clock_snapshot)"
          if ((frame_open)); then
            finish_frame "$frame_overflow" || {
              fail_as frame_error
              break
            }
            frame_open=0
            ((healthy_frames++))
            ((healthy_frames >= 3)) && source_retry=0
          fi
          [[ $reason == running ]] || break
          reap_worker || {
            fail_as worker_reap_error
            break
          }
          [[ $reason == running ]] || break
          advance_epochs "$next_day" "$next_hour" "$next_stamp" || {
            fail_as epoch_error
            break
          }
          [[ $reason == running ]] || break
          if ((SECONDS >= next_checkpoint)); then
            checkpoint periodic || {
              fail_as checkpoint_error
              break
            }
          fi
          check_limits
          [[ $reason == running ]] || break
          launch_worker || {
            fail_as worker_launch_error
            break
          }
          [[ $reason == running ]] || break
          ((source_n++))
          frame_epoch=$next_epoch
          frame_stamp=$next_stamp
          frame_day=$next_day
          frame_hour=$next_hour
          frame_iso=$next_iso
          report=$line
          frame_open=1
          frame_overflow=0
        elif ((frame_open)); then
          if ((${#report} + ${#line} + 1 <= frame_cap)); then
            report+=$'\n'"$line"
          else
            frame_overflow=1
          fi
        elif ((${#source_noise} < 4096)); then
          source_noise+="${source_noise:+$'\n'}$line"
        fi
      else
        read_rc=$?
        if ((frame_open)); then
          finish_frame 1 || fail_as frame_error
          frame_open=0
        fi
        stop_top
        source_record "$read_rc" "$TOP_RC" || fail_as source_record_error
        reap_worker || fail_as worker_reap_error
        if ((SECONDS >= next_checkpoint)); then
          checkpoint source_restart || fail_as checkpoint_error
        fi
        check_limits
        [[ $reason == running ]] || break
        case $source_retry in
          0) backoff=1 ;;
          1) backoff=2 ;;
          2) backoff=4 ;;
          3) backoff=8 ;;
          4) backoff=16 ;;
          *) backoff=30 ;;
        esac
        ((source_retry++))
        if ((duration)); then
          remaining=$((duration - (SECONDS - run_start_seconds)))
          ((remaining < backoff)) && backoff=$remaining
        fi
        if ((until)); then
          remaining=$((until - $(date +%s)))
          ((remaining < backoff)) && backoff=$remaining
        fi
        ((backoff > 0)) && sleep "$backoff"
        check_limits
        [[ $reason == running ]] || break
        start_top || fail_as top_start_error
      fi
      check_limits
    done

    status=0
    case $reason in
      signal_1) status=129 ;;
      signal_2) status=130 ;;
      signal_15) status=143 ;;
      *_error|serializer_*|state_*)
        status=1
        ;;
    esac
    finalize_run "$status"
    exit $?
  )
}

case ${BASH_SOURCE[0]-} in
  "$0") phone_top_profile_v6 "$@" ;;
  *) phone_top_profile_v6 ;;
esac
