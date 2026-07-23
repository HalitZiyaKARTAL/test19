phone_top_profile() {
  local LOCAL_CONTROLLER_SCRIPT LEGACY_REMOTE_SCRIPT PHONE_TOP_ARGUMENT CLEAN_PHONE_TOP_ARGUMENT PHONE_TOP_STATUS;
  local ENGINE="controller" ENGINE_WAS_SET=0 ADB_PATH="adb" ADB_SERIAL="" CONTROLLER_ONLY_FLAG="" ARGUMENT_INDEX=0 ARGUMENT_COUNT="$#" OPTION VALUE;
  local -a ORIGINAL_ARGUMENTS=("$@") LEGACY_ARGUMENTS=();
  if [ "$#" -eq 0 ] || [ "$1" = "--help" ] || [ "$1" = "-h" ] || [ "$1" = "help" ]; then
    printf "%s\n" \
      "phone_top_profile — least-privilege, event-driven Android top recorder" \
      "Paste/source this function in Termux Bash; do not run the .txt with sh." \
      "" \
      "USAGE — choose exactly one capture mode:" \
      "  phone_top_profile --every-top [OPTIONS]" \
      "  phone_top_profile --every-reports N [OPTIONS]" \
      "  phone_top_profile --every-time DURATION [OPTIONS]" \
      "" \
      "EXECUTION ENGINES:" \
      "  --engine controller   Default. Parsing, policy, limits, rotation, temporary data," \
      "                        and output writes run under the local Termux/host UID." \
      "                        UID 2000 runs only fixed read-only telemetry collectors." \
      "  --engine shell        Compatibility mode: preserve the original all-inside-adb-shell" \
      "                        engine, its remote output paths, and original top-option behavior." \
      "  --legacy-shell        Alias for --engine shell." \
      "  There is never an automatic fallback from controller to shell mode." \
      "  Detached survival requires a separately pre-armed on-phone recorder; this build" \
      "  does not silently arm one. Explicit shell mode is the manual compatibility backup." \
      "" \
      "TARGET AND PRIVILEGE GUARDS:" \
      "  --adb PATH            Controller-side adb executable; default: adb." \
      "  --serial SERIAL       Pin every ADB request to one already-connected target." \
      "  --collector-timeout T Bound each one-shot ADB diagnostic; default 45s, max 5m." \
      "  --allow-root-controller  Permit controller mode when the local UID is 0." \
      "  --allow-root-extractor   Permit controller mode when adbd reports UID 0." \
      "  Root controller/adbd is refused by default; these flags never enable root." \
      "" \
      "CAPTURE MODES:" \
      "  --every-top            Save every arriving top report." \
      "  --every-reports N      Save report 1, then every Nth arriving report." \
      "  --every-time DURATION  Save immediately, then the first report after each duration." \
      "" \
      "TOP PRODUCER:" \
      "  --top-delay SECONDS    Add top -d. Omitted/native by default; zero is rejected." \
      "  --top-rows N|all       Default: 50 highest-CPU rows per report." \
      "  --top-fields LIST|raw  Default bounded diagnostic fields." \
      "  --raw-top              All rows and Toybox default fields; potentially very large." \
      "  --top-arg ARG          Add one literal top token; repeat for option/value pairs." \
      "  Controller mode allows -H and validated -s/-n/-p/-u/-k pairs." \
      "  Dynamic hot analysis requires PID, %CPU, and NAME/ARGS/CMDLINE fields; use" \
      "  --no-hot-context for a deliberately NAME-less custom capture." \
      "  --top-path and other top tokens require explicit --engine shell." \
      "" \
      "OUTPUT AND CHECKPOINTS:" \
      "  --output-dir DIR       Controller mode: local Termux/host path. Auto-detects" \
      "                        ~/storage/downloads, /sdcard/Download, or ~/Downloads." \
      "                        Shell mode: target-device path; original default applies." \
      "  --prefix NAME          Default: phone_top." \
      "  --flush-every DURATION Default: 5m; 0 disables timed checkpoints." \
      "  --flush-reports N      Also checkpoint after N saved reports; default 0/off." \
      "  The active local file is opened at the first report and grows at checkpoints." \
      "" \
      "STOP CONDITIONS — first reached wins; omitted means unlimited:" \
      "  --duration DURATION    Elapsed from the first recognized top report." \
      "  --until LOCAL_TIME     Parsed locally, for example 2026-07-23 08:00:00." \
      "  --until-epoch EPOCH    Absolute epoch alternative." \
      "  --max-size SIZE        Aggregate captured bytes across date files." \
      "  --max-reports N        Complete saved reports." \
      "  --max-source-reports N All arriving reports, including skipped ones." \
      "" \
      "DIAGNOSTIC CONTEXT:" \
      "  --no-context           Disable checkpoint diagnostics." \
      "  --thread-every TIME    Watched-thread snapshot interval; default 60s, 0 disables." \
      "  --watch REGEX          Local extended-regex filtering of watched processes." \
      "  --hot-cpu PERCENT      Default 10. Trigger dynamic evidence at/above this CPU; 0 disables." \
      "  --hot-deep-cpu PERCENT Default 10. Every default >=10% trigger gets rich evidence." \
      "  --hot-critical-cpu PCT Default 90. Enable extra memory and system CPU evidence." \
      "  --hot-every TIME       Force every routine hot-tier cooldown together; 0 removes" \
      "                        that forced cooldown (adaptive safety can still back off)." \
      "  --hot-deep-every TIME  Force a deep-tier cooldown; default 0/unlimited." \
      "  --hot-critical-every T Force a critical-tier cooldown; default 0/unlimited." \
      "  --hot-foreground-every TIME  Force a foreground/allowed minimum; default 0." \
      "  --hot-budget PERCENT   Adaptive routine-evidence duty target; default 30, 0 disables." \
      "  --hot-backoff TIME     Adaptive backoff window after over-budget work; default 60s." \
      "  --hot-shape-every TIME Per-app hard-scan entitlement cooldown; default 1h, 0 each event." \
      "  --hot-shape-retry TIME Failed-attempt retry floor; default 60s, 0 next event." \
      "  --no-hot-shape         Disable the hourly baseline/critical scan guarantee." \
      "  --hot-max-pids N       Hottest routine candidates per report; default 8, maximum 32." \
      "                        Due per-app shape entitlements can exceed this routine cap." \
      "  --no-hot-context       Disable hot flags, routine scans, and shape entitlements." \
      "  Default is rich/unthrottled for the hottest 8 >=10% PIDs while matched prior" \
      "  collector duty is within 30%. Over-budget routine work gets computed backoff plus 60/30/10s tier" \
      "  cadences and a 60s foreground floor; every crossing remains flagged in the file." \
      "  Independently, each mapped app gets one >=10% hard baseline and another >=90%" \
      "  critical entitlement per hour. These override routine caps/backoff; one hottest" \
      "  representative is used per app/event. Incomplete scans do not consume the success" \
      "  entitlement and retry after the configured floor. Routine rich mode may also inspect" \
      "  sibling app processes. An exact read-only installed-package snapshot maps process" \
      "  names (including package subprocess suffixes); unmatched native names stay PID-only." \
      "" \
      "UNITS: duration 10s, 5m, 2h, 1d; size 500K, 100M, 2G; zero disables a limit." \
      "" \
      "EXAMPLES:" \
      "  phone_top_profile --every-top" \
      "  phone_top_profile --every-top --serial 127.0.0.1:5555" \
      "  phone_top_profile --every-reports 5 --duration 1h --max-size 500M" \
      "  phone_top_profile --every-top --top-delay 10 --output-dir ~/storage/downloads" \
      "  phone_top_profile --every-top --top-arg -H --top-rows 100" \
      "  phone_top_profile --engine shell --every-top --top-path /custom/top" \
      "" \
      "BEHAVIOR:" \
      "  The parser blocks on each arriving top line; there is no timer polling loop." \
      "  Device timestamps frame reports and a changed device day opens a new full-timestamp file." \
      "  Remote collectors receive no output/retention/rotation path or watch regex; dynamic" \
      "  evidence calls receive only locally derived, strictly validated PID/package selectors." \
      "  Malformed telemetry is handled only by the local UID and is never evaluated as shell code." \
      "  Ctrl+C and reached limits close ADB, flush the local file, and stop the target collector.";
    return 0;
  fi;
  for PHONE_TOP_ARGUMENT in "$@"; do
    case "$PHONE_TOP_ARGUMENT" in
      *"'"*) printf "ERROR: arguments cannot contain an apostrophe.\n" >&2; return 2 ;;
    esac;
    CLEAN_PHONE_TOP_ARGUMENT=$(printf "%s" "$PHONE_TOP_ARGUMENT" | tr -d "\r\n");
    if [ "$CLEAN_PHONE_TOP_ARGUMENT" != "$PHONE_TOP_ARGUMENT" ]; then printf "ERROR: arguments cannot contain line breaks.\n" >&2; return 2; fi;
  done;
  while [ "$ARGUMENT_INDEX" -lt "$ARGUMENT_COUNT" ]; do
    OPTION=${ORIGINAL_ARGUMENTS[$ARGUMENT_INDEX]};
    case "$OPTION" in
      --engine)
        ARGUMENT_INDEX=$((ARGUMENT_INDEX+1));
        if [ "$ARGUMENT_INDEX" -ge "$ARGUMENT_COUNT" ]; then printf "ERROR: --engine needs controller or shell.\n" >&2; return 2; fi;
        VALUE=${ORIGINAL_ARGUMENTS[$ARGUMENT_INDEX]};
        case "$VALUE" in controller|local|least-privilege) VALUE="controller" ;; shell|remote-shell|legacy) VALUE="shell" ;; *) printf "ERROR: unknown engine %s.\n" "$VALUE" >&2; return 2 ;; esac;
        if [ "$ENGINE_WAS_SET" -eq 1 ] && [ "$ENGINE" != "$VALUE" ]; then printf "ERROR: conflicting engine options.\n" >&2; return 2; fi;
        ENGINE="$VALUE"; ENGINE_WAS_SET=1;
        ;;
      --engine=*)
        VALUE=${OPTION#--engine=};
        case "$VALUE" in controller|local|least-privilege) VALUE="controller" ;; shell|remote-shell|legacy) VALUE="shell" ;; *) printf "ERROR: unknown engine %s.\n" "$VALUE" >&2; return 2 ;; esac;
        if [ "$ENGINE_WAS_SET" -eq 1 ] && [ "$ENGINE" != "$VALUE" ]; then printf "ERROR: conflicting engine options.\n" >&2; return 2; fi;
        ENGINE="$VALUE"; ENGINE_WAS_SET=1;
        ;;
      --legacy-shell)
        if [ "$ENGINE_WAS_SET" -eq 1 ] && [ "$ENGINE" != "shell" ]; then printf "ERROR: conflicting engine options.\n" >&2; return 2; fi;
        ENGINE="shell"; ENGINE_WAS_SET=1;
        ;;
      --adb|--adb-path)
        ARGUMENT_INDEX=$((ARGUMENT_INDEX+1));
        if [ "$ARGUMENT_INDEX" -ge "$ARGUMENT_COUNT" ]; then printf "ERROR: %s needs a path.\n" "$OPTION" >&2; return 2; fi;
        ADB_PATH=${ORIGINAL_ARGUMENTS[$ARGUMENT_INDEX]};
        ;;
      --serial)
        ARGUMENT_INDEX=$((ARGUMENT_INDEX+1));
        if [ "$ARGUMENT_INDEX" -ge "$ARGUMENT_COUNT" ]; then printf "ERROR: --serial needs a value.\n" >&2; return 2; fi;
        ADB_SERIAL=${ORIGINAL_ARGUMENTS[$ARGUMENT_INDEX]};
        ;;
      --allow-root-controller|--allow-root-extractor|--allow-root-adb)
        CONTROLLER_ONLY_FLAG="$OPTION";
        ;;
      --every-reports|--every-time|--top-delay|--delay|--top-path|--flush-every|--flush|--flush-reports|--duration|--until|--until-epoch|--max-size|--max-reports|--max-source-reports|--dir|--output-dir|--prefix|--top-rows|--rows|--top-fields|--fields|--top-arg|--thread-every|--watch|--hot-cpu|--hot-deep-cpu|--hot-critical-cpu|--hot-every|--hot-deep-every|--hot-critical-every|--hot-foreground-every|--hot-observer-budget|--hot-budget|--hot-backoff|--hot-shape-every|--hot-shape-retry|--hot-max-pids|--collector-timeout|--adb-collector-timeout)
        LEGACY_ARGUMENTS+=("$OPTION");
        ARGUMENT_INDEX=$((ARGUMENT_INDEX+1));
        if [ "$ARGUMENT_INDEX" -lt "$ARGUMENT_COUNT" ]; then LEGACY_ARGUMENTS+=("${ORIGINAL_ARGUMENTS[$ARGUMENT_INDEX]}"); fi;
        ;;
      *) LEGACY_ARGUMENTS+=("$OPTION") ;;
    esac;
    ARGUMENT_INDEX=$((ARGUMENT_INDEX+1));
  done;
  if [ "$ENGINE" = "shell" ] && [ -n "$CONTROLLER_ONLY_FLAG" ]; then printf "ERROR: %s is controller-only and is meaningless in explicit shell mode.\n" "$CONTROLLER_ONLY_FLAG" >&2; return 2; fi;
  LOCAL_CONTROLLER_SCRIPT='umask 077;
EXECUTION_ENGINE="controller";
ADB_PATH="adb";
ADB_SERIAL="";
ADB_COLLECTOR_TIMEOUT_SECONDS=45;
ALLOW_ROOT_CONTROLLER=0;
ALLOW_ROOT_EXTRACTOR=0;
OUTPUT_DIR="";
FILE_PREFIX="phone_top";
TOP_DELAY="";
TOP_PATH="/system/bin/top";
CAPTURE_MODE="";
SAVE_EVERY_REPORTS=1;
SAVE_INTERVAL_SECONDS=0;
FLUSH_SECONDS=300;
FLUSH_EVERY_REPORTS=0;
MAX_ELAPSED_SECONDS=0;
STOP_AT_EPOCH=0;
MAX_CAPTURE_BYTES=0;
MAX_SAVED_REPORTS=0;
MAX_SOURCE_REPORTS=0;
TOP_ROWS=50;
TOP_FIELDS="PID,USER,PR,NI,VIRT,RES,SHR,S,%CPU,%MEM,NAME:64,TIME+";
CONTEXT_ENABLED=1;
THREAD_SNAPSHOT_SECONDS=60;
HOT_CONTEXT_ENABLED=1;
HOT_CPU_THRESHOLD="10";
HOT_SAMPLE_SECONDS=0;
HOT_DEEP_CPU_THRESHOLD="10";
HOT_DEEP_SAMPLE_SECONDS=0;
HOT_CRITICAL_CPU_THRESHOLD="90";
HOT_CRITICAL_SAMPLE_SECONDS=0;
HOT_FOREGROUND_MIN_SECONDS=0;
HOT_RATE_LIMITS_FORCED=0;
HOT_OBSERVER_BUDGET_PERCENT="30";
HOT_ADAPTIVE_BACKOFF_SECONDS=60;
HOT_BACKOFF_SURVEILLANCE_SECONDS=60;
HOT_BACKOFF_DEEP_SECONDS=30;
HOT_BACKOFF_CRITICAL_SECONDS=10;
HOT_BACKOFF_FOREGROUND_SECONDS=60;
HOT_SHAPE_SAMPLE_SECONDS=3600;
HOT_SHAPE_RETRY_SECONDS=60;
HOT_SHAPE_ENABLED=1;
HOT_PACKAGE_REGISTRY_READY=0;
HOT_PACKAGE_REGISTRY_LAST_ATTEMPT=0;
HOT_MAX_PIDS=8;
HOT_RELAXED_PACKAGE_REGEX='"'"'^(com\.termux|com\.chrome\.dev|com\.android\.chrome|com\.run\.tower\.defense|com\.android\.soundrecorder)$'"'"';
WATCH_REGEX="org\.telegram\.messenger|com\.android\.vending|com\.google\.android\.apps\.photos|com\.google\.android\.providers\.media\.module|com\.google\.android\.gms|com\.xiaomi\.xmsf|com\.miui\.|hotspotshield|system_server|surfaceflinger|media\.swcodec|audioserver";
SESSION_ID="$(date +%Y%m%d_%H%M%S)_$$";
STOP_AT_LOCAL_TEXT="";
TARGET_SERIAL="";
TARGET_UID="";
TARGET_CONTEXT="";
TARGET_BUILD="";
CONTROLLER_UID="";
REMOTE_UID_GUARD="";
RUN_STATUS=0;
TOP_REMOTE_STATUS="";
TOP_STREAM_END_SEEN=0;
TOP_END_EXPECTED=0;
WORK_BASE="";
for WORK_BASE_CANDIDATE in "${TMPDIR:-}" "${PREFIX:+$PREFIX/tmp}" "${HOME:+$HOME/.cache}" "/tmp"; do
  [ -n "$WORK_BASE_CANDIDATE" ] || continue;
  if { [ -d "$WORK_BASE_CANDIDATE" ] || mkdir -p "$WORK_BASE_CANDIDATE" 2>/dev/null; } && [ -w "$WORK_BASE_CANDIDATE" ]; then WORK_BASE="$WORK_BASE_CANDIDATE"; break; fi;
done;
[ -n "$WORK_BASE" ] || { printf "CONFIGURATION ERROR: no writable private temporary base was found\n" >&2; exit 2; };
WORK_DIR=$(mktemp -d "$WORK_BASE/.phone_top_profile.XXXXXX") || exit 1;
remove_private_work_dir() {
  case "$WORK_DIR" in
    "$WORK_BASE"/.phone_top_profile.??????)
      [ "$WORK_DIR" != "$WORK_BASE" ] && [ -d "$WORK_DIR" ] && [ ! -L "$WORK_DIR" ] || return 1;
      rm -rf -- "$WORK_DIR";
      ;;
    *) return 1 ;;
  esac;
};
TOP_PIPE="$WORK_DIR/top_stream.pipe";
CHUNK_FILE="$WORK_DIR/current_chunk.txt";
CONTEXT_FILE="$WORK_DIR/latest_context.txt";
TOP_ARGUMENT_FILE="$WORK_DIR/top_arguments.txt";
CONTEXT_PROCESS_LIST_FILE="$WORK_DIR/context_process_list.txt";
THREAD_PROCESS_LIST_FILE="$WORK_DIR/thread_process_list.txt";
REMOTE_LAUNCH_FILE="$WORK_DIR/remote_top_launcher.sh";
ADB_STDERR_FILE="$WORK_DIR/adb_top_stderr.txt";
METADATA_FILE="$WORK_DIR/target_metadata.txt";
DEADLINE_REASON_FILE="$WORK_DIR/deadline_reason.txt";
HOT_CANDIDATE_FILE="$WORK_DIR/hot_candidates.txt";
HOT_SELECTED_FILE="$WORK_DIR/hot_selected.txt";
HOT_SELECTED_UNSORTED_FILE="$WORK_DIR/hot_selected_unsorted.txt";
HOT_DUE_FILE="$WORK_DIR/hot_due.txt";
HOT_STATE_FILE="$WORK_DIR/hot_state.txt";
HOT_SHAPE_STATE_FILE="$WORK_DIR/hot_shape_state.txt";
HOT_SHAPE_PENDING_FILE="$WORK_DIR/hot_shape_pending.txt";
HOT_PROCESS_OUTPUT_FILE="$WORK_DIR/hot_process_output.txt";
HOT_PACKAGE_OUTPUT_FILE="$WORK_DIR/hot_package_output.txt";
HOT_CRITICAL_OUTPUT_FILE="$WORK_DIR/hot_critical_output.txt";
HOT_STATE_TEMP_FILE="$WORK_DIR/hot_state_next.txt";
HOT_SHAPE_STATE_TEMP_FILE="$WORK_DIR/hot_shape_state_next.txt";
HOT_CLASSIFICATION_FILE="$WORK_DIR/hot_classification.txt";
HOT_PACKAGE_REGISTRY_FILE="$WORK_DIR/hot_package_registry.txt";
HOT_PACKAGE_REGISTRY_OUTPUT_FILE="$WORK_DIR/hot_package_registry_output.txt";
HOT_PACKAGE_REGISTRY_TEMP_FILE="$WORK_DIR/hot_package_registry_next.txt";
export LC_ALL=C;
set -f;
: >"$TOP_ARGUMENT_FILE" || exit 1;
early_cleanup() {
  EARLY_STATUS=$?;
  trap - EXIT HUP INT TERM;
  rm -f "$TOP_ARGUMENT_FILE" "$TOP_PIPE" "$CHUNK_FILE" "$CONTEXT_FILE" "$CONTEXT_PROCESS_LIST_FILE" "$THREAD_PROCESS_LIST_FILE" "$REMOTE_LAUNCH_FILE" "$ADB_STDERR_FILE" "$METADATA_FILE" "$DEADLINE_REASON_FILE" "$HOT_CANDIDATE_FILE" "$HOT_SELECTED_FILE" "$HOT_SELECTED_UNSORTED_FILE" "$HOT_DUE_FILE" "$HOT_STATE_FILE" "$HOT_SHAPE_STATE_FILE" "$HOT_SHAPE_PENDING_FILE" "$HOT_PROCESS_OUTPUT_FILE" "$HOT_PACKAGE_OUTPUT_FILE" "$HOT_CRITICAL_OUTPUT_FILE" "$HOT_STATE_TEMP_FILE" "$HOT_SHAPE_STATE_TEMP_FILE" "$HOT_CLASSIFICATION_FILE" "$HOT_PACKAGE_REGISTRY_FILE" "$HOT_PACKAGE_REGISTRY_OUTPUT_FILE" "$HOT_PACKAGE_REGISTRY_TEMP_FILE" 2>/dev/null;
  remove_private_work_dir 2>/dev/null;
  exit "$EARLY_STATUS";
};
trap early_cleanup EXIT HUP INT TERM;
is_unsigned_integer() {
  case "$1" in
    ""|*[!0-9]*) return 1 ;;
    *) [ "${#1}" -le 15 ] ;;
  esac;
};
normalize_unsigned_integer() {
  NORMALIZED_UNSIGNED_INTEGER="$1";
  while [ "${#NORMALIZED_UNSIGNED_INTEGER}" -gt 1 ] && [ "${NORMALIZED_UNSIGNED_INTEGER#0}" != "$NORMALIZED_UNSIGNED_INTEGER" ]; do NORMALIZED_UNSIGNED_INTEGER=${NORMALIZED_UNSIGNED_INTEGER#0}; done;
};
is_positive_decimal() {
  DECIMAL_TEXT="$1";
  DECIMAL_WHOLE="";
  DECIMAL_FRACTION="";
  case "$DECIMAL_TEXT" in
    *.*)
      DECIMAL_WHOLE=${DECIMAL_TEXT%%.*};
      DECIMAL_FRACTION=${DECIMAL_TEXT#*.};
      is_unsigned_integer "$DECIMAL_WHOLE" && is_unsigned_integer "$DECIMAL_FRACTION" || return 1;
      ;;
    *)
      is_unsigned_integer "$DECIMAL_TEXT" || return 1;
      ;;
  esac;
  case "${DECIMAL_WHOLE:-$DECIMAL_TEXT}${DECIMAL_FRACTION:-}" in *[1-9]*) return 0 ;; *) return 1 ;; esac;
};
parse_duration_seconds() {
  DURATION_TEXT="$1";
  case "$DURATION_TEXT" in
    *[sS]) DURATION_NUMBER=${DURATION_TEXT%?}; DURATION_MULTIPLIER=1 ;;
    *[mM]) DURATION_NUMBER=${DURATION_TEXT%?}; DURATION_MULTIPLIER=60 ;;
    *[hH]) DURATION_NUMBER=${DURATION_TEXT%?}; DURATION_MULTIPLIER=3600 ;;
    *[dD]) DURATION_NUMBER=${DURATION_TEXT%?}; DURATION_MULTIPLIER=86400 ;;
    *) DURATION_NUMBER=$DURATION_TEXT; DURATION_MULTIPLIER=1 ;;
  esac;
  is_unsigned_integer "$DURATION_NUMBER" || return 1;
  normalize_unsigned_integer "$DURATION_NUMBER";
  DURATION_NUMBER=$NORMALIZED_UNSIGNED_INTEGER;
  [ "${#DURATION_NUMBER}" -le 9 ] || return 1;
  PARSED_DURATION_SECONDS=$((DURATION_NUMBER*DURATION_MULTIPLIER));
};
parse_size_bytes() {
  SIZE_TEXT="$1";
  case "$SIZE_TEXT" in
    *[kK]) SIZE_NUMBER=${SIZE_TEXT%?}; SIZE_MULTIPLIER=1024 ;;
    *[mM]) SIZE_NUMBER=${SIZE_TEXT%?}; SIZE_MULTIPLIER=1048576 ;;
    *[gG]) SIZE_NUMBER=${SIZE_TEXT%?}; SIZE_MULTIPLIER=1073741824 ;;
    *) SIZE_NUMBER=$SIZE_TEXT; SIZE_MULTIPLIER=1 ;;
  esac;
  is_unsigned_integer "$SIZE_NUMBER" || return 1;
  normalize_unsigned_integer "$SIZE_NUMBER";
  SIZE_NUMBER=$NORMALIZED_UNSIGNED_INTEGER;
  [ "${#SIZE_NUMBER}" -le 9 ] || return 1;
  PARSED_SIZE_BYTES=$((SIZE_NUMBER*SIZE_MULTIPLIER));
};
controller_millis() {
  CONTROLLER_MILLIS_VALUE=$(date +%s%3N 2>/dev/null);
  case "$CONTROLLER_MILLIS_VALUE" in ""|*[!0-9]*|?????????????????*) CONTROLLER_MILLIS_VALUE="$(date +%s)000" ;; esac;
  printf "%s\n" "$CONTROLLER_MILLIS_VALUE";
};
fail_configuration() {
  printf "CONFIGURATION ERROR: %s\n" "$1" >&2;
  rm -f "$TOP_ARGUMENT_FILE" "$TOP_PIPE" "$CHUNK_FILE" "$CONTEXT_FILE" "$CONTEXT_PROCESS_LIST_FILE" "$THREAD_PROCESS_LIST_FILE" "$REMOTE_LAUNCH_FILE" "$ADB_STDERR_FILE" "$METADATA_FILE" "$DEADLINE_REASON_FILE" "$HOT_CANDIDATE_FILE" "$HOT_SELECTED_FILE" "$HOT_SELECTED_UNSORTED_FILE" "$HOT_DUE_FILE" "$HOT_STATE_FILE" "$HOT_SHAPE_STATE_FILE" "$HOT_SHAPE_PENDING_FILE" "$HOT_PROCESS_OUTPUT_FILE" "$HOT_PACKAGE_OUTPUT_FILE" "$HOT_CRITICAL_OUTPUT_FILE" "$HOT_STATE_TEMP_FILE" "$HOT_SHAPE_STATE_TEMP_FILE" "$HOT_CLASSIFICATION_FILE" "$HOT_PACKAGE_REGISTRY_FILE" "$HOT_PACKAGE_REGISTRY_OUTPUT_FILE" "$HOT_PACKAGE_REGISTRY_TEMP_FILE" 2>/dev/null;
  remove_private_work_dir 2>/dev/null;
  exit 2;
};
select_capture_mode() {
  [ -z "$CAPTURE_MODE" ] || fail_configuration "choose only one capture mode";
  CAPTURE_MODE="$1";
};
for CONTROLLER_ARGUMENT in "$@"; do
  case "$CONTROLLER_ARGUMENT" in *"'"'"'"*) fail_configuration "arguments cannot contain an apostrophe" ;; esac;
  CLEAN_CONTROLLER_ARGUMENT=$(printf "%s" "$CONTROLLER_ARGUMENT" | tr -d "\r\n");
  [ "$CLEAN_CONTROLLER_ARGUMENT" = "$CONTROLLER_ARGUMENT" ] || fail_configuration "arguments cannot contain line breaks";
  [ "${#CONTROLLER_ARGUMENT}" -le 4096 ] || fail_configuration "an argument exceeds 4096 characters";
done;
while [ "$#" -gt 0 ]; do
  OPTION_NAME="$1";
  case "$OPTION_NAME" in
    --engine)
      [ "$#" -ge 2 ] || fail_configuration "--engine needs controller or shell";
      case "$2" in controller|local|least-privilege) EXECUTION_ENGINE="controller" ;; *) fail_configuration "controller script received non-controller engine" ;; esac;
      shift 2;
      ;;
    --engine=controller|--engine=local|--engine=least-privilege)
      EXECUTION_ENGINE="controller";
      shift;
      ;;
    --legacy-shell)
      fail_configuration "--legacy-shell must be dispatched by the outer function";
      ;;
    --adb|--adb-path)
      [ "$#" -ge 2 ] || fail_configuration "$OPTION_NAME needs a controller-side adb path";
      ADB_PATH="$2";
      shift 2;
      ;;
    --serial)
      [ "$#" -ge 2 ] || fail_configuration "--serial needs an adb device serial";
      ADB_SERIAL="$2";
      [ "${#ADB_SERIAL}" -le 256 ] || fail_configuration "--serial is too long";
      shift 2;
      ;;
    --collector-timeout|--adb-collector-timeout)
      [ "$#" -ge 2 ] || fail_configuration "$OPTION_NAME needs a duration from 1s through 5m";
      parse_duration_seconds "$2" || fail_configuration "invalid $OPTION_NAME";
      [ "$PARSED_DURATION_SECONDS" -ge 1 ] && [ "$PARSED_DURATION_SECONDS" -le 300 ] || fail_configuration "$OPTION_NAME must be 1s through 5m";
      ADB_COLLECTOR_TIMEOUT_SECONDS=$PARSED_DURATION_SECONDS;
      shift 2;
      ;;
    --allow-root-controller)
      ALLOW_ROOT_CONTROLLER=1;
      shift;
      ;;
    --allow-root-extractor|--allow-root-adb)
      ALLOW_ROOT_EXTRACTOR=1;
      shift;
      ;;
    --every-top)
      select_capture_mode "EVERY_TOP";
      SAVE_EVERY_REPORTS=1;
      shift;
      ;;
    --every-reports)
      [ "$#" -ge 2 ] || fail_configuration "--every-reports needs a positive report count";
      is_unsigned_integer "$2" && [ "$2" -ge 1 ] || fail_configuration "--every-reports must be at least 1";
      select_capture_mode "EVERY_REPORTS";
      normalize_unsigned_integer "$2";
      SAVE_EVERY_REPORTS=$NORMALIZED_UNSIGNED_INTEGER;
      shift 2;
      ;;
    --every-time)
      [ "$#" -ge 2 ] || fail_configuration "--every-time needs a duration such as 10s";
      parse_duration_seconds "$2" && [ "$PARSED_DURATION_SECONDS" -ge 1 ] || fail_configuration "invalid --every-time duration";
      select_capture_mode "EVERY_TIME";
      SAVE_INTERVAL_SECONDS=$PARSED_DURATION_SECONDS;
      shift 2;
      ;;
    --top-delay|--delay)
      [ "$#" -ge 2 ] || fail_configuration "--top-delay needs native or seconds";
      TOP_DELAY="$2";
      shift 2;
      ;;
    --top-path)
      [ "$#" -ge 2 ] || fail_configuration "--top-path needs a command path";
      TOP_PATH="$2";
      shift 2;
      ;;
    --flush-every|--flush)
      [ "$#" -ge 2 ] || fail_configuration "--flush-every needs a duration such as 5m";
      parse_duration_seconds "$2" || fail_configuration "invalid --flush duration";
      FLUSH_SECONDS=$PARSED_DURATION_SECONDS;
      shift 2;
      ;;
    --flush-reports)
      [ "$#" -ge 2 ] || fail_configuration "--flush-reports needs a report count";
      is_unsigned_integer "$2" || fail_configuration "invalid --flush-reports count";
      FLUSH_EVERY_REPORTS="$2";
      shift 2;
      ;;
    --duration)
      [ "$#" -ge 2 ] || fail_configuration "--duration needs a duration such as 1h";
      parse_duration_seconds "$2" || fail_configuration "invalid --duration";
      MAX_ELAPSED_SECONDS=$PARSED_DURATION_SECONDS;
      shift 2;
      ;;
    --until)
      [ "$#" -ge 2 ] || fail_configuration "--until needs a local date and time";
      STOP_AT_LOCAL_TEXT="$2";
      shift 2;
      ;;
    --until-epoch)
      [ "$#" -ge 2 ] || fail_configuration "--until-epoch needs an epoch value";
      is_unsigned_integer "$2" || fail_configuration "invalid --until-epoch";
      [ "${#2}" -le 12 ] || fail_configuration "--until-epoch is too large";
      normalize_unsigned_integer "$2";
      STOP_AT_EPOCH=$NORMALIZED_UNSIGNED_INTEGER;
      shift 2;
      ;;
    --max-size)
      [ "$#" -ge 2 ] || fail_configuration "--max-size needs bytes or K, M, G suffix";
      parse_size_bytes "$2" || fail_configuration "invalid --max-size";
      MAX_CAPTURE_BYTES=$PARSED_SIZE_BYTES;
      shift 2;
      ;;
    --max-reports)
      [ "$#" -ge 2 ] || fail_configuration "--max-reports needs a count";
      is_unsigned_integer "$2" || fail_configuration "invalid --max-reports";
      MAX_SAVED_REPORTS="$2";
      shift 2;
      ;;
    --max-source-reports)
      [ "$#" -ge 2 ] || fail_configuration "--max-source-reports needs a count";
      is_unsigned_integer "$2" || fail_configuration "invalid --max-source-reports";
      MAX_SOURCE_REPORTS="$2";
      shift 2;
      ;;
    --dir|--output-dir)
      [ "$#" -ge 2 ] || fail_configuration "$OPTION_NAME needs a path";
      OUTPUT_DIR="$2";
      shift 2;
      ;;
    --prefix)
      [ "$#" -ge 2 ] || fail_configuration "--prefix needs a filename prefix";
      FILE_PREFIX="$2";
      case "$FILE_PREFIX" in ""|*/*) fail_configuration "--prefix cannot be empty or contain slash" ;; esac;
      shift 2;
      ;;
    --top-rows|--rows)
      [ "$#" -ge 2 ] || fail_configuration "--rows needs all or a positive count";
      TOP_ROWS="$2";
      if [ "$TOP_ROWS" != "all" ]; then
        is_unsigned_integer "$TOP_ROWS" && [ "$TOP_ROWS" -ge 1 ] || fail_configuration "--rows must be all or at least 1";
      fi;
      shift 2;
      ;;
    --top-fields|--fields)
      [ "$#" -ge 2 ] || fail_configuration "--fields needs a Toybox field list or raw";
      if [ "$2" = "raw" ]; then TOP_FIELDS=""; else TOP_FIELDS="$2"; fi;
      shift 2;
      ;;
    --raw-top)
      TOP_ROWS="all";
      TOP_FIELDS="";
      shift;
      ;;
    --top-arg)
      [ "$#" -ge 2 ] || fail_configuration "--top-arg needs one complete argument token";
      case "$2" in -q|--quiet|-*q*|-b|-*b*|-d|-d*|-m|-m*|-o|-o*) fail_configuration "use dedicated options for top batch, delay, rows, and fields; quiet mode is unsupported" ;; esac;
      printf "%s\n" "$2" >>"$TOP_ARGUMENT_FILE" || fail_configuration "could not save top argument";
      shift 2;
      ;;
    --no-context)
      CONTEXT_ENABLED=0;
      shift;
      ;;
    --thread-every)
      [ "$#" -ge 2 ] || fail_configuration "--thread-every needs a duration or 0";
      parse_duration_seconds "$2" || fail_configuration "invalid --thread-every";
      THREAD_SNAPSHOT_SECONDS=$PARSED_DURATION_SECONDS;
      shift 2;
      ;;
    --hot-cpu)
      [ "$#" -ge 2 ] || fail_configuration "--hot-cpu needs a percentage or 0";
      if [ "$2" = "0" ]; then HOT_CONTEXT_ENABLED=0; HOT_CPU_THRESHOLD="0"; else is_positive_decimal "$2" || fail_configuration "--hot-cpu must be a positive integer or decimal, or 0"; HOT_CPU_THRESHOLD="$2"; fi;
      shift 2;
      ;;
    --hot-every)
      [ "$#" -ge 2 ] || fail_configuration "--hot-every needs a duration or 0";
      parse_duration_seconds "$2" || fail_configuration "invalid --hot-every";
      HOT_SAMPLE_SECONDS=$PARSED_DURATION_SECONDS;
      HOT_DEEP_SAMPLE_SECONDS=$PARSED_DURATION_SECONDS;
      HOT_CRITICAL_SAMPLE_SECONDS=$PARSED_DURATION_SECONDS;
      HOT_FOREGROUND_MIN_SECONDS=$PARSED_DURATION_SECONDS;
      HOT_RATE_LIMITS_FORCED=1;
      shift 2;
      ;;
    --hot-deep-cpu)
      [ "$#" -ge 2 ] || fail_configuration "--hot-deep-cpu needs a percentage";
      is_positive_decimal "$2" || fail_configuration "--hot-deep-cpu must be a positive integer or decimal";
      HOT_DEEP_CPU_THRESHOLD="$2";
      shift 2;
      ;;
    --hot-critical-cpu)
      [ "$#" -ge 2 ] || fail_configuration "--hot-critical-cpu needs a percentage";
      is_positive_decimal "$2" || fail_configuration "--hot-critical-cpu must be a positive integer or decimal";
      HOT_CRITICAL_CPU_THRESHOLD="$2";
      shift 2;
      ;;
    --hot-deep-every)
      [ "$#" -ge 2 ] || fail_configuration "--hot-deep-every needs a duration or 0";
      parse_duration_seconds "$2" || fail_configuration "invalid --hot-deep-every";
      HOT_DEEP_SAMPLE_SECONDS=$PARSED_DURATION_SECONDS;
      HOT_RATE_LIMITS_FORCED=1;
      shift 2;
      ;;
    --hot-critical-every)
      [ "$#" -ge 2 ] || fail_configuration "--hot-critical-every needs a duration or 0";
      parse_duration_seconds "$2" || fail_configuration "invalid --hot-critical-every";
      HOT_CRITICAL_SAMPLE_SECONDS=$PARSED_DURATION_SECONDS;
      HOT_RATE_LIMITS_FORCED=1;
      shift 2;
      ;;
    --hot-foreground-every)
      [ "$#" -ge 2 ] || fail_configuration "--hot-foreground-every needs a duration or 0";
      parse_duration_seconds "$2" || fail_configuration "invalid --hot-foreground-every";
      HOT_FOREGROUND_MIN_SECONDS=$PARSED_DURATION_SECONDS;
      HOT_RATE_LIMITS_FORCED=1;
      shift 2;
      ;;
    --hot-observer-budget|--hot-budget)
      [ "$#" -ge 2 ] || fail_configuration "$OPTION_NAME needs a percentage from 0 through 100";
      if [ "$2" = "0" ]; then
        HOT_OBSERVER_BUDGET_PERCENT="0";
      else
        is_positive_decimal "$2" || fail_configuration "$OPTION_NAME must be a percentage from 0 through 100";
        awk -v value="$2" '"'"'BEGIN {exit !((value+0)>0 && (value+0)<=100)}'"'"' /dev/null || fail_configuration "$OPTION_NAME must be a percentage from 0 through 100";
        HOT_OBSERVER_BUDGET_PERCENT="$2";
      fi;
      shift 2;
      ;;
    --hot-backoff)
      [ "$#" -ge 2 ] || fail_configuration "--hot-backoff needs a duration or 0";
      parse_duration_seconds "$2" || fail_configuration "invalid --hot-backoff";
      HOT_ADAPTIVE_BACKOFF_SECONDS=$PARSED_DURATION_SECONDS;
      shift 2;
      ;;
    --hot-shape-every)
      [ "$#" -ge 2 ] || fail_configuration "--hot-shape-every needs a duration or 0";
      parse_duration_seconds "$2" || fail_configuration "invalid --hot-shape-every";
      HOT_SHAPE_SAMPLE_SECONDS=$PARSED_DURATION_SECONDS;
      shift 2;
      ;;
    --hot-shape-retry)
      [ "$#" -ge 2 ] || fail_configuration "--hot-shape-retry needs a duration or 0";
      parse_duration_seconds "$2" || fail_configuration "invalid --hot-shape-retry";
      HOT_SHAPE_RETRY_SECONDS=$PARSED_DURATION_SECONDS;
      shift 2;
      ;;
    --no-hot-shape)
      HOT_SHAPE_ENABLED=0;
      shift;
      ;;
    --hot-max-pids)
      [ "$#" -ge 2 ] || fail_configuration "--hot-max-pids needs a positive count";
      is_unsigned_integer "$2" && [ "$2" -ge 1 ] && [ "$2" -le 32 ] || fail_configuration "--hot-max-pids must be 1 through 32";
      HOT_MAX_PIDS="$2";
      shift 2;
      ;;
    --no-hot-context)
      HOT_CONTEXT_ENABLED=0;
      shift;
      ;;
    --watch)
      [ "$#" -ge 2 ] || fail_configuration "--watch needs an extended regular expression";
      WATCH_REGEX="$2";
      shift 2;
      ;;
    --help|-h|help)
      fail_configuration "help is displayed by calling phone_top_profile without arguments";
      ;;
    *)
      fail_configuration "unknown option $OPTION_NAME";
      ;;
  esac;
done;
[ -n "$CAPTURE_MODE" ] || fail_configuration "choose --every-top, --every-reports N, or --every-time DURATION";
if [ -n "$TOP_DELAY" ] && [ "$TOP_DELAY" != "native" ]; then
  is_positive_decimal "$TOP_DELAY" || fail_configuration "--top-delay must be a positive integer or decimal";
fi;
run_adb_bounded() {
  if [ -n "$ADB_SERIAL" ]; then timeout -k 5 "$ADB_COLLECTOR_TIMEOUT_SECONDS" "$ADB_PATH" -s "$ADB_SERIAL" "$@"; else timeout -k 5 "$ADB_COLLECTOR_TIMEOUT_SECONDS" "$ADB_PATH" "$@"; fi;
};
command -v "$ADB_PATH" >/dev/null 2>&1 || fail_configuration "controller-side adb command not found at $ADB_PATH";
command -v timeout >/dev/null 2>&1 || fail_configuration "controller-side timeout command is required for bounded collectors";
CONTROLLER_UID=$(id -u 2>/dev/null);
is_unsigned_integer "$CONTROLLER_UID" || fail_configuration "could not determine controller UID";
if [ "$CONTROLLER_UID" -eq 0 ] && [ "$ALLOW_ROOT_CONTROLLER" -ne 1 ]; then fail_configuration "controller UID is root; add --allow-root-controller only if intentional"; fi;
if [ -z "$ADB_SERIAL" ]; then
  TARGET_SERIAL=$(run_adb_bounded get-serialno 2>/dev/null) || fail_configuration "could not resolve exactly one adb target; use --serial";
  TARGET_SERIAL=$(printf "%s" "$TARGET_SERIAL" | tr -d "\r\n");
  [ -n "$TARGET_SERIAL" ] && [ "$TARGET_SERIAL" != "unknown" ] || fail_configuration "adb target is unavailable; use --serial after connecting it";
  case "$TARGET_SERIAL" in *[!A-Za-z0-9._:-]*) fail_configuration "adb returned an unsafe target serial" ;; esac;
  ADB_SERIAL="$TARGET_SERIAL";
else
  TARGET_SERIAL="$ADB_SERIAL";
fi;
[ "$(run_adb_bounded get-state 2>/dev/null)" = "device" ] || fail_configuration "selected adb target is not in device state";
TARGET_UID=$(run_adb_bounded exec-out id -u 2>/dev/null | tr -d "\r\n");
is_unsigned_integer "$TARGET_UID" || fail_configuration "could not determine adb extractor UID";
case "$TARGET_UID" in
  2000) REMOTE_UID_GUARD='"'"'[ "$(id -u)" = "2000" ] || { printf "EXTRACTOR_UID_GUARD_FAILED expected=2000 actual=%s\n" "$(id -u)" >&2; exit 126; };'"'"' ;;
  0)
    [ "$ALLOW_ROOT_EXTRACTOR" -eq 1 ] || fail_configuration "adbd is root; controller mode refuses it unless --allow-root-extractor is explicit";
    REMOTE_UID_GUARD='"'"'[ "$(id -u)" = "0" ] || { printf "EXTRACTOR_UID_GUARD_FAILED expected=0 actual=%s\n" "$(id -u)" >&2; exit 126; };'"'"';
    ;;
  *) fail_configuration "controller mode requires adb shell UID 2000; use explicit --engine shell for an unusual target UID" ;;
esac;
REMOTE_FIXED_PREAMBLE='"'"'PATH=/system/bin:/system/xbin; export PATH; LC_ALL=C; export LC_ALL;
trap '"'"'\'"'"''"'"'trap - HUP INT TERM; kill -HUP 0'"'"'\'"'"''"'"' HUP INT TERM;'"'"';
{
  printf "%s\n%s\n" "$REMOTE_FIXED_PREAMBLE" "$REMOTE_UID_GUARD";
  printf '"'"'%s\n'"'"' '"'"'printf "TARGET_CONTEXT_BEGIN\n"; id -Z; printf "TARGET_CONTEXT_END\nTARGET_BUILD_BEGIN\n"; getprop ro.build.fingerprint; printf "TARGET_BUILD_END\n";'"'"';
} | run_adb_bounded shell -T /system/bin/sh -s >"$METADATA_FILE" 2>&1 || fail_configuration "guarded target metadata collector failed, timed out, or extractor UID changed";
METADATA_BYTES=$(wc -c <"$METADATA_FILE");
is_unsigned_integer "$METADATA_BYTES" && [ "$METADATA_BYTES" -le 16384 ] || fail_configuration "target metadata exceeded 16384 bytes";
TARGET_CONTEXT=$(sed -n '"'"'/^TARGET_CONTEXT_BEGIN$/,/^TARGET_CONTEXT_END$/{ /^TARGET_CONTEXT_/d; p; }'"'"' "$METADATA_FILE" | tr "\r\n" "  ");
TARGET_BUILD=$(sed -n '"'"'/^TARGET_BUILD_BEGIN$/,/^TARGET_BUILD_END$/{ /^TARGET_BUILD_/d; p; }'"'"' "$METADATA_FILE" | tr "\r\n" "  ");
if [ -n "$STOP_AT_LOCAL_TEXT" ]; then
  STOP_AT_EPOCH=$(date -d "$STOP_AT_LOCAL_TEXT" +%s 2>/dev/null) || fail_configuration "--until could not be parsed by the controller; use --until-epoch for an exact remote epoch";
  STOP_AT_EPOCH=$(printf "%s" "$STOP_AT_EPOCH" | tr -d "\r\n");
  is_unsigned_integer "$STOP_AT_EPOCH" || fail_configuration "controller returned an invalid --until epoch";
  [ "${#STOP_AT_EPOCH}" -le 12 ] || fail_configuration "controller returned an out-of-range --until epoch";
fi;
[ "$TOP_PATH" = "/system/bin/top" ] || fail_configuration "custom --top-path requires explicit --engine shell";
[ "${#FILE_PREFIX}" -le 80 ] || fail_configuration "--prefix exceeds 80 characters";
case "$FILE_PREFIX" in *[!A-Za-z0-9._-]*) fail_configuration "controller-mode --prefix allows only letters, digits, dot, underscore, and hyphen" ;; esac;
[ "${#WATCH_REGEX}" -le 1024 ] || fail_configuration "--watch exceeds 1024 characters";
grep -E -- "$WATCH_REGEX" /dev/null >/dev/null 2>&1;
[ "$?" -ne 2 ] || fail_configuration "--watch is not a valid extended regular expression";
if [ "$HOT_CONTEXT_ENABLED" -eq 1 ]; then
  awk -v low="$HOT_CPU_THRESHOLD" -v deep="$HOT_DEEP_CPU_THRESHOLD" -v critical="$HOT_CRITICAL_CPU_THRESHOLD" '"'"'BEGIN {exit !((low+0)<=(deep+0) && (deep+0)<=(critical+0))}'"'"' /dev/null || fail_configuration "hot CPU thresholds must satisfy surveillance <= deep <= critical";
fi;
if [ "$HOT_CONTEXT_ENABLED" -eq 1 ] && [ "$HOT_SHAPE_ENABLED" -eq 1 ]; then HOT_SHAPE_EFFECTIVE=1; HOT_SHAPE_DISABLED_REASON="none";
elif [ "$HOT_CONTEXT_ENABLED" -ne 1 ]; then HOT_SHAPE_EFFECTIVE=0; HOT_SHAPE_DISABLED_REASON="hot-context-disabled";
else HOT_SHAPE_EFFECTIVE=0; HOT_SHAPE_DISABLED_REASON="hot-shape-disabled";
fi;
if [ -n "$TOP_FIELDS" ]; then
  [ "${#TOP_FIELDS}" -le 512 ] || fail_configuration "--top-fields exceeds 512 characters";
  case "$TOP_FIELDS" in *[!A-Za-z0-9_%,:+=.-]*) fail_configuration "unsafe controller-mode --top-fields; use --engine shell for unrestricted fields" ;; esac;
fi;
HOT_PID_COLUMN=1;
HOT_CPU_COLUMN=9;
HOT_NAME_COLUMN=12;
if [ "$HOT_CONTEXT_ENABLED" -eq 1 ] && [ -n "$TOP_FIELDS" ]; then
  HOT_PID_COLUMN=0;
  HOT_CPU_COLUMN=0;
  HOT_NAME_COLUMN=0;
  HOT_FIELD_INDEX=0;
  SAVED_IFS=$IFS;
  IFS=,;
  set -- $TOP_FIELDS;
  IFS=$SAVED_IFS;
  for HOT_FIELD_NAME in "$@"; do
    HOT_FIELD_INDEX=$((HOT_FIELD_INDEX+1));
    HOT_FIELD_NAME=${HOT_FIELD_NAME%%:*};
    HOT_FIELD_NAME=${HOT_FIELD_NAME%%=*};
    case "$HOT_FIELD_NAME" in PID) HOT_PID_COLUMN=$HOT_FIELD_INDEX ;; %CPU) HOT_CPU_COLUMN=$HOT_FIELD_INDEX ;; NAME|ARGS|CMDLINE) HOT_NAME_COLUMN=$HOT_FIELD_INDEX ;; esac;
  done;
  [ "$HOT_PID_COLUMN" -gt 0 ] && [ "$HOT_CPU_COLUMN" -gt 0 ] && [ "$HOT_NAME_COLUMN" -gt 0 ] || fail_configuration "dynamic hot-CPU context needs PID, %CPU, and NAME/ARGS/CMDLINE fields; add them or use --no-hot-context";
fi;
EXPECTED_TOP_ARGUMENT="";
while IFS= read -r SAFE_TOP_ARGUMENT; do
  if [ -n "$EXPECTED_TOP_ARGUMENT" ]; then
    case "$EXPECTED_TOP_ARGUMENT" in
      SORT) is_unsigned_integer "$SAFE_TOP_ARGUMENT" && [ "$SAFE_TOP_ARGUMENT" -ge 1 ] || fail_configuration "-s needs a positive field number" ;;
      ITERATIONS) is_unsigned_integer "$SAFE_TOP_ARGUMENT" && [ "$SAFE_TOP_ARGUMENT" -ge 1 ] || fail_configuration "-n needs a positive iteration count"; TOP_END_EXPECTED=1 ;;
      PIDS) case "$SAFE_TOP_ARGUMENT" in ""|*[!0-9,]*) fail_configuration "-p accepts only comma-separated numeric PIDs" ;; esac ;;
      USERS) case "$SAFE_TOP_ARGUMENT" in ""|*[!A-Za-z0-9_,.-]*) fail_configuration "-u contains unsafe characters" ;; esac ;;
      FALLBACK_SORT) case "$SAFE_TOP_ARGUMENT" in ""|*[!A-Za-z0-9_%,:+.-]*) fail_configuration "-k contains unsafe characters" ;; esac ;;
    esac;
    EXPECTED_TOP_ARGUMENT="";
  else
    case "$SAFE_TOP_ARGUMENT" in
      -H) ;;
      -s) EXPECTED_TOP_ARGUMENT="SORT" ;;
      -n) EXPECTED_TOP_ARGUMENT="ITERATIONS" ;;
      -p) EXPECTED_TOP_ARGUMENT="PIDS" ;;
      -u) EXPECTED_TOP_ARGUMENT="USERS" ;;
      -k) EXPECTED_TOP_ARGUMENT="FALLBACK_SORT" ;;
      *) fail_configuration "unsupported controller-mode --top-arg $SAFE_TOP_ARGUMENT; use explicit --engine shell to preserve unrestricted capability" ;;
    esac;
  fi;
done <"$TOP_ARGUMENT_FILE";
[ -z "$EXPECTED_TOP_ARGUMENT" ] || fail_configuration "the final --top-arg option is missing its value token";
if [ -z "$OUTPUT_DIR" ]; then
  if [ -n "${HOME:-}" ] && [ -d "$HOME/storage/downloads" ] && [ -w "$HOME/storage/downloads" ]; then OUTPUT_DIR="$HOME/storage/downloads";
  elif [ -d "/sdcard/Download" ] && [ -w "/sdcard/Download" ]; then OUTPUT_DIR="/sdcard/Download";
  elif [ -n "${HOME:-}" ] && [ -d "$HOME/Downloads" ] && [ -w "$HOME/Downloads" ]; then OUTPUT_DIR="$HOME/Downloads";
  else OUTPUT_DIR=$(pwd); printf "WARNING: no writable Download directory detected; controller output defaults to %s\n" "$OUTPUT_DIR" >&2; fi;
fi;
mkdir -p "$OUTPUT_DIR" || fail_configuration "cannot create output directory";
[ -w "$OUTPUT_DIR" ] || fail_configuration "controller output directory is not writable; use --output-dir or explicit --engine shell";
mkfifo "$TOP_PIPE" || fail_configuration "cannot create private top pipe";
: >"$CHUNK_FILE" || fail_configuration "cannot create private chunk";
: >"$CONTEXT_FILE" || fail_configuration "cannot create private context file";
: >"$CONTEXT_PROCESS_LIST_FILE" || fail_configuration "cannot create private context process list";
: >"$THREAD_PROCESS_LIST_FILE" || fail_configuration "cannot create private thread process list";
: >"$ADB_STDERR_FILE" || fail_configuration "cannot create private adb diagnostic file";
: >"$HOT_CANDIDATE_FILE" || fail_configuration "cannot create hot-candidate file";
: >"$HOT_SELECTED_FILE" || fail_configuration "cannot create hot-selection file";
: >"$HOT_SELECTED_UNSORTED_FILE" || fail_configuration "cannot create hot-selection work file";
: >"$HOT_DUE_FILE" || fail_configuration "cannot create hot-due file";
: >"$HOT_STATE_FILE" || fail_configuration "cannot create hot-state file";
: >"$HOT_SHAPE_STATE_FILE" || fail_configuration "cannot create hot-shape-state file";
: >"$HOT_SHAPE_PENDING_FILE" || fail_configuration "cannot create hot-shape-pending file";
: >"$HOT_PROCESS_OUTPUT_FILE" || fail_configuration "cannot create hot-process-output file";
: >"$HOT_PACKAGE_OUTPUT_FILE" || fail_configuration "cannot create hot-package-output file";
: >"$HOT_CRITICAL_OUTPUT_FILE" || fail_configuration "cannot create hot-critical-output file";
: >"$HOT_CLASSIFICATION_FILE" || fail_configuration "cannot create hot-classification file";
: >"$HOT_PACKAGE_REGISTRY_FILE" || fail_configuration "cannot create hot-package-registry file";
: >"$HOT_PACKAGE_REGISTRY_OUTPUT_FILE" || fail_configuration "cannot create hot-package-registry-output file";
renice -n 10 -p $$ >/dev/null 2>&1;
ionice -c 3 -p $$ >/dev/null 2>&1;
CAPTURE_START_EPOCH=0;
SESSION_SOURCE_REPORTS=0;
SESSION_SAVED_REPORTS=0;
SESSION_COMMITTED_BYTES=0;
CLOSED_OUTPUT_BYTES=0;
SESSION_MEASURED_OUTPUT_BYTES=0;
PENDING_CHUNK_BYTES=0;
FILE_SOURCE_REPORTS=0;
FILE_SAVED_REPORTS=0;
FILE_CHECKPOINT_NUMBER=0;
SAVED_REPORTS_AT_LAST_FLUSH=0;
LAST_FLUSH_EPOCH=$CAPTURE_START_EPOCH;
NEXT_THREAD_SNAPSHOT_EPOCH=$CAPTURE_START_EPOCH;
LAST_SAVED_REPORT_EPOCH=0;
REPORT_FILE="";
FILE_IS_OPEN=0;
REPORT_FD_IS_OPEN=0;
CHUNK_FD_IS_OPEN=0;
FIRST_REPORT_IS_PENDING=0;
KEEP_CURRENT_REPORT=0;
TOP_PID="";
CONTEXT_PID="";
WATCHDOG_PID="";
UNTIL_WATCHDOG_PID="";
DURATION_WATCHDOG_PID="";
ADB_STDERR_INCLUDED=0;
CONTROLLER_PID=$$;
STOP_REASON="";
LAST_FRAME_EPOCH=0;
LAST_FRAME_WALL="";
PRE_FRAME_LINE_COUNT=0;
HOT_ADAPTIVE_BACKOFF_UNTIL_EPOCH=0;
HOT_ADAPTIVE_MIN_PERIOD_SECONDS=0;
HOT_LAST_COLLECTION_CONTROLLER_EPOCH=0;
HOT_LAST_COLLECTION_CONTROLLER_MILLIS=0;
HOT_LAST_COLLECTION_ELAPSED_MILLIS=0;
HOT_LAST_SOURCE_INTERVAL_MILLIS=0;
HOT_LAST_OBSERVER_DUTY_PERCENT="unknown";
STREAM_TOKEN=$(od -An -N 12 -tx1 /dev/urandom 2>/dev/null | tr -d " \r\n");
case "$STREAM_TOKEN" in ""|*[!0-9a-fA-F]*) STREAM_TOKEN="$(date +%s)_$$" ;; esac;
FRAME_MARKER_PREFIX="@@PHONE_TOP_FRAME_${STREAM_TOKEN}@@|";
END_MARKER_PREFIX="@@PHONE_TOP_END_${STREAM_TOKEN}@@|";
DEADLINE_MARKER_PREFIX="@@PHONE_TOP_LOCAL_DEADLINE_${STREAM_TOKEN}@@|";
open_chunk() {
  exec 3>>"$CHUNK_FILE" || return 1;
  CHUNK_FD_IS_OPEN=1;
};
close_chunk() {
  if [ "$CHUNK_FD_IS_OPEN" -eq 1 ]; then
    exec 3>&-;
    CHUNK_FD_IS_OPEN=0;
  fi;
};
close_report_file() {
  if [ "$REPORT_FD_IS_OPEN" -eq 1 ]; then
    exec 4>&-;
    REPORT_FD_IS_OPEN=0;
  fi;
};
write_chunk_line() {
  CHUNK_LINE="$1";
  printf "%s\n" "$CHUNK_LINE" >&3 || return 1;
  PENDING_CHUNK_BYTES=$((PENDING_CHUNK_BYTES+${#CHUNK_LINE}+1));
};
measure_file_bytes() {
  MEASURE_FILE_PATH="$1";
  if [ -e "$MEASURE_FILE_PATH" ]; then
    MEASURED_FILE_BYTES=$(stat -c %s "$MEASURE_FILE_PATH" 2>/dev/null);
    if ! is_unsigned_integer "$MEASURED_FILE_BYTES"; then MEASURED_FILE_BYTES=$(wc -c <"$MEASURE_FILE_PATH"); fi;
  else
    MEASURED_FILE_BYTES=0;
  fi;
};
sync_report_file() {
  SYNC_FILE="$1";
  if command -v fsync >/dev/null 2>&1; then fsync "$SYNC_FILE" 2>/dev/null;
  elif command -v sync >/dev/null 2>&1; then sync -d "$SYNC_FILE" 2>/dev/null;
  else return 0;
  fi;
};
measure_session_output_bytes() {
  if [ -n "$CONTEXT_PID" ]; then wait "$CONTEXT_PID" 2>/dev/null; CONTEXT_PID=""; fi;
  ACTIVE_REPORT_BYTES=0;
  if [ "$FILE_IS_OPEN" -eq 1 ]; then measure_file_bytes "$REPORT_FILE"; ACTIVE_REPORT_BYTES=$MEASURED_FILE_BYTES; fi;
  measure_file_bytes "$CHUNK_FILE";
  ACTIVE_CHUNK_BYTES=$MEASURED_FILE_BYTES;
  measure_file_bytes "$CONTEXT_FILE";
  ACTIVE_CONTEXT_BYTES=$MEASURED_FILE_BYTES;
  SESSION_MEASURED_OUTPUT_BYTES=$((CLOSED_OUTPUT_BYTES+ACTIVE_REPORT_BYTES+ACTIVE_CHUNK_BYTES+ACTIVE_CONTEXT_BYTES));
};
REMOTE_CONTEXT_COMMON_SCRIPT='"'"'printf "TARGET_WALL_UPTIME_FOREGROUND_POWER_BATTERY\n";
date "+%F %T %z";
cat /proc/uptime 2>&1;
timeout 2 dumpsys activity activities 2>&1 | grep -m 4 -E "mResumedActivity|topResumedActivity|ResumedActivity|mFocusedApp";
timeout 2 dumpsys power 2>&1 | grep -m 5 -E "Wakefulness=|mWakefulness=|Display Power: state=|mScreenOn=";
timeout 2 dumpsys battery 2>&1 | grep -E "status:|plugged:|level:|voltage:|temperature:";
printf "TARGET_PRESSURE_AND_MEMORY\n";
for PRESSURE_NAME in cpu memory io; do printf "%s " "$PRESSURE_NAME"; cat "/proc/pressure/$PRESSURE_NAME" 2>/dev/null; done;
grep -E "MemAvailable:|SwapFree:|Cached:|Dirty:|Writeback:" /proc/meminfo;
printf "TARGET_THERMAL_ZONES\n";
for THERMAL_ZONE in /sys/class/thermal/thermal_zone*; do if [ -r "$THERMAL_ZONE/temp" ]; then printf "%s %s %s\n" "$THERMAL_ZONE" "$(cat "$THERMAL_ZONE/type" 2>/dev/null)" "$(cat "$THERMAL_ZONE/temp" 2>/dev/null)"; fi; done;
printf "TARGET_BOUNDED_ACTIVITY_AND_BACKGROUND_LOGS\n";
timeout 3 logcat -b events -d -t 200 -v threadtime am_anr:I am_proc_died:I am_proc_start:I am_low_memory:I am_kill:I am_uid_active:I am_uid_idle:I wm_task_to_front:I wm_resume_activity:I wm_pause_activity:I "*:S" 2>&1;
timeout 3 logcat -b main -b system -b crash -b radio -d -t 200 -v threadtime ActivityManager:I ActivityTaskManager:I JobScheduler:I AlarmManager:I NotificationService:I Telecom:I FirebaseMessaging:I GcmPushListenerService:I TMessagesProj:I tgnet:I MediaProvider:I ModernMediaScanner:I ExternalStorageService:I FuseDaemon:I AndroidRuntime:D DEBUG:D libc:D "*:S" 2>&1;'"'"';
REMOTE_CONTEXT_DAILY_SCRIPT='"'"'printf "TARGET_DAILY_TELEGRAM_COMPONENTS_APPOPS_JOBS\n";
timeout 5 dumpsys package org.telegram.messenger 2>&1 | grep -i -E "versionCode=|versionName=|GcmPushListenerService|FirebaseMessagingService|NotificationsService|KeepAliveJob|VoIPService|TelegramConnectionService|enabledComponents|disabledComponents|stopped=";
timeout 5 cmd appops get --user current org.telegram.messenger 2>&1 | grep -E "RUN_IN_BACKGROUND|RUN_ANY_IN_BACKGROUND|WAKE_LOCK|READ_CONTACTS|WRITE_CONTACTS|READ_MEDIA|POST_NOTIFICATION";
timeout 5 dumpsys jobscheduler org.telegram.messenger 2>&1;'"'"';
REMOTE_PROCESS_LIST_SCRIPT='"'"'ps -A -o PID,UID,PR,NI,STAT,RSS,VSZ,TIME+,NAME 2>&1;'"'"';
REMOTE_PID_DETAILS_SCRIPT='"'"'for WATCHED_PID in "$@"; do
  case "$WATCHED_PID" in ""|*[!0-9]*) printf "REJECTED_INVALID_PID=%s\n" "$WATCHED_PID"; continue ;; esac;
  printf "PID=%s\n" "$WATCHED_PID";
  cat "/proc/$WATCHED_PID/stat" "/proc/$WATCHED_PID/schedstat" "/proc/$WATCHED_PID/io" "/proc/$WATCHED_PID/oom_score_adj" "/proc/$WATCHED_PID/cgroup" 2>&1;
done;'"'"';
collect_context() {
  trap - EXIT HUP INT TERM;
  CONTEXT_REASON="$1";
  INCLUDE_DAILY_BASELINE="$2";
  printf "===== CONTEXT | reason=%s | controller_captured=%s =====\n" "$CONTEXT_REASON" "$(date "+%F %T %z")" >&3;
  {
    printf "%s\n%s\n%s\n" "$REMOTE_FIXED_PREAMBLE" "$REMOTE_UID_GUARD" "$REMOTE_CONTEXT_COMMON_SCRIPT";
    if [ "$INCLUDE_DAILY_BASELINE" -eq 1 ]; then printf "%s\n" "$REMOTE_CONTEXT_DAILY_SCRIPT"; fi;
  } | run_adb_bounded shell -T /system/bin/sh -s >&3 2>&1;
  CONTEXT_REMOTE_STATUS=$?;
  printf "TARGET_CONTEXT_COLLECTOR_STATUS=%s\n" "$CONTEXT_REMOTE_STATUS" >&3;
  if [ -s "$DEADLINE_REASON_FILE" ]; then printf "CONTEXT_TRUNCATED_LOCAL_DEADLINE=%s\n===== CONTEXT COMPLETE =====\n" "$(head -n 1 "$DEADLINE_REASON_FILE")" >&3; return 0; fi;
  { printf "%s\n%s\n%s\n" "$REMOTE_FIXED_PREAMBLE" "$REMOTE_UID_GUARD" "$REMOTE_PROCESS_LIST_SCRIPT"; } | run_adb_bounded shell -T /system/bin/sh -s >"$CONTEXT_PROCESS_LIST_FILE" 2>&1;
  PROCESS_LIST_STATUS=$?;
  printf "WATCHED_PROCESS_CPU_AND_IO process_list_status=%s\n" "$PROCESS_LIST_STATUS" >&3;
  if [ -s "$DEADLINE_REASON_FILE" ]; then printf "CONTEXT_TRUNCATED_LOCAL_DEADLINE=%s\n===== CONTEXT COMPLETE =====\n" "$(head -n 1 "$DEADLINE_REASON_FILE")" >&3; return 0; fi;
  grep -E -- "$WATCH_REGEX" "$CONTEXT_PROCESS_LIST_FILE" >&3 2>/dev/null;
  WATCHED_PIDS=$(grep -E -- "$WATCH_REGEX" "$CONTEXT_PROCESS_LIST_FILE" 2>/dev/null | sed -n "s/^ *\([0-9][0-9]*\) .*/\1/p" | head -n 128);
  if [ -n "$WATCHED_PIDS" ]; then
    {
      printf "%s\n%s\n" "$REMOTE_FIXED_PREAMBLE" "$REMOTE_UID_GUARD";
      printf "set --";
      for WATCHED_PID in $WATCHED_PIDS; do case "$WATCHED_PID" in *[!0-9]*|"") continue ;; esac; printf " '"'"'%s'"'"'" "$WATCHED_PID"; done;
      printf "\n%s\n" "$REMOTE_PID_DETAILS_SCRIPT";
    } | run_adb_bounded shell -T /system/bin/sh -s >&3 2>&1;
    printf "TARGET_PID_DETAIL_COLLECTOR_STATUS=%s\n" "$?" >&3;
  fi;
  printf "===== CONTEXT COMPLETE =====\n" >&3;
};
start_context_capture() {
  [ "$CONTEXT_ENABLED" -eq 1 ] || return 0;
  CONTEXT_REASON="$1";
  INCLUDE_DAILY_BASELINE="$2";
  : >"$CONTEXT_FILE" || return 1;
  collect_context "$CONTEXT_REASON" "$INCLUDE_DAILY_BASELINE" 3>"$CONTEXT_FILE" &
  CONTEXT_PID=$!;
};
flush_chunk() {
  FLUSH_REASON="$1";
  FLUSH_EPOCH="$2";
  close_chunk;
  if [ -n "$CONTEXT_PID" ]; then wait "$CONTEXT_PID" 2>/dev/null; CONTEXT_PID=""; fi;
  CHUNK_SIZE=$(wc -c <"$CHUNK_FILE");
  CONTEXT_SIZE=$(wc -c <"$CONTEXT_FILE");
  COMMIT_SIZE=$((CHUNK_SIZE+CONTEXT_SIZE));
  if [ "$COMMIT_SIZE" -gt 0 ]; then
    FILE_CHECKPOINT_NUMBER=$((FILE_CHECKPOINT_NUMBER+1));
    { printf "\n===== CHECKPOINT %s | reason=%s | committed=%s | context_bytes=%s | top_bytes=%s =====\n" "$FILE_CHECKPOINT_NUMBER" "$FLUSH_REASON" "$(date "+%F %T %z")" "$CONTEXT_SIZE" "$CHUNK_SIZE" && cat "$CONTEXT_FILE" && cat "$CHUNK_FILE" && printf "\n===== CHECKPOINT %s COMPLETE =====\n" "$FILE_CHECKPOINT_NUMBER"; } >&4 || return 1;
    sync_report_file "$REPORT_FILE" || printf "WARNING: per-file sync failed for %s\n" "$REPORT_FILE" >&2;
    SESSION_COMMITTED_BYTES=$((SESSION_COMMITTED_BYTES+COMMIT_SIZE));
    printf "COMMITTED: %s checkpoint=%s bytes=%s\n" "$REPORT_FILE" "$FILE_CHECKPOINT_NUMBER" "$COMMIT_SIZE";
  fi;
  : >"$CHUNK_FILE" || return 1;
  : >"$CONTEXT_FILE" || return 1;
  PENDING_CHUNK_BYTES=0;
  LAST_FLUSH_EPOCH=$FLUSH_EPOCH;
  SAVED_REPORTS_AT_LAST_FLUSH=$SESSION_SAVED_REPORTS;
  open_chunk || return 1;
};
open_timestamped_file() {
  NEW_FILE_DAY="$1";
  NEW_FILE_TIMESTAMP="$2";
  FIRST_FRAME_WALL="$3";
  FIRST_FRAME_EPOCH="$4";
  FILE_BASE="$OUTPUT_DIR/${FILE_PREFIX}_${NEW_FILE_TIMESTAMP}";
  COLLISION_NUMBER=1;
  while :; do
    if [ "$COLLISION_NUMBER" -eq 1 ]; then REPORT_FILE="$FILE_BASE.txt"; else REPORT_FILE="${FILE_BASE}_$COLLISION_NUMBER.txt"; fi;
    set -C;
    if { command exec 4>"$REPORT_FILE"; } 2>/dev/null; then
      set +C;
      REPORT_FD_IS_OPEN=1;
      RESERVED_FILE_ID=$(stat -Lc "%d:%i" "/proc/self/fd/4" 2>/dev/null) || { close_report_file; return 1; };
      OPEN_FILE_ID=$(stat -Lc "%d:%i" "$REPORT_FILE" 2>/dev/null) || { close_report_file; return 1; };
      [ "$RESERVED_FILE_ID" = "$OPEN_FILE_ID" ] || { close_report_file; printf "ERROR: output file identity changed during secure open\n" >&2; return 1; };
      break;
    fi;
    set +C;
    COLLISION_NUMBER=$((COLLISION_NUMBER+1));
    [ "$COLLISION_NUMBER" -le 10000 ] || return 1;
  done;
  FILE_SOURCE_REPORTS=0;
  FILE_SAVED_REPORTS=0;
  FILE_CHECKPOINT_NUMBER=0;
  LAST_SAVED_REPORT_EPOCH=0;
  FIRST_REPORT_IS_PENDING=1;
  {
    printf "===== CONFIGURABLE CONTINUOUS PHONE TOP PROFILE =====\n";
    printf "FILE_DAY=%s\nFILE_CREATED_TIMESTAMP=%s\nFIRST_TOP_ARRIVAL=%s\nSESSION=%s\nREPORT=%s\n" "$NEW_FILE_DAY" "$NEW_FILE_TIMESTAMP" "$FIRST_FRAME_WALL" "$SESSION_ID" "$REPORT_FILE";
    printf "ENGINE=controller\nCONTROLLER_UID=%s\nADB_TARGET_SERIAL=%s\nTARGET_UID=%s\nTARGET_SELINUX_CONTEXT=%s\nREMOTE_WRITES=none\n" "$CONTROLLER_UID" "$TARGET_SERIAL" "$TARGET_UID" "$TARGET_CONTEXT";
    printf "ONE_SHOT_ADB_COLLECTOR_TIMEOUT_SECONDS=%s main_top_stream_exempt=yes\n" "$ADB_COLLECTOR_TIMEOUT_SECONDS";
    printf "PRIVILEGE_BOUNDARY=parser policy rotation limits recovery files and output writes run under controller UID; adb UID emits fixed read-only telemetry only\n";
    printf "EVENT_FLOW=block waiting for target-tagged top reports; process each arrival locally; no separate polling loop\n";
    printf "CAPTURE_MODE=%s SAVE_EVERY_REPORTS=%s SAVE_INTERVAL_SECONDS=%s TOP_PATH=%s TOP_DELAY=%s FLUSH_SECONDS=%s FLUSH_REPORTS=%s ROWS=%s FIELDS=%s\n" "$CAPTURE_MODE" "$SAVE_EVERY_REPORTS" "$SAVE_INTERVAL_SECONDS" "$TOP_PATH" "${TOP_DELAY:-native}" "$FLUSH_SECONDS" "$FLUSH_EVERY_REPORTS" "$TOP_ROWS" "${TOP_FIELDS:-raw}";
    printf "DYNAMIC_HOT_CONTEXT=enabled:%s surveillance_cpu:%s deep_cpu:%s critical_cpu:%s configured_surveillance_cooldown:%s configured_deep_cooldown:%s configured_critical_cooldown:%s configured_foreground_min:%s forced_rate_limits:%s routine_observer_budget_percent:%s adaptive_backoff_seconds:%s backoff_cadences:%s/%s/%s backoff_foreground_min:%s routine_max_pids:%s pid_column:%s cpu_column:%s name_column:%s\n" "$HOT_CONTEXT_ENABLED" "$HOT_CPU_THRESHOLD" "$HOT_DEEP_CPU_THRESHOLD" "$HOT_CRITICAL_CPU_THRESHOLD" "$HOT_SAMPLE_SECONDS" "$HOT_DEEP_SAMPLE_SECONDS" "$HOT_CRITICAL_SAMPLE_SECONDS" "$HOT_FOREGROUND_MIN_SECONDS" "$HOT_RATE_LIMITS_FORCED" "$HOT_OBSERVER_BUDGET_PERCENT" "$HOT_ADAPTIVE_BACKOFF_SECONDS" "$HOT_BACKOFF_SURVEILLANCE_SECONDS" "$HOT_BACKOFF_DEEP_SECONDS" "$HOT_BACKOFF_CRITICAL_SECONDS" "$HOT_BACKOFF_FOREGROUND_SECONDS" "$HOT_MAX_PIDS" "$HOT_PID_COLUMN" "$HOT_CPU_COLUMN" "$HOT_NAME_COLUMN";
    printf "HOT_DEFAULT_POLICY=rich routine evidence for the hottest %s eligible PIDs on every arrival; configured cooldowns engage only when explicitly forced or matched prior collector duty exceeds its budget; due per-app shape entitlements override the routine cap and backoff\n" "$HOT_MAX_PIDS";
    printf "HOT_SHAPE_GUARANTEE=configured:%s effective:%s disabled_reason:%s success_cooldown_seconds:%s failed_attempt_retry_seconds:%s baseline_at_cpu:%s additional_critical_at_cpu:%s routine_cap_override:yes commit_only_after_required_completion_markers:yes\n" "$HOT_SHAPE_ENABLED" "$HOT_SHAPE_EFFECTIVE" "$HOT_SHAPE_DISABLED_REASON" "$HOT_SHAPE_SAMPLE_SECONDS" "$HOT_SHAPE_RETRY_SECONDS" "$HOT_CPU_THRESHOLD" "$HOT_CRITICAL_CPU_THRESHOLD";
    printf "HOT_PACKAGE_MAPPING=exact_installed_package_snapshot_on_first_hot_event fallback:pid-only registry_retry_seconds:%s remote_writes:none\n" "$HOT_SHAPE_RETRY_SECONDS";
    printf "HOT_SHAPE_COMPLETION_REQUIRED=baseline:live_proc_stat+thread_ps+verified_package_components+appops+jobs critical:add_cpuinfo+meminfo optional_proc_fields:best-effort\n";
    printf "HOT_RELAXED_PACKAGES=%s\n" "$HOT_RELAXED_PACKAGE_REGEX";
    printf "STOP_LIMITS=elapsed:%s until_epoch:%s max_size:%s max_saved_reports:%s max_source_reports:%s\n" "$MAX_ELAPSED_SECONDS" "$STOP_AT_EPOCH" "$MAX_CAPTURE_BYTES" "$MAX_SAVED_REPORTS" "$MAX_SOURCE_REPORTS";
    printf "ALLOWED_ACTIVE_USE=games, sound recorder, Chrome or Chrome Dev, and Termux; Telegram is allowed while visible or in a call and notifications are required\n";
    printf "BUILD=%s\n" "$TARGET_BUILD";
  } >&4 || { close_report_file; return 1; };
  HEADER_SIZE=$(stat -Lc %s "$REPORT_FILE" 2>/dev/null);
  is_unsigned_integer "$HEADER_SIZE" || { close_report_file; return 1; };
  SESSION_COMMITTED_BYTES=$((SESSION_COMMITTED_BYTES+HEADER_SIZE));
  sync_report_file "$REPORT_FILE" || printf "WARNING: initial per-file sync failed for %s\n" "$REPORT_FILE" >&2;
  FILE_IS_OPEN=1;
  if [ "$CHUNK_FD_IS_OPEN" -eq 0 ]; then open_chunk || return 1; fi;
  LAST_FLUSH_EPOCH=$FIRST_FRAME_EPOCH;
  SAVED_REPORTS_AT_LAST_FLUSH=$SESSION_SAVED_REPORTS;
  NEXT_THREAD_SNAPSHOT_EPOCH=$((FIRST_FRAME_EPOCH+THREAD_SNAPSHOT_SECONDS));
  start_context_capture "FILE_OPEN" 1 || return 1;
  printf "OPENED: %s\n" "$REPORT_FILE";
};
finish_timestamped_file() {
  FINISH_REASON="$1";
  FINISH_EPOCH="$2";
  [ "$FILE_IS_OPEN" -eq 1 ] || return 0;
  flush_chunk "$FINISH_REASON" "$FINISH_EPOCH" || return 1;
  close_chunk;
  printf "\n===== FILE FINISHED | reason=%s | time=%s | source_reports=%s | saved_reports=%s =====\n" "$FINISH_REASON" "$(date "+%F %T %z")" "$FILE_SOURCE_REPORTS" "$FILE_SAVED_REPORTS" >&4 || return 1;
  sync_report_file "$REPORT_FILE" || printf "WARNING: final per-file sync failed for %s\n" "$REPORT_FILE" >&2;
  printf "FINISHED: %s\n" "$REPORT_FILE";
  measure_file_bytes "$REPORT_FILE";
  CLOSED_OUTPUT_BYTES=$((CLOSED_OUTPUT_BYTES+MEASURED_FILE_BYTES));
  close_report_file;
  FILE_IS_OPEN=0;
};
sample_watched_threads() {
  THREAD_SAMPLE_WALL="$1";
  { printf "%s\n%s\n" "$REMOTE_FIXED_PREAMBLE" "$REMOTE_UID_GUARD"; printf '"'"'%s\n'"'"' '"'"'ps -A -o PID,NAME 2>&1;'"'"'; } | run_adb_bounded shell -T /system/bin/sh -s >"$THREAD_PROCESS_LIST_FILE" 2>&1;
  THREAD_PROCESS_LIST_STATUS=$?;
  WATCHED_PIDS=$(grep -E -- "$WATCH_REGEX" "$THREAD_PROCESS_LIST_FILE" 2>/dev/null | sed -n "s/^ *\([0-9][0-9]*\) .*/\1/p" | head -n 128 | tr "\n" "," | sed "s/,$//");
  write_chunk_line "===== WATCHED THREAD STATE | $THREAD_SAMPLE_WALL | pids=$WATCHED_PIDS =====";
  write_chunk_line "TARGET_PROCESS_LIST_STATUS=$THREAD_PROCESS_LIST_STATUS";
  if [ -s "$DEADLINE_REASON_FILE" ]; then write_chunk_line "THREAD_COLLECTION_TRUNCATED_LOCAL_DEADLINE=$(head -n 1 "$DEADLINE_REASON_FILE")"; write_chunk_line "===== WATCHED THREAD STATE COMPLETE ====="; return 0; fi;
  if [ -n "$WATCHED_PIDS" ]; then
    case "$WATCHED_PIDS" in *[!0-9,]*) write_chunk_line "REJECTED_INVALID_WATCHED_PID_LIST"; return 1 ;; esac;
    { printf "%s\n%s\n" "$REMOTE_FIXED_PREAMBLE" "$REMOTE_UID_GUARD"; printf "set -- '"'"'%s'"'"'\n" "$WATCHED_PIDS"; printf '"'"'%s\n'"'"' '"'"'ps -T -p "$1" -o PID,TID,UID,PR,NI,S,%CPU,RSS,NAME:64,TIME 2>&1'"'"'; } | run_adb_bounded shell -T /system/bin/sh -s >&3 2>&1;
    write_chunk_line "TARGET_THREAD_COLLECTOR_STATUS=$?";
  fi;
  write_chunk_line "===== WATCHED THREAD STATE COMPLETE =====";
};
record_hot_top_line() {
  [ "$HOT_CONTEXT_ENABLED" -eq 1 ] || return 0;
  HOT_SOURCE_LINE="$1";
  set -- $HOT_SOURCE_LINE;
  [ "$#" -ge "$HOT_PID_COLUMN" ] && [ "$#" -ge "$HOT_CPU_COLUMN" ] || return 0;
  HOT_FIELD_INDEX=0;
  HOT_PID_VALUE="";
  HOT_CPU_VALUE="";
  HOT_PROCESS_NAME="UNKNOWN";
  for HOT_FIELD_VALUE in "$@"; do
    HOT_FIELD_INDEX=$((HOT_FIELD_INDEX+1));
    [ "$HOT_FIELD_INDEX" -ne "$HOT_PID_COLUMN" ] || HOT_PID_VALUE="$HOT_FIELD_VALUE";
    [ "$HOT_FIELD_INDEX" -ne "$HOT_CPU_COLUMN" ] || HOT_CPU_VALUE="$HOT_FIELD_VALUE";
    if [ "$HOT_NAME_COLUMN" -gt 0 ] && [ "$HOT_FIELD_INDEX" -eq "$HOT_NAME_COLUMN" ]; then HOT_PROCESS_NAME="$HOT_FIELD_VALUE"; fi;
  done;
  case "$HOT_PID_VALUE" in ""|*[!0-9]*) return 0 ;; esac;
  is_positive_decimal "$HOT_CPU_VALUE" || return 0;
  case "$HOT_PROCESS_NAME" in ""|*[!A-Za-z0-9._:-]*) HOT_PROCESS_NAME="UNKNOWN" ;; esac;
  printf "%s %s %s\n" "$HOT_PID_VALUE" "$HOT_CPU_VALUE" "$HOT_PROCESS_NAME" >>"$HOT_CANDIDATE_FILE";
};
REMOTE_HOT_PACKAGE_REGISTRY_SCRIPT='"'"'printf "PACKAGE_REGISTRY_BEGIN\n";
timeout 10 pm list packages --user current 2>&1;
HOT_PACKAGE_REGISTRY_STATUS=$?;
printf "PACKAGE_REGISTRY_STATUS=%s\nPACKAGE_REGISTRY_END\n" "$HOT_PACKAGE_REGISTRY_STATUS";'"'"';
REMOTE_HOT_CLASSIFIER_SCRIPT='"'"'printf "FOREGROUND_STATE_BEGIN\n";
timeout 2 dumpsys activity activities 2>&1 | grep -m 6 -E "mResumedActivity|topResumedActivity|ResumedActivity|mFocusedApp";
timeout 2 dumpsys window windows 2>&1 | grep -m 4 -E "mCurrentFocus|mFocusedApp";
printf "FOREGROUND_STATE_END\nPROCESS_MAP_BEGIN\n";
ps -A -o PID,NAME:256 2>&1 | sed "s/^/PROCESS /";
printf "PROCESS_MAP_END\n";'"'"';
REMOTE_HOT_PROCESS_MAP_SCRIPT='"'"'printf "PROCESS_MAP_BEGIN\n";
ps -A -o PID,NAME:256 2>&1 | sed "s/^/PROCESS /";
printf "PROCESS_MAP_END\n";'"'"';
resolve_hot_package_name() {
  RESOLVED_HOT_PACKAGE=${1%%:*};
  case "$RESOLVED_HOT_PACKAGE" in ""|UNKNOWN|.*|*.|*..*|*[!A-Za-z0-9._]*) RESOLVED_HOT_PACKAGE="UNKNOWN"; return ;; esac;
  if grep -Fqx "$RESOLVED_HOT_PACKAGE" "$HOT_PACKAGE_REGISTRY_FILE"; then return; fi;
  RESOLVED_HOT_PACKAGE=$(awk -v process="$RESOLVED_HOT_PACKAGE" '"'"'index(process,$0 ".")==1 && index($0,".")>0 && length($0)>length(best) {best=$0} END {print best}'"'"' "$HOT_PACKAGE_REGISTRY_FILE");
  case "$RESOLVED_HOT_PACKAGE" in ""|.*|*.|*..*|*[!A-Za-z0-9._]*) RESOLVED_HOT_PACKAGE="UNKNOWN" ;; esac;
};
REMOTE_HOT_DETAILS_SCRIPT='"'"'for HOT_PID in "$@"; do
  case "$HOT_PID" in ""|*[!0-9]*) printf "REJECTED_INVALID_HOT_PID=%s\n" "$HOT_PID"; continue ;; esac;
  if [ ! -d "/proc/$HOT_PID" ]; then printf "HOT_PID_SCAN_MISSING=%s\n" "$HOT_PID"; continue; fi;
  printf "HOT_PID_SCAN_BEGIN=%s\n" "$HOT_PID";
  printf "HOT_PID=%s\n" "$HOT_PID";
  cat "/proc/$HOT_PID/stat" 2>&1;
  HOT_PID_STAT_STATUS=$?;
  cat "/proc/$HOT_PID/status" "/proc/$HOT_PID/schedstat" "/proc/$HOT_PID/io" "/proc/$HOT_PID/oom_score_adj" "/proc/$HOT_PID/cgroup" 2>&1;
  printf "CMDLINE="; tr "\000" " " <"/proc/$HOT_PID/cmdline" 2>/dev/null; printf "\n";
  ps -T -p "$HOT_PID" -o PID,TID,UID,PR,NI,S,%CPU,RSS,NAME:64,TIME 2>&1;
  HOT_PID_PS_STATUS=$?;
  printf "HOT_PID_SCAN_STATUSES=%s required_stat:%s required_threads:%s optional_proc_fields:best-effort\n" "$HOT_PID" "$HOT_PID_STAT_STATUS" "$HOT_PID_PS_STATUS";
  if [ "$HOT_PID_STAT_STATUS" -eq 0 ] && [ "$HOT_PID_PS_STATUS" -eq 0 ]; then printf "HOT_PID_SCAN_COMPLETE=%s\n" "$HOT_PID"; else printf "HOT_PID_SCAN_PARTIAL=%s\n" "$HOT_PID"; fi;
done;'"'"';
REMOTE_HOT_PACKAGE_SCRIPT='"'"'for HOT_PACKAGE in "$@"; do
  case "$HOT_PACKAGE" in ""|.*|*..*|*[!A-Za-z0-9._]*) printf "REJECTED_INVALID_HOT_PACKAGE=%s\n" "$HOT_PACKAGE"; continue ;; esac;
  if ! timeout 4 pm path --user current "$HOT_PACKAGE" >/dev/null 2>&1; then printf "HOT_PACKAGE_SCAN_MISSING=%s\n" "$HOT_PACKAGE"; continue; fi;
  printf "HOT_PACKAGE_SCAN_BEGIN=%s\n" "$HOT_PACKAGE";
  printf "HOT_PACKAGE=%s\nPACKAGE_COMPONENTS_AND_STATE\n" "$HOT_PACKAGE";
  timeout 4 sh -c '"'"'\'"'"''"'"'dumpsys package "$1" 2>&1 | grep -i -E "versionCode=|versionName=|stopped=|enabled=|JobService|FirebaseMessagingService|GcmPushListenerService|NotificationsService|KeepAlive|SyncAdapter|foregroundServiceType|enabledComponents|disabledComponents"'"'"'\'"'"''"'"' sh "$HOT_PACKAGE";
  HOT_PACKAGE_COMPONENT_STATUS=$?;
  printf "PACKAGE_APPOPS\n";
  timeout 4 cmd appops get --user current "$HOT_PACKAGE" 2>&1;
  HOT_PACKAGE_APPOPS_STATUS=$?;
  printf "PACKAGE_JOBS\n";
  timeout 4 dumpsys jobscheduler "$HOT_PACKAGE" 2>&1;
  HOT_PACKAGE_JOBS_STATUS=$?;
  printf "HOT_PACKAGE_SCAN_STATUSES=%s components:%s appops:%s jobs:%s\n" "$HOT_PACKAGE" "$HOT_PACKAGE_COMPONENT_STATUS" "$HOT_PACKAGE_APPOPS_STATUS" "$HOT_PACKAGE_JOBS_STATUS";
  if [ "$HOT_PACKAGE_COMPONENT_STATUS" -eq 0 ] && [ "$HOT_PACKAGE_APPOPS_STATUS" -eq 0 ] && [ "$HOT_PACKAGE_JOBS_STATUS" -eq 0 ]; then printf "HOT_PACKAGE_SCAN_COMPLETE=%s\n" "$HOT_PACKAGE"; else printf "HOT_PACKAGE_SCAN_PARTIAL=%s\n" "$HOT_PACKAGE"; fi;
done;'"'"';
REMOTE_HOT_CRITICAL_SCRIPT='"'"'printf "CRITICAL_SYSTEM_CPUINFO\n";
timeout 4 dumpsys cpuinfo 2>&1;
HOT_CRITICAL_CPUINFO_STATUS=$?;
for HOT_PID in "$@"; do
  case "$HOT_PID" in ""|*[!0-9]*) printf "REJECTED_INVALID_CRITICAL_PID=%s\n" "$HOT_PID"; continue ;; esac;
  if [ ! -d "/proc/$HOT_PID" ]; then printf "HOT_CRITICAL_SCAN_MISSING=%s\n" "$HOT_PID"; continue; fi;
  printf "HOT_CRITICAL_SCAN_BEGIN=%s\n" "$HOT_PID";
  printf "CRITICAL_PID=%s\n" "$HOT_PID";
  cat "/proc/$HOT_PID/smaps_rollup" "/proc/$HOT_PID/limits" "/proc/$HOT_PID/wchan" "/proc/$HOT_PID/stack" 2>&1;
  timeout 4 dumpsys meminfo "$HOT_PID" 2>&1;
  HOT_CRITICAL_MEMINFO_STATUS=$?;
  printf "HOT_CRITICAL_SCAN_STATUSES=%s required_cpuinfo:%s required_meminfo:%s optional_proc_fields:best-effort\n" "$HOT_PID" "$HOT_CRITICAL_CPUINFO_STATUS" "$HOT_CRITICAL_MEMINFO_STATUS";
  if [ "$HOT_CRITICAL_CPUINFO_STATUS" -eq 0 ] && [ "$HOT_CRITICAL_MEMINFO_STATUS" -eq 0 ]; then printf "HOT_CRITICAL_SCAN_COMPLETE=%s\n" "$HOT_PID"; else printf "HOT_CRITICAL_SCAN_PARTIAL=%s\n" "$HOT_PID"; fi;
done;'"'"';
sample_hot_processes() {
  HOT_SAMPLE_EPOCH="$1";
  HOT_SAMPLE_WALL="$2";
  HOT_NEXT_SAMPLE_EPOCH=${3:-0};
  [ "$HOT_CONTEXT_ENABLED" -eq 1 ] || { : >"$HOT_CANDIDATE_FILE"; return 0; };
  [ -s "$HOT_CANDIDATE_FILE" ] || return 0;
  HOT_CONTROLLER_SAMPLE_EPOCH=$(date +%s);
  HOT_COLLECTION_START_EPOCH=$HOT_CONTROLLER_SAMPLE_EPOCH;
  HOT_COLLECTION_START_MILLIS=$(controller_millis);
  HOT_PRIOR_COLLECTION_ELAPSED_MILLIS=$HOT_LAST_COLLECTION_ELAPSED_MILLIS;
  HOT_OBSERVATION_INTERVAL_MILLIS=0;
  HOT_PRIOR_OBSERVER_DUTY_PERCENT="unknown";
  HOT_BUDGET_DECISION="insufficient-history";
  if [ "$HOT_OBSERVER_BUDGET_PERCENT" = "0" ] || [ "$HOT_ADAPTIVE_BACKOFF_SECONDS" -eq 0 ]; then
    HOT_BUDGET_DECISION="disabled";
  elif [ "$HOT_LAST_COLLECTION_CONTROLLER_MILLIS" -gt 0 ] && [ "$HOT_COLLECTION_START_MILLIS" -gt "$HOT_LAST_COLLECTION_CONTROLLER_MILLIS" ]; then
    HOT_OBSERVATION_INTERVAL_MILLIS=$((HOT_COLLECTION_START_MILLIS-HOT_LAST_COLLECTION_CONTROLLER_MILLIS));
    HOT_PRIOR_OBSERVER_DUTY_PERCENT=$(awk -v elapsed="$HOT_PRIOR_COLLECTION_ELAPSED_MILLIS" -v interval="$HOT_OBSERVATION_INTERVAL_MILLIS" '"'"'BEGIN {printf "%.1f", (elapsed*100)/interval}'"'"');
    HOT_BUDGET_DECISION="within-budget";
    if awk -v elapsed="$HOT_PRIOR_COLLECTION_ELAPSED_MILLIS" -v interval="$HOT_OBSERVATION_INTERVAL_MILLIS" -v budget="$HOT_OBSERVER_BUDGET_PERCENT" '"'"'BEGIN {exit !((elapsed*100)>(interval*budget))}'"'"' /dev/null; then
      HOT_ADAPTIVE_MIN_PERIOD_SECONDS=$(awk -v elapsed="$HOT_PRIOR_COLLECTION_ELAPSED_MILLIS" -v budget="$HOT_OBSERVER_BUDGET_PERCENT" '"'"'BEGIN {value=(elapsed*100)/(budget*1000); rounded=int(value); if (rounded<value) rounded++; if (rounded<1) rounded=1; print rounded}'"'"');
      HOT_BACKOFF_WINDOW_UNTIL_EPOCH=$((HOT_CONTROLLER_SAMPLE_EPOCH+HOT_ADAPTIVE_BACKOFF_SECONDS));
      HOT_MIN_PERIOD_UNTIL_EPOCH=$((HOT_LAST_COLLECTION_CONTROLLER_EPOCH+HOT_ADAPTIVE_MIN_PERIOD_SECONDS));
      HOT_ADAPTIVE_BACKOFF_UNTIL_EPOCH=$HOT_BACKOFF_WINDOW_UNTIL_EPOCH;
      if [ "$HOT_MIN_PERIOD_UNTIL_EPOCH" -gt "$HOT_ADAPTIVE_BACKOFF_UNTIL_EPOCH" ]; then HOT_ADAPTIVE_BACKOFF_UNTIL_EPOCH=$HOT_MIN_PERIOD_UNTIL_EPOCH; fi;
      HOT_BUDGET_DECISION="backoff-engaged";
    fi;
  fi;
  if ! awk -v threshold="$HOT_CPU_THRESHOLD" -v deep="$HOT_DEEP_CPU_THRESHOLD" -v critical="$HOT_CRITICAL_CPU_THRESHOLD" '"'"'
    $1 ~ /^[0-9]+$/ && $2 ~ /^[0-9]+([.][0-9]+)?$/ && ($2+0) >= (threshold+0) && ($2+0) > max[$1] {max[$1]=$2+0; name[$1]=$3}
    END {for (pid in max) {tier="surveillance"; if (max[pid]>=(critical+0)) tier="critical"; else if (max[pid]>=(deep+0)) tier="deep"; print pid, max[pid], tier, name[pid]}}
  '"'"' "$HOT_CANDIDATE_FILE" >"$HOT_SELECTED_UNSORTED_FILE"; then return 1; fi;
  : >"$HOT_CANDIDATE_FILE" || return 1;
  sort -k2,2nr "$HOT_SELECTED_UNSORTED_FILE" >"$HOT_SELECTED_FILE" || return 1;
  awk -v cap="$HOT_MAX_PIDS" '"'"'{print $1, $2, $3, $4, (NR<=cap ? 1 : 0)}'"'"' "$HOT_SELECTED_FILE" >"$HOT_DUE_FILE" || return 1;
  mv "$HOT_DUE_FILE" "$HOT_SELECTED_FILE" || return 1;
  : >"$HOT_DUE_FILE" || return 1;
  [ -s "$HOT_SELECTED_FILE" ] || return 0;
  HOT_ADAPTIVE_BACKOFF_ACTIVE=0;
  if [ "$HOT_OBSERVER_BUDGET_PERCENT" != "0" ] && [ "$HOT_ADAPTIVE_BACKOFF_SECONDS" -gt 0 ] && [ "$HOT_CONTROLLER_SAMPLE_EPOCH" -lt "$HOT_ADAPTIVE_BACKOFF_UNTIL_EPOCH" ]; then HOT_ADAPTIVE_BACKOFF_ACTIVE=1; fi;
  if [ "$HOT_ADAPTIVE_BACKOFF_ACTIVE" -eq 0 ]; then HOT_ADAPTIVE_MIN_PERIOD_SECONDS=0; fi;
  if [ "$HOT_RATE_LIMITS_FORCED" -eq 1 ] && [ "$HOT_ADAPTIVE_BACKOFF_ACTIVE" -eq 1 ]; then HOT_RATE_LIMIT_MODE="forced+adaptive-backoff";
  elif [ "$HOT_RATE_LIMITS_FORCED" -eq 1 ]; then HOT_RATE_LIMIT_MODE="forced";
  elif [ "$HOT_ADAPTIVE_BACKOFF_ACTIVE" -eq 1 ]; then HOT_RATE_LIMIT_MODE="adaptive-backoff";
  else HOT_RATE_LIMIT_MODE="rich";
  fi;
  HOT_GLOBAL_ADAPTIVE_WAIT=0;
  if [ "$HOT_ADAPTIVE_BACKOFF_ACTIVE" -eq 1 ] && [ "$HOT_ADAPTIVE_MIN_PERIOD_SECONDS" -gt 0 ] && [ "$HOT_LAST_COLLECTION_CONTROLLER_EPOCH" -gt 0 ] && [ "$HOT_CONTROLLER_SAMPLE_EPOCH" -ge "$HOT_LAST_COLLECTION_CONTROLLER_EPOCH" ] && [ $((HOT_CONTROLLER_SAMPLE_EPOCH-HOT_LAST_COLLECTION_CONTROLLER_EPOCH)) -lt "$HOT_ADAPTIVE_MIN_PERIOD_SECONDS" ]; then HOT_GLOBAL_ADAPTIVE_WAIT=1; fi;
  : >"$HOT_DUE_FILE";
  : >"$HOT_SHAPE_PENDING_FILE" || return 1;
  : >"$HOT_PROCESS_OUTPUT_FILE" || return 1;
  : >"$HOT_PACKAGE_OUTPUT_FILE" || return 1;
  : >"$HOT_CRITICAL_OUTPUT_FILE" || return 1;
  while IFS='"'"' '"'"' read -r HOT_PID_VALUE HOT_CPU_VALUE HOT_TIER HOT_TOP_PROCESS_NAME HOT_ROUTINE_ELIGIBLE; do
    case "$HOT_PID_VALUE" in ""|*[!0-9]*) continue ;; esac;
    case "$HOT_ROUTINE_ELIGIBLE" in 0|1) ;; *) HOT_ROUTINE_ELIGIBLE=0 ;; esac;
    case "$HOT_TOP_PROCESS_NAME" in ""|*[!A-Za-z0-9._:-]*) HOT_TOP_PROCESS_NAME="UNKNOWN" ;; esac;
    write_chunk_line "HOT_SURVEILLANCE_FLAG pid=$HOT_PID_VALUE cpu_percent=$HOT_CPU_VALUE tier=$HOT_TIER routine_candidate=$HOT_ROUTINE_ELIGIBLE observer_mode=$HOT_RATE_LIMIT_MODE prior_observer_duty_percent=$HOT_PRIOR_OBSERVER_DUTY_PERCENT global_adaptive_wait=$HOT_GLOBAL_ADAPTIVE_WAIT source_epoch=$HOT_SAMPLE_EPOCH controller_epoch=$HOT_CONTROLLER_SAMPLE_EPOCH" || return 1;
    printf "%s %s %s %s %s\n" "$HOT_PID_VALUE" "$HOT_CPU_VALUE" "$HOT_TIER" "$HOT_TOP_PROCESS_NAME" "$HOT_ROUTINE_ELIGIBLE" >>"$HOT_DUE_FILE" || return 1;
  done <"$HOT_SELECTED_FILE";
  [ -s "$HOT_DUE_FILE" ] || return 0;
  if [ -s "$DEADLINE_REASON_FILE" ]; then write_chunk_line "HOT_COLLECTION_TRUNCATED_LOCAL_DEADLINE=$(head -n 1 "$DEADLINE_REASON_FILE") before=classifier" || return 1; return 0; fi;
  HOT_PACKAGE_REGISTRY_ATTEMPT_DUE=0;
  if [ "$HOT_PACKAGE_REGISTRY_READY" -eq 0 ]; then
    if [ "$HOT_SHAPE_RETRY_SECONDS" -eq 0 ] || [ "$HOT_PACKAGE_REGISTRY_LAST_ATTEMPT" -eq 0 ] || [ "$HOT_CONTROLLER_SAMPLE_EPOCH" -lt "$HOT_PACKAGE_REGISTRY_LAST_ATTEMPT" ] || [ $((HOT_CONTROLLER_SAMPLE_EPOCH-HOT_PACKAGE_REGISTRY_LAST_ATTEMPT)) -ge "$HOT_SHAPE_RETRY_SECONDS" ]; then HOT_PACKAGE_REGISTRY_ATTEMPT_DUE=1; fi;
  fi;
  if [ "$HOT_PACKAGE_REGISTRY_ATTEMPT_DUE" -eq 1 ]; then
    HOT_PACKAGE_REGISTRY_LAST_ATTEMPT=$HOT_CONTROLLER_SAMPLE_EPOCH;
    { printf "%s\n%s\n%s\n" "$REMOTE_FIXED_PREAMBLE" "$REMOTE_UID_GUARD" "$REMOTE_HOT_PACKAGE_REGISTRY_SCRIPT"; } | run_adb_bounded shell -T /system/bin/sh -s >"$HOT_PACKAGE_REGISTRY_OUTPUT_FILE" 2>&1;
    HOT_PACKAGE_REGISTRY_CALL_STATUS=$?;
    HOT_PACKAGE_REGISTRY_REMOTE_STATUS=$(sed -n '"'"'s/^PACKAGE_REGISTRY_STATUS=//p'"'"' "$HOT_PACKAGE_REGISTRY_OUTPUT_FILE" | tail -n 1);
    case "$HOT_PACKAGE_REGISTRY_REMOTE_STATUS" in ""|*[!0-9]*) HOT_PACKAGE_REGISTRY_REMOTE_STATUS="invalid" ;; esac;
    HOT_PACKAGE_REGISTRY_BYTES=$(wc -c <"$HOT_PACKAGE_REGISTRY_OUTPUT_FILE");
    case "$HOT_PACKAGE_REGISTRY_BYTES" in ""|*[!0-9]*) HOT_PACKAGE_REGISTRY_BYTES=2097153 ;; esac;
    : >"$HOT_PACKAGE_REGISTRY_TEMP_FILE" || return 1;
    if [ "$HOT_PACKAGE_REGISTRY_CALL_STATUS" -eq 0 ] && [ "$HOT_PACKAGE_REGISTRY_REMOTE_STATUS" = "0" ] && [ "$HOT_PACKAGE_REGISTRY_BYTES" -le 2097152 ] && grep -Fqx "PACKAGE_REGISTRY_BEGIN" "$HOT_PACKAGE_REGISTRY_OUTPUT_FILE" && grep -Fqx "PACKAGE_REGISTRY_END" "$HOT_PACKAGE_REGISTRY_OUTPUT_FILE"; then
      sed -n '"'"'/^PACKAGE_REGISTRY_BEGIN$/,/^PACKAGE_REGISTRY_END$/{ /^package:/p; }'"'"' "$HOT_PACKAGE_REGISTRY_OUTPUT_FILE" | while IFS= read -r HOT_REGISTRY_LINE; do
        HOT_REGISTRY_PACKAGE=${HOT_REGISTRY_LINE#package:};
        case "$HOT_REGISTRY_PACKAGE" in ""|.*|*.|*..*|*[!A-Za-z0-9._]*) ;; *) printf "%s\n" "$HOT_REGISTRY_PACKAGE" ;; esac;
      done >"$HOT_PACKAGE_REGISTRY_TEMP_FILE";
      if [ -s "$HOT_PACKAGE_REGISTRY_TEMP_FILE" ]; then mv "$HOT_PACKAGE_REGISTRY_TEMP_FILE" "$HOT_PACKAGE_REGISTRY_FILE" || return 1; HOT_PACKAGE_REGISTRY_READY=1; fi;
    fi;
    write_chunk_line "HOT_PACKAGE_REGISTRY call_status=$HOT_PACKAGE_REGISTRY_CALL_STATUS remote_status=$HOT_PACKAGE_REGISTRY_REMOTE_STATUS bytes=$HOT_PACKAGE_REGISTRY_BYTES ready=$HOT_PACKAGE_REGISTRY_READY mapping=exact-installed-package-list controller_clock=$HOT_CONTROLLER_SAMPLE_EPOCH" || return 1;
  elif [ "$HOT_PACKAGE_REGISTRY_READY" -eq 0 ]; then
    write_chunk_line "HOT_PACKAGE_REGISTRY_RETRY_WAIT retry_seconds=$HOT_SHAPE_RETRY_SECONDS last_attempt=$HOT_PACKAGE_REGISTRY_LAST_ATTEMPT controller_clock=$HOT_CONTROLLER_SAMPLE_EPOCH mapping_fallback=pid-only" || return 1;
  fi;
  if [ -s "$DEADLINE_REASON_FILE" ]; then write_chunk_line "HOT_COLLECTION_TRUNCATED_LOCAL_DEADLINE=$(head -n 1 "$DEADLINE_REASON_FILE") after=package-registry" || return 1; return 0; fi;
  HOT_CLASSIFIER_KIND="skipped-not-needed";
  HOT_CLASSIFIER_STATUS=0;
  : >"$HOT_CLASSIFICATION_FILE" || return 1;
  HOT_FULL_CLASSIFIER_NEEDED=0;
  HOT_PROCESS_MAP_NEEDED=0;
  while IFS='"'"' '"'"' read -r HOT_MAP_PID HOT_MAP_CPU HOT_MAP_TIER HOT_MAP_PROCESS HOT_MAP_ROUTINE; do
    [ "$HOT_MAP_PROCESS" = "UNKNOWN" ] || continue;
    HOT_MAP_STATE_ROW=$(awk -v pid="$HOT_MAP_PID" '"'"'$1==pid {row=$0} END {print row}'"'"' "$HOT_STATE_FILE");
    HOT_MAP_CACHED_PROCESS="UNKNOWN";
    if [ -n "$HOT_MAP_STATE_ROW" ]; then set -- $HOT_MAP_STATE_ROW; HOT_MAP_CACHED_PROCESS=${6:-UNKNOWN}; fi;
    case "$HOT_MAP_CACHED_PROCESS" in ""|*[!A-Za-z0-9._:-]*) HOT_MAP_CACHED_PROCESS="UNKNOWN" ;; esac;
    if [ "$HOT_SHAPE_ENABLED" -eq 1 ] || [ "$HOT_MAP_CACHED_PROCESS" = "UNKNOWN" ]; then HOT_PROCESS_MAP_NEEDED=1; break; fi;
  done <"$HOT_DUE_FILE";
  if [ "$HOT_GLOBAL_ADAPTIVE_WAIT" -eq 0 ]; then
    while IFS='"'"' '"'"' read -r HOT_PRE_PID HOT_PRE_CPU HOT_PRE_TIER HOT_PRE_PROCESS HOT_PRE_ROUTINE; do
      [ "$HOT_PRE_ROUTINE" = "1" ] || continue;
      HOT_PRE_STATE_ROW=$(awk -v pid="$HOT_PRE_PID" '"'"'$1==pid {row=$0} END {print row}'"'"' "$HOT_STATE_FILE");
      HOT_PRE_LAST_CONTROLLER_SAMPLE=0;
      HOT_PRE_CACHED_CLASSIFICATION="unknown";
      HOT_PRE_CACHED_PACKAGE="UNKNOWN";
      HOT_PRE_CACHED_PROCESS="UNKNOWN";
      if [ -n "$HOT_PRE_STATE_ROW" ]; then set -- $HOT_PRE_STATE_ROW; HOT_PRE_CACHED_CLASSIFICATION=${3:-unknown}; HOT_PRE_CACHED_PACKAGE=${4:-UNKNOWN}; HOT_PRE_LAST_CONTROLLER_SAMPLE=${5:-0}; HOT_PRE_CACHED_PROCESS=${6:-UNKNOWN}; fi;
      case "$HOT_PRE_LAST_CONTROLLER_SAMPLE" in ""|*[!0-9]*) HOT_PRE_LAST_CONTROLLER_SAMPLE=0 ;; esac;
      case "$HOT_PRE_CACHED_PROCESS" in ""|*[!A-Za-z0-9._:-]*) HOT_PRE_CACHED_PROCESS="UNKNOWN" ;; esac;
      if [ "$HOT_PRE_PROCESS" = "UNKNOWN" ] && [ "$HOT_PRE_CACHED_PROCESS" != "UNKNOWN" ]; then HOT_PRE_PROCESS=$HOT_PRE_CACHED_PROCESS; fi;
      resolve_hot_package_name "$HOT_PRE_PROCESS";
      HOT_PRE_PACKAGE=$RESOLVED_HOT_PACKAGE;
      if [ "$HOT_PRE_PACKAGE" != "$HOT_PRE_CACHED_PACKAGE" ]; then HOT_PRE_LAST_CONTROLLER_SAMPLE=0; HOT_PRE_CACHED_CLASSIFICATION="unknown"; fi;
      HOT_PRE_REQUIRED_COOLDOWN=0;
      if [ "$HOT_RATE_LIMITS_FORCED" -eq 1 ]; then
        case "$HOT_PRE_TIER" in critical) HOT_PRE_REQUIRED_COOLDOWN=$HOT_CRITICAL_SAMPLE_SECONDS ;; deep) HOT_PRE_REQUIRED_COOLDOWN=$HOT_DEEP_SAMPLE_SECONDS ;; *) HOT_PRE_REQUIRED_COOLDOWN=$HOT_SAMPLE_SECONDS ;; esac;
        case "$HOT_PRE_CACHED_CLASSIFICATION" in foreground|allowed-exception) if [ "$HOT_FOREGROUND_MIN_SECONDS" -gt "$HOT_PRE_REQUIRED_COOLDOWN" ]; then HOT_PRE_REQUIRED_COOLDOWN=$HOT_FOREGROUND_MIN_SECONDS; fi ;; esac;
      fi;
      if [ "$HOT_ADAPTIVE_BACKOFF_ACTIVE" -eq 1 ]; then
        case "$HOT_PRE_TIER" in critical) HOT_PRE_BACKOFF_COOLDOWN=$HOT_BACKOFF_CRITICAL_SECONDS ;; deep) HOT_PRE_BACKOFF_COOLDOWN=$HOT_BACKOFF_DEEP_SECONDS ;; *) HOT_PRE_BACKOFF_COOLDOWN=$HOT_BACKOFF_SURVEILLANCE_SECONDS ;; esac;
        if [ "$HOT_PRE_BACKOFF_COOLDOWN" -gt "$HOT_PRE_REQUIRED_COOLDOWN" ]; then HOT_PRE_REQUIRED_COOLDOWN=$HOT_PRE_BACKOFF_COOLDOWN; fi;
        case "$HOT_PRE_CACHED_CLASSIFICATION" in foreground|allowed-exception) if [ "$HOT_BACKOFF_FOREGROUND_SECONDS" -gt "$HOT_PRE_REQUIRED_COOLDOWN" ]; then HOT_PRE_REQUIRED_COOLDOWN=$HOT_BACKOFF_FOREGROUND_SECONDS; fi ;; esac;
      fi;
      if [ "$HOT_PRE_LAST_CONTROLLER_SAMPLE" -eq 0 ] || [ "$HOT_CONTROLLER_SAMPLE_EPOCH" -lt "$HOT_PRE_LAST_CONTROLLER_SAMPLE" ] || [ $((HOT_CONTROLLER_SAMPLE_EPOCH-HOT_PRE_LAST_CONTROLLER_SAMPLE)) -ge "$HOT_PRE_REQUIRED_COOLDOWN" ]; then HOT_FULL_CLASSIFIER_NEEDED=1; break; fi;
    done <"$HOT_DUE_FILE";
  fi;
  if [ "$HOT_FULL_CLASSIFIER_NEEDED" -eq 1 ]; then
    HOT_CLASSIFIER_KIND="foreground-and-process-map";
    { printf "%s\n%s\n%s\n" "$REMOTE_FIXED_PREAMBLE" "$REMOTE_UID_GUARD" "$REMOTE_HOT_CLASSIFIER_SCRIPT"; } | run_adb_bounded shell -T /system/bin/sh -s >"$HOT_CLASSIFICATION_FILE" 2>&1;
    HOT_CLASSIFIER_STATUS=$?;
  elif [ "$HOT_PROCESS_MAP_NEEDED" -eq 1 ]; then
    HOT_CLASSIFIER_KIND="process-map-fallback";
    { printf "%s\n%s\n%s\n" "$REMOTE_FIXED_PREAMBLE" "$REMOTE_UID_GUARD" "$REMOTE_HOT_PROCESS_MAP_SCRIPT"; } | run_adb_bounded shell -T /system/bin/sh -s >"$HOT_CLASSIFICATION_FILE" 2>&1;
    HOT_CLASSIFIER_STATUS=$?;
  fi;
  HOT_DEADLINE_TRUNCATED=0;
  if [ -s "$DEADLINE_REASON_FILE" ]; then
    HOT_DEADLINE_TRUNCATED=1;
    write_chunk_line "HOT_COLLECTION_TRUNCATED_LOCAL_DEADLINE=$(head -n 1 "$DEADLINE_REASON_FILE") after=classifier" || return 1;
  else
  HOT_FOREGROUND_PACKAGE=$(sed -n '"'"'/^FOREGROUND_STATE_BEGIN$/,/^FOREGROUND_STATE_END$/{ /^FOREGROUND_STATE_/d; s#.* \([A-Za-z0-9_][A-Za-z0-9_.]*\)/[^ ]*.*#\1#p; }'"'"' "$HOT_CLASSIFICATION_FILE" | head -n 1);
  case "$HOT_FOREGROUND_PACKAGE" in *[!A-Za-z0-9._]*|"") HOT_FOREGROUND_PACKAGE="UNKNOWN" ;; esac;
  if [ "$HOT_FOREGROUND_PACKAGE" != "UNKNOWN" ] && ! grep -Fqx "$HOT_FOREGROUND_PACKAGE" "$HOT_PACKAGE_REGISTRY_FILE"; then HOT_FOREGROUND_PACKAGE="UNKNOWN"; fi;
  HOT_PID_LIST="";
  HOT_PACKAGE_LIST="";
  HOT_CRITICAL_PID_LIST="";
  HOT_SHAPE_KEYS_SELECTED="";
  HOT_SHAPE_OVERRIDE_OCCURRED=0;
  while IFS='"'"' '"'"' read -r HOT_PID_VALUE HOT_CPU_VALUE HOT_TIER HOT_TOP_PROCESS_NAME HOT_ROUTINE_ELIGIBLE; do
    case "$HOT_PID_VALUE" in ""|*[!0-9]*) continue ;; esac;
    HOT_STATE_ROW=$(awk -v pid="$HOT_PID_VALUE" '"'"'$1==pid {row=$0} END {print row}'"'"' "$HOT_STATE_FILE");
    HOT_LAST_SAMPLE=0;
    HOT_LAST_CONTROLLER_SAMPLE=0;
    HOT_CACHED_CLASSIFICATION="unknown";
    HOT_CACHED_PACKAGE="UNKNOWN";
    HOT_CACHED_PROCESS="UNKNOWN";
    if [ -n "$HOT_STATE_ROW" ]; then set -- $HOT_STATE_ROW; HOT_LAST_SAMPLE=${2:-0}; HOT_CACHED_CLASSIFICATION=${3:-unknown}; HOT_CACHED_PACKAGE=${4:-UNKNOWN}; HOT_LAST_CONTROLLER_SAMPLE=${5:-0}; HOT_CACHED_PROCESS=${6:-UNKNOWN}; fi;
    case "$HOT_LAST_SAMPLE" in ""|*[!0-9]*) HOT_LAST_SAMPLE=0 ;; esac;
    case "$HOT_LAST_CONTROLLER_SAMPLE" in ""|*[!0-9]*) HOT_LAST_CONTROLLER_SAMPLE=0 ;; esac;
    case "$HOT_CACHED_PROCESS" in ""|*[!A-Za-z0-9._:-]*) HOT_CACHED_PROCESS="UNKNOWN" ;; esac;
    HOT_PROCESS_NAME="$HOT_TOP_PROCESS_NAME";
    if [ "$HOT_PROCESS_NAME" = "UNKNOWN" ]; then HOT_PROCESS_NAME=$(awk -v pid="$HOT_PID_VALUE" '"'"'$1=="PROCESS" && $2==pid {print $3; exit}'"'"' "$HOT_CLASSIFICATION_FILE"); fi;
    case "$HOT_PROCESS_NAME" in ""|*[!A-Za-z0-9._:-]*) HOT_PROCESS_NAME="UNKNOWN" ;; esac;
    if [ "$HOT_PROCESS_NAME" = "UNKNOWN" ] && [ "$HOT_CLASSIFIER_KIND" = "skipped-not-needed" ] && [ "$HOT_CACHED_PROCESS" != "UNKNOWN" ]; then HOT_PROCESS_NAME=$HOT_CACHED_PROCESS; fi;
    resolve_hot_package_name "$HOT_PROCESS_NAME";
    HOT_PACKAGE_NAME=$RESOLVED_HOT_PACKAGE;
    if [ "$HOT_CLASSIFIER_KIND" = "skipped-not-needed" ] && [ "$HOT_PACKAGE_NAME" = "$HOT_CACHED_PACKAGE" ]; then
      case "$HOT_CACHED_CLASSIFICATION" in foreground|allowed-exception|background|unknown) HOT_CLASSIFICATION=$HOT_CACHED_CLASSIFICATION ;; *) HOT_CLASSIFICATION="unknown" ;; esac;
    elif [ "$HOT_PACKAGE_NAME" != "UNKNOWN" ] && [ "$HOT_PACKAGE_NAME" = "$HOT_FOREGROUND_PACKAGE" ]; then
      HOT_CLASSIFICATION="foreground";
    elif [ "$HOT_PACKAGE_NAME" != "UNKNOWN" ] && printf "%s\n" "$HOT_PACKAGE_NAME" | grep -E -- "$HOT_RELAXED_PACKAGE_REGEX" >/dev/null 2>&1; then
      HOT_CLASSIFICATION="allowed-exception";
    elif [ "$HOT_PACKAGE_NAME" = "UNKNOWN" ] || [ "$HOT_FOREGROUND_PACKAGE" = "UNKNOWN" ]; then
      HOT_CLASSIFICATION="unknown";
    else
      HOT_CLASSIFICATION="background";
    fi;
    HOT_REGULAR_DUE=$HOT_ROUTINE_ELIGIBLE;
    [ "$HOT_GLOBAL_ADAPTIVE_WAIT" -eq 0 ] || HOT_REGULAR_DUE=0;
    HOT_REQUIRED_COOLDOWN=0;
    if [ "$HOT_RATE_LIMITS_FORCED" -eq 1 ]; then
      case "$HOT_TIER" in critical) HOT_REQUIRED_COOLDOWN=$HOT_CRITICAL_SAMPLE_SECONDS ;; deep) HOT_REQUIRED_COOLDOWN=$HOT_DEEP_SAMPLE_SECONDS ;; *) HOT_REQUIRED_COOLDOWN=$HOT_SAMPLE_SECONDS ;; esac;
      case "$HOT_CLASSIFICATION" in foreground|allowed-exception) if [ "$HOT_FOREGROUND_MIN_SECONDS" -gt "$HOT_REQUIRED_COOLDOWN" ]; then HOT_REQUIRED_COOLDOWN=$HOT_FOREGROUND_MIN_SECONDS; fi ;; esac;
    fi;
    if [ "$HOT_ADAPTIVE_BACKOFF_ACTIVE" -eq 1 ]; then
      case "$HOT_TIER" in critical) HOT_BACKOFF_TIER_COOLDOWN=$HOT_BACKOFF_CRITICAL_SECONDS ;; deep) HOT_BACKOFF_TIER_COOLDOWN=$HOT_BACKOFF_DEEP_SECONDS ;; *) HOT_BACKOFF_TIER_COOLDOWN=$HOT_BACKOFF_SURVEILLANCE_SECONDS ;; esac;
      if [ "$HOT_BACKOFF_TIER_COOLDOWN" -gt "$HOT_REQUIRED_COOLDOWN" ]; then HOT_REQUIRED_COOLDOWN=$HOT_BACKOFF_TIER_COOLDOWN; fi;
      case "$HOT_CLASSIFICATION" in foreground|allowed-exception) if [ "$HOT_BACKOFF_FOREGROUND_SECONDS" -gt "$HOT_REQUIRED_COOLDOWN" ]; then HOT_REQUIRED_COOLDOWN=$HOT_BACKOFF_FOREGROUND_SECONDS; fi ;; esac;
    fi;
    if [ "$HOT_REQUIRED_COOLDOWN" -gt 0 ] && [ "$HOT_LAST_CONTROLLER_SAMPLE" -gt 0 ] && [ "$HOT_CONTROLLER_SAMPLE_EPOCH" -ge "$HOT_LAST_CONTROLLER_SAMPLE" ] && [ $((HOT_CONTROLLER_SAMPLE_EPOCH-HOT_LAST_CONTROLLER_SAMPLE)) -lt "$HOT_REQUIRED_COOLDOWN" ]; then HOT_REGULAR_DUE=0; fi;
    if [ "$HOT_PACKAGE_NAME" != "UNKNOWN" ]; then HOT_SHAPE_KEY=$HOT_PACKAGE_NAME; HOT_SHAPE_SCOPE="mapped-app"; else HOT_SHAPE_KEY="PID_$HOT_PID_VALUE"; HOT_SHAPE_SCOPE="unmapped-process"; fi;
    HOT_SHAPE_ROW=$(awk -v key="$HOT_SHAPE_KEY" '"'"'$1==key {row=$0} END {print row}'"'"' "$HOT_SHAPE_STATE_FILE");
    HOT_LAST_SHAPE_BASIC=0;
    HOT_LAST_SHAPE_CRITICAL=0;
    HOT_LAST_SHAPE_BASIC_ATTEMPT=0;
    HOT_LAST_SHAPE_CRITICAL_ATTEMPT=0;
    if [ -n "$HOT_SHAPE_ROW" ]; then set -- $HOT_SHAPE_ROW; HOT_LAST_SHAPE_BASIC=${2:-0}; HOT_LAST_SHAPE_CRITICAL=${3:-0}; HOT_LAST_SHAPE_BASIC_ATTEMPT=${4:-0}; HOT_LAST_SHAPE_CRITICAL_ATTEMPT=${5:-0}; fi;
    case "$HOT_LAST_SHAPE_BASIC" in ""|*[!0-9]*) HOT_LAST_SHAPE_BASIC=0 ;; esac;
    case "$HOT_LAST_SHAPE_CRITICAL" in ""|*[!0-9]*) HOT_LAST_SHAPE_CRITICAL=0 ;; esac;
    case "$HOT_LAST_SHAPE_BASIC_ATTEMPT" in ""|*[!0-9]*) HOT_LAST_SHAPE_BASIC_ATTEMPT=0 ;; esac;
    case "$HOT_LAST_SHAPE_CRITICAL_ATTEMPT" in ""|*[!0-9]*) HOT_LAST_SHAPE_CRITICAL_ATTEMPT=0 ;; esac;
    HOT_SHAPE_BASIC_DUE=0;
    HOT_SHAPE_CRITICAL_DUE=0;
    HOT_SHAPE_BASIC_RETRY_WAIT=0;
    HOT_SHAPE_CRITICAL_RETRY_WAIT=0;
    if [ "$HOT_SHAPE_ENABLED" -eq 1 ]; then
      HOT_SHAPE_BASIC_ENTITLEMENT_DUE=0;
      HOT_SHAPE_CRITICAL_ENTITLEMENT_DUE=0;
      if [ "$HOT_SHAPE_SAMPLE_SECONDS" -eq 0 ] || [ "$HOT_LAST_SHAPE_BASIC" -eq 0 ] || { [ "$HOT_CONTROLLER_SAMPLE_EPOCH" -ge "$HOT_LAST_SHAPE_BASIC" ] && [ $((HOT_CONTROLLER_SAMPLE_EPOCH-HOT_LAST_SHAPE_BASIC)) -ge "$HOT_SHAPE_SAMPLE_SECONDS" ]; }; then HOT_SHAPE_BASIC_ENTITLEMENT_DUE=1; fi;
      if [ "$HOT_TIER" = "critical" ] && { [ "$HOT_SHAPE_SAMPLE_SECONDS" -eq 0 ] || [ "$HOT_LAST_SHAPE_CRITICAL" -eq 0 ] || { [ "$HOT_CONTROLLER_SAMPLE_EPOCH" -ge "$HOT_LAST_SHAPE_CRITICAL" ] && [ $((HOT_CONTROLLER_SAMPLE_EPOCH-HOT_LAST_SHAPE_CRITICAL)) -ge "$HOT_SHAPE_SAMPLE_SECONDS" ]; }; }; then HOT_SHAPE_CRITICAL_ENTITLEMENT_DUE=1; fi;
      if [ "$HOT_SHAPE_BASIC_ENTITLEMENT_DUE" -eq 1 ]; then
        if [ "$HOT_SHAPE_RETRY_SECONDS" -eq 0 ] || [ "$HOT_LAST_SHAPE_BASIC_ATTEMPT" -eq 0 ] || [ "$HOT_CONTROLLER_SAMPLE_EPOCH" -lt "$HOT_LAST_SHAPE_BASIC_ATTEMPT" ] || [ $((HOT_CONTROLLER_SAMPLE_EPOCH-HOT_LAST_SHAPE_BASIC_ATTEMPT)) -ge "$HOT_SHAPE_RETRY_SECONDS" ]; then HOT_SHAPE_BASIC_DUE=1; else HOT_SHAPE_BASIC_RETRY_WAIT=1; fi;
      fi;
      if [ "$HOT_SHAPE_CRITICAL_ENTITLEMENT_DUE" -eq 1 ]; then
        if [ "$HOT_SHAPE_RETRY_SECONDS" -eq 0 ] || [ "$HOT_LAST_SHAPE_CRITICAL_ATTEMPT" -eq 0 ] || [ "$HOT_CONTROLLER_SAMPLE_EPOCH" -lt "$HOT_LAST_SHAPE_CRITICAL_ATTEMPT" ] || [ $((HOT_CONTROLLER_SAMPLE_EPOCH-HOT_LAST_SHAPE_CRITICAL_ATTEMPT)) -ge "$HOT_SHAPE_RETRY_SECONDS" ]; then HOT_SHAPE_CRITICAL_DUE=1; else HOT_SHAPE_CRITICAL_RETRY_WAIT=1; fi;
      fi;
    fi;
    if [ "$HOT_SHAPE_BASIC_RETRY_WAIT" -eq 1 ] || [ "$HOT_SHAPE_CRITICAL_RETRY_WAIT" -eq 1 ]; then write_chunk_line "HOT_SHAPE_RETRY_WAIT key=$HOT_SHAPE_KEY pid=$HOT_PID_VALUE baseline_wait=$HOT_SHAPE_BASIC_RETRY_WAIT critical_wait=$HOT_SHAPE_CRITICAL_RETRY_WAIT retry_seconds=$HOT_SHAPE_RETRY_SECONDS controller_clock=$HOT_CONTROLLER_SAMPLE_EPOCH" || return 1; fi;
    if [ "$HOT_SHAPE_BASIC_DUE" -eq 1 ] || [ "$HOT_SHAPE_CRITICAL_DUE" -eq 1 ]; then
      case " $HOT_SHAPE_KEYS_SELECTED " in
        *" $HOT_SHAPE_KEY "*) HOT_SHAPE_BASIC_DUE=0; HOT_SHAPE_CRITICAL_DUE=0 ;;
        *) HOT_SHAPE_KEYS_SELECTED="$HOT_SHAPE_KEYS_SELECTED $HOT_SHAPE_KEY" ;;
      esac;
    fi;
    if [ "$HOT_REGULAR_DUE" -eq 0 ] && [ "$HOT_SHAPE_BASIC_DUE" -eq 0 ] && [ "$HOT_SHAPE_CRITICAL_DUE" -eq 0 ]; then
      awk -v pid="$HOT_PID_VALUE" '"'"'$1!=pid {print}'"'"' "$HOT_STATE_FILE" >"$HOT_STATE_TEMP_FILE" || return 1;
      printf "%s %s %s %s %s %s\n" "$HOT_PID_VALUE" "$HOT_LAST_SAMPLE" "$HOT_CLASSIFICATION" "$HOT_PACKAGE_NAME" "$HOT_LAST_CONTROLLER_SAMPLE" "$HOT_PROCESS_NAME" >>"$HOT_STATE_TEMP_FILE" || return 1;
      mv "$HOT_STATE_TEMP_FILE" "$HOT_STATE_FILE" || return 1;
      continue;
    fi;
    if [ "$HOT_SHAPE_BASIC_DUE" -eq 1 ] || [ "$HOT_SHAPE_CRITICAL_DUE" -eq 1 ]; then
      if [ "$HOT_SHAPE_BASIC_DUE" -eq 1 ]; then HOT_LAST_SHAPE_BASIC_ATTEMPT=$HOT_CONTROLLER_SAMPLE_EPOCH; fi;
      if [ "$HOT_SHAPE_CRITICAL_DUE" -eq 1 ]; then HOT_LAST_SHAPE_CRITICAL_ATTEMPT=$HOT_CONTROLLER_SAMPLE_EPOCH; fi;
      awk -v key="$HOT_SHAPE_KEY" '"'"'$1!=key {print}'"'"' "$HOT_SHAPE_STATE_FILE" >"$HOT_SHAPE_STATE_TEMP_FILE" || return 1;
      printf "%s %s %s %s %s\n" "$HOT_SHAPE_KEY" "$HOT_LAST_SHAPE_BASIC" "$HOT_LAST_SHAPE_CRITICAL" "$HOT_LAST_SHAPE_BASIC_ATTEMPT" "$HOT_LAST_SHAPE_CRITICAL_ATTEMPT" >>"$HOT_SHAPE_STATE_TEMP_FILE" || return 1;
      mv "$HOT_SHAPE_STATE_TEMP_FILE" "$HOT_SHAPE_STATE_FILE" || return 1;
      printf "%s %s %s %s %s %s %s %s %s %s %s\n" "$HOT_SHAPE_KEY" "$HOT_PID_VALUE" "$HOT_PACKAGE_NAME" "$HOT_SHAPE_BASIC_DUE" "$HOT_SHAPE_CRITICAL_DUE" "$HOT_LAST_SHAPE_BASIC" "$HOT_LAST_SHAPE_CRITICAL" "$HOT_LAST_SHAPE_BASIC_ATTEMPT" "$HOT_LAST_SHAPE_CRITICAL_ATTEMPT" "$HOT_CONTROLLER_SAMPLE_EPOCH" "$HOT_SHAPE_SCOPE" >>"$HOT_SHAPE_PENDING_FILE" || return 1;
      HOT_SHAPE_OVERRIDE_OCCURRED=1;
      write_chunk_line "HOT_SHAPE_TRIGGER key=$HOT_SHAPE_KEY scope=$HOT_SHAPE_SCOPE pid=$HOT_PID_VALUE package=$HOT_PACKAGE_NAME baseline_due=$HOT_SHAPE_BASIC_DUE critical_due=$HOT_SHAPE_CRITICAL_DUE cooldown_seconds=$HOT_SHAPE_SAMPLE_SECONDS retry_seconds=$HOT_SHAPE_RETRY_SECONDS cpu_percent=$HOT_CPU_VALUE source_epoch=$HOT_SAMPLE_EPOCH state=pending" || return 1;
    fi;
    HOT_STATE_CUTOFF=$((HOT_SAMPLE_EPOCH-86400));
    awk -v pid="$HOT_PID_VALUE" -v cutoff="$HOT_STATE_CUTOFF" '"'"'$1!=pid && $2>=cutoff {print}'"'"' "$HOT_STATE_FILE" >"$HOT_STATE_TEMP_FILE" || return 1;
    printf "%s %s %s %s %s %s\n" "$HOT_PID_VALUE" "$HOT_SAMPLE_EPOCH" "$HOT_CLASSIFICATION" "$HOT_PACKAGE_NAME" "$HOT_CONTROLLER_SAMPLE_EPOCH" "$HOT_PROCESS_NAME" >>"$HOT_STATE_TEMP_FILE" || return 1;
    mv "$HOT_STATE_TEMP_FILE" "$HOT_STATE_FILE" || return 1;
    HOT_PID_LIST="$HOT_PID_LIST $HOT_PID_VALUE";
    HOT_RELAXED_CLASS=0;
    case "$HOT_CLASSIFICATION" in foreground|allowed-exception) HOT_RELAXED_CLASS=1 ;; esac;
    if { [ "$HOT_SHAPE_BASIC_DUE" -eq 1 ] || [ "$HOT_SHAPE_CRITICAL_DUE" -eq 1 ] || { [ "$HOT_REGULAR_DUE" -eq 1 ] && { [ "$HOT_ADAPTIVE_BACKOFF_ACTIVE" -eq 0 ] || [ "$HOT_RELAXED_CLASS" -eq 0 ] || [ "$HOT_TIER" != "surveillance" ]; }; }; } && [ "$HOT_PACKAGE_NAME" != "UNKNOWN" ]; then
      case " $HOT_PACKAGE_LIST " in *" $HOT_PACKAGE_NAME "*) ;; *) HOT_PACKAGE_LIST="$HOT_PACKAGE_LIST $HOT_PACKAGE_NAME" ;; esac;
    fi;
    if [ "$HOT_TIER" = "critical" ] && { [ "$HOT_REGULAR_DUE" -eq 1 ] || [ "$HOT_SHAPE_CRITICAL_DUE" -eq 1 ]; }; then HOT_CRITICAL_PID_LIST="$HOT_CRITICAL_PID_LIST $HOT_PID_VALUE"; fi;
    write_chunk_line "HOT_TRIGGER pid=$HOT_PID_VALUE cpu_percent=$HOT_CPU_VALUE tier=$HOT_TIER classification=$HOT_CLASSIFICATION process=$HOT_PROCESS_NAME package=$HOT_PACKAGE_NAME foreground_package=$HOT_FOREGROUND_PACKAGE routine_candidate=$HOT_ROUTINE_ELIGIBLE regular_due=$HOT_REGULAR_DUE shape_baseline_due=$HOT_SHAPE_BASIC_DUE shape_critical_due=$HOT_SHAPE_CRITICAL_DUE cooldown_seconds=$HOT_REQUIRED_COOLDOWN source_epoch=$HOT_SAMPLE_EPOCH" || return 1;
  done <"$HOT_DUE_FILE";
  write_chunk_line "HOT_FOREGROUND_CLASSIFIER kind=$HOT_CLASSIFIER_KIND status=$HOT_CLASSIFIER_STATUS foreground_package=$HOT_FOREGROUND_PACKAGE" || return 1;
  HOT_PROCESS_COLLECTOR_STATUS="not-run";
  HOT_PACKAGE_COLLECTOR_STATUS="not-run";
  HOT_CRITICAL_COLLECTOR_STATUS="not-run";
  if [ -n "$HOT_PID_LIST" ]; then
    write_chunk_line "===== DYNAMIC HOT PROCESS CONTEXT | $HOT_SAMPLE_WALL | surveillance=${HOT_CPU_THRESHOLD}% deep=${HOT_DEEP_CPU_THRESHOLD}% critical=${HOT_CRITICAL_CPU_THRESHOLD}% | pids=$HOT_PID_LIST =====" || return 1;
    {
      printf "%s\n%s\n" "$REMOTE_FIXED_PREAMBLE" "$REMOTE_UID_GUARD";
      printf "set --";
      for HOT_PID_VALUE in $HOT_PID_LIST; do case "$HOT_PID_VALUE" in *[!0-9]*|"") continue ;; esac; printf " '"'"'%s'"'"'" "$HOT_PID_VALUE"; done;
      printf "\n%s\n" "$REMOTE_HOT_DETAILS_SCRIPT";
    } | run_adb_bounded shell -T /system/bin/sh -s >"$HOT_PROCESS_OUTPUT_FILE" 2>&1;
    HOT_PROCESS_COLLECTOR_STATUS=$?;
    cat "$HOT_PROCESS_OUTPUT_FILE" >&3 || return 1;
    write_chunk_line "TARGET_HOT_PROCESS_COLLECTOR_STATUS=$HOT_PROCESS_COLLECTOR_STATUS" || return 1;
    if [ -s "$DEADLINE_REASON_FILE" ]; then HOT_DEADLINE_TRUNCATED=1; HOT_PACKAGE_LIST=""; HOT_CRITICAL_PID_LIST=""; write_chunk_line "HOT_COLLECTION_TRUNCATED_LOCAL_DEADLINE=$(head -n 1 "$DEADLINE_REASON_FILE") after=process" || return 1; fi;
  fi;
  if [ -n "$HOT_PACKAGE_LIST" ]; then
    {
      printf "%s\n%s\n" "$REMOTE_FIXED_PREAMBLE" "$REMOTE_UID_GUARD";
      printf "set --";
      for HOT_PACKAGE_NAME in $HOT_PACKAGE_LIST; do case "$HOT_PACKAGE_NAME" in *[!A-Za-z0-9._]*|"") continue ;; esac; printf " '"'"'%s'"'"'" "$HOT_PACKAGE_NAME"; done;
      printf "\n%s\n" "$REMOTE_HOT_PACKAGE_SCRIPT";
    } | run_adb_bounded shell -T /system/bin/sh -s >"$HOT_PACKAGE_OUTPUT_FILE" 2>&1;
    HOT_PACKAGE_COLLECTOR_STATUS=$?;
    cat "$HOT_PACKAGE_OUTPUT_FILE" >&3 || return 1;
    write_chunk_line "TARGET_HOT_PACKAGE_COLLECTOR_STATUS=$HOT_PACKAGE_COLLECTOR_STATUS" || return 1;
    if [ -s "$DEADLINE_REASON_FILE" ]; then HOT_DEADLINE_TRUNCATED=1; HOT_CRITICAL_PID_LIST=""; write_chunk_line "HOT_COLLECTION_TRUNCATED_LOCAL_DEADLINE=$(head -n 1 "$DEADLINE_REASON_FILE") after=package" || return 1; fi;
  fi;
  if [ -n "$HOT_CRITICAL_PID_LIST" ]; then
    {
      printf "%s\n%s\n" "$REMOTE_FIXED_PREAMBLE" "$REMOTE_UID_GUARD";
      printf "set --";
      for HOT_PID_VALUE in $HOT_CRITICAL_PID_LIST; do case "$HOT_PID_VALUE" in *[!0-9]*|"") continue ;; esac; printf " '"'"'%s'"'"'" "$HOT_PID_VALUE"; done;
      printf "\n%s\n" "$REMOTE_HOT_CRITICAL_SCRIPT";
    } | run_adb_bounded shell -T /system/bin/sh -s >"$HOT_CRITICAL_OUTPUT_FILE" 2>&1;
    HOT_CRITICAL_COLLECTOR_STATUS=$?;
    cat "$HOT_CRITICAL_OUTPUT_FILE" >&3 || return 1;
    write_chunk_line "TARGET_HOT_CRITICAL_COLLECTOR_STATUS=$HOT_CRITICAL_COLLECTOR_STATUS" || return 1;
    if [ -s "$DEADLINE_REASON_FILE" ]; then HOT_DEADLINE_TRUNCATED=1; write_chunk_line "HOT_COLLECTION_TRUNCATED_LOCAL_DEADLINE=$(head -n 1 "$DEADLINE_REASON_FILE") after=critical" || return 1; fi;
  fi;
  HOT_SHAPE_COMPLETION_EPOCH=$(date +%s);
  while IFS='"'"' '"'"' read -r HOT_SHAPE_KEY HOT_PID_VALUE HOT_PACKAGE_NAME HOT_SHAPE_BASIC_DUE HOT_SHAPE_CRITICAL_DUE HOT_LAST_SHAPE_BASIC HOT_LAST_SHAPE_CRITICAL HOT_LAST_SHAPE_BASIC_ATTEMPT HOT_LAST_SHAPE_CRITICAL_ATTEMPT HOT_SHAPE_ATTEMPT_EPOCH HOT_SHAPE_SCOPE; do
    [ -n "$HOT_SHAPE_KEY" ] || continue;
    HOT_PROCESS_COMPLETE=0;
    HOT_PACKAGE_COMPLETE=0;
    HOT_CRITICAL_COMPLETE=0;
    if grep -Fqx "HOT_PID_SCAN_COMPLETE=$HOT_PID_VALUE" "$HOT_PROCESS_OUTPUT_FILE"; then HOT_PROCESS_COMPLETE=1; fi;
    if [ "$HOT_PACKAGE_NAME" = "UNKNOWN" ]; then HOT_PACKAGE_COMPLETE=1;
    elif grep -Fqx "HOT_PACKAGE_SCAN_COMPLETE=$HOT_PACKAGE_NAME" "$HOT_PACKAGE_OUTPUT_FILE"; then HOT_PACKAGE_COMPLETE=1;
    fi;
    if grep -Fqx "HOT_CRITICAL_SCAN_COMPLETE=$HOT_PID_VALUE" "$HOT_CRITICAL_OUTPUT_FILE"; then HOT_CRITICAL_COMPLETE=1; fi;
    HOT_BASELINE_RESULT="not-due";
    HOT_CRITICAL_RESULT="not-due";
    HOT_SHAPE_STATE_CHANGED=0;
    if [ "$HOT_SHAPE_BASIC_DUE" -eq 1 ]; then
      HOT_LAST_SHAPE_BASIC_ATTEMPT=$HOT_SHAPE_COMPLETION_EPOCH;
      HOT_SHAPE_STATE_CHANGED=1;
      if [ "$HOT_DEADLINE_TRUNCATED" -eq 0 ] && [ "$HOT_PROCESS_COMPLETE" -eq 1 ] && [ "$HOT_PACKAGE_COMPLETE" -eq 1 ]; then HOT_LAST_SHAPE_BASIC=$HOT_SHAPE_COMPLETION_EPOCH; HOT_BASELINE_RESULT="complete"; HOT_SHAPE_STATE_CHANGED=1;
      else HOT_BASELINE_RESULT="retry";
      fi;
    fi;
    if [ "$HOT_SHAPE_CRITICAL_DUE" -eq 1 ]; then
      HOT_LAST_SHAPE_CRITICAL_ATTEMPT=$HOT_SHAPE_COMPLETION_EPOCH;
      HOT_SHAPE_STATE_CHANGED=1;
      if [ "$HOT_DEADLINE_TRUNCATED" -eq 0 ] && [ "$HOT_PROCESS_COMPLETE" -eq 1 ] && [ "$HOT_PACKAGE_COMPLETE" -eq 1 ] && [ "$HOT_CRITICAL_COMPLETE" -eq 1 ]; then HOT_LAST_SHAPE_CRITICAL=$HOT_SHAPE_COMPLETION_EPOCH; HOT_CRITICAL_RESULT="complete"; HOT_SHAPE_STATE_CHANGED=1;
      else HOT_CRITICAL_RESULT="retry";
      fi;
    fi;
    if [ "$HOT_SHAPE_STATE_CHANGED" -eq 1 ]; then
      awk -v key="$HOT_SHAPE_KEY" '"'"'$1!=key {print}'"'"' "$HOT_SHAPE_STATE_FILE" >"$HOT_SHAPE_STATE_TEMP_FILE" || return 1;
      printf "%s %s %s %s %s\n" "$HOT_SHAPE_KEY" "$HOT_LAST_SHAPE_BASIC" "$HOT_LAST_SHAPE_CRITICAL" "$HOT_LAST_SHAPE_BASIC_ATTEMPT" "$HOT_LAST_SHAPE_CRITICAL_ATTEMPT" >>"$HOT_SHAPE_STATE_TEMP_FILE" || return 1;
      mv "$HOT_SHAPE_STATE_TEMP_FILE" "$HOT_SHAPE_STATE_FILE" || return 1;
    fi;
    write_chunk_line "HOT_SHAPE_RESULT key=$HOT_SHAPE_KEY scope=$HOT_SHAPE_SCOPE pid=$HOT_PID_VALUE package=$HOT_PACKAGE_NAME baseline=$HOT_BASELINE_RESULT critical=$HOT_CRITICAL_RESULT process_complete=$HOT_PROCESS_COMPLETE package_complete=$HOT_PACKAGE_COMPLETE critical_complete=$HOT_CRITICAL_COMPLETE attempt_epoch=$HOT_SHAPE_ATTEMPT_EPOCH completion_epoch=$HOT_SHAPE_COMPLETION_EPOCH" || return 1;
  done <"$HOT_SHAPE_PENDING_FILE";
  fi;
  HOT_COLLECTION_END_EPOCH=$(date +%s);
  HOT_COLLECTION_END_MILLIS=$(controller_millis);
  HOT_COLLECTION_ELAPSED_MILLIS=$((HOT_COLLECTION_END_MILLIS-HOT_COLLECTION_START_MILLIS));
  [ "$HOT_COLLECTION_ELAPSED_MILLIS" -ge 0 ] || HOT_COLLECTION_ELAPSED_MILLIS=0;
  HOT_COLLECTION_ELAPSED_SECONDS=$(awk -v millis="$HOT_COLLECTION_ELAPSED_MILLIS" '"'"'BEGIN {printf "%.3f", millis/1000}'"'"');
  HOT_SOURCE_INTERVAL_MILLIS=0;
  if [ "$HOT_NEXT_SAMPLE_EPOCH" -gt "$HOT_SAMPLE_EPOCH" ]; then
    HOT_SOURCE_INTERVAL_MILLIS=$(((HOT_NEXT_SAMPLE_EPOCH-HOT_SAMPLE_EPOCH)*1000));
    HOT_LAST_SOURCE_INTERVAL_MILLIS=$HOT_SOURCE_INTERVAL_MILLIS;
  fi;
  HOT_OBSERVATION_INTERVAL_SECONDS=$(awk -v millis="$HOT_OBSERVATION_INTERVAL_MILLIS" '"'"'BEGIN {printf "%.3f", millis/1000}'"'"');
  HOT_LAST_COLLECTION_CONTROLLER_EPOCH=$HOT_COLLECTION_START_EPOCH;
  HOT_LAST_COLLECTION_CONTROLLER_MILLIS=$HOT_COLLECTION_START_MILLIS;
  HOT_LAST_COLLECTION_ELAPSED_MILLIS=$HOT_COLLECTION_ELAPSED_MILLIS;
  HOT_LAST_OBSERVER_DUTY_PERCENT=$HOT_PRIOR_OBSERVER_DUTY_PERCENT;
  write_chunk_line "HOT_COLLECTION_OBSERVER current_elapsed_seconds=$HOT_COLLECTION_ELAPSED_SECONDS current_elapsed_millis=$HOT_COLLECTION_ELAPSED_MILLIS prior_elapsed_millis=$HOT_PRIOR_COLLECTION_ELAPSED_MILLIS matched_controller_interval_seconds=$HOT_OBSERVATION_INTERVAL_SECONDS prior_duty_percent=$HOT_PRIOR_OBSERVER_DUTY_PERCENT source_interval_millis=$HOT_SOURCE_INTERVAL_MILLIS routine_budget_percent=$HOT_OBSERVER_BUDGET_PERCENT decision=$HOT_BUDGET_DECISION adaptive_min_period_seconds=$HOT_ADAPTIVE_MIN_PERIOD_SECONDS backoff_until_controller_epoch=$HOT_ADAPTIVE_BACKOFF_UNTIL_EPOCH rate_limit_mode=$HOT_RATE_LIMIT_MODE shape_override=$HOT_SHAPE_OVERRIDE_OCCURRED" || return 1;
  write_chunk_line "===== DYNAMIC HOT PROCESS CONTEXT COMPLETE =====";
};
find_stop_reason() {
  CHECK_EPOCH="$1";
  STOP_REASON="";
  if [ "$MAX_ELAPSED_SECONDS" -gt 0 ] && [ $((CHECK_EPOCH-CAPTURE_START_EPOCH)) -ge "$MAX_ELAPSED_SECONDS" ]; then STOP_REASON="MAX_ELAPSED_SECONDS";
  elif [ "$STOP_AT_EPOCH" -gt 0 ] && [ "$CHECK_EPOCH" -ge "$STOP_AT_EPOCH" ]; then STOP_REASON="STOP_AT_TIME";
  elif [ "$MAX_SAVED_REPORTS" -gt 0 ] && [ "$SESSION_SAVED_REPORTS" -ge "$MAX_SAVED_REPORTS" ]; then STOP_REASON="MAX_SAVED_REPORTS";
  elif [ "$MAX_SOURCE_REPORTS" -gt 0 ] && [ "$SESSION_SOURCE_REPORTS" -ge "$MAX_SOURCE_REPORTS" ]; then STOP_REASON="MAX_SOURCE_REPORTS";
  elif [ "$MAX_CAPTURE_BYTES" -gt 0 ]; then
    measure_session_output_bytes;
    if [ "$SESSION_MEASURED_OUTPUT_BYTES" -ge "$MAX_CAPTURE_BYTES" ]; then STOP_REASON="MAX_CAPTURE_BYTES"; fi;
  fi;
  [ -n "$STOP_REASON" ];
};
deadline_worker() {
  trap - EXIT;
  DEADLINE_DELAY="$1";
  DEADLINE_REASON="$2";
  DEADLINE_SLEEP_PID="";
  trap '"'"'if [ -n "$DEADLINE_SLEEP_PID" ]; then kill "$DEADLINE_SLEEP_PID" 2>/dev/null; wait "$DEADLINE_SLEEP_PID" 2>/dev/null; fi; exit 0'"'"' HUP INT TERM;
  sleep "$DEADLINE_DELAY" &
  DEADLINE_SLEEP_PID=$!;
  wait "$DEADLINE_SLEEP_PID" 2>/dev/null || exit 0;
  printf "%s\n" "$DEADLINE_REASON" >"$DEADLINE_REASON_FILE" 2>/dev/null;
  printf "%s%s\n" "$DEADLINE_MARKER_PREFIX" "$DEADLINE_REASON" >"$TOP_PIPE" 2>/dev/null;
};
start_deadline_watchdog() {
  deadline_worker "$1" "$2" &
  NEW_WATCHDOG_PID=$!;
};
stop_watchdog() {
  WATCHDOG_TO_STOP="$1";
  if [ -n "$WATCHDOG_TO_STOP" ]; then kill "$WATCHDOG_TO_STOP" 2>/dev/null; wait "$WATCHDOG_TO_STOP" 2>/dev/null; fi;
};
cleanup_profile() {
  CLEANUP_ENTRY_STATUS=$?;
  trap - EXIT HUP INT TERM;
  stop_watchdog "$UNTIL_WATCHDOG_PID";
  stop_watchdog "$DURATION_WATCHDOG_PID";
  ADB_CLIENT_STATUS="";
  if [ -n "$TOP_PID" ]; then
    case "$STOP_REASON" in
      TOP_ITERATIONS_COMPLETE|TOP_SOURCE_FAILED_STATUS_*|TOP_SOURCE_ENDED_UNEXPECTEDLY|INVALID_TOP_END_STATUS|ADB_TOP_STREAM_LOST)
        wait "$TOP_PID" 2>/dev/null; ADB_CLIENT_STATUS=$?;
        ;;
      *)
        kill "$TOP_PID" 2>/dev/null;
        wait "$TOP_PID" 2>/dev/null; ADB_CLIENT_STATUS=$?;
        ;;
    esac;
    TOP_PID="";
  fi;
  if [ "$TOP_STREAM_END_SEEN" -eq 1 ] && [ "${TOP_REMOTE_STATUS:-1}" -eq 0 ] && [ -n "$ADB_CLIENT_STATUS" ] && [ "$ADB_CLIENT_STATUS" -ne 0 ]; then STOP_REASON="ADB_CLIENT_FAILED_STATUS_$ADB_CLIENT_STATUS"; RUN_STATUS=1; fi;
  if [ "$LAST_FRAME_EPOCH" -gt 0 ]; then CLEANUP_EPOCH=$LAST_FRAME_EPOCH; else CLEANUP_EPOCH=$(date +%s); fi;
  [ -n "$STOP_REASON" ] || STOP_REASON="CONTROLLER_EXITED";
  FINALIZE_SUCCEEDED=1;
  if [ -s "$ADB_STDERR_FILE" ] && [ "$FILE_IS_OPEN" -eq 1 ]; then
    ADB_STDERR_BYTES=$(wc -c <"$ADB_STDERR_FILE");
    write_chunk_line "===== ADB TRANSPORT STDERR | total_bytes=$ADB_STDERR_BYTES | first_bytes=262144 =====" || FINALIZE_SUCCEEDED=0;
    head -c 262144 "$ADB_STDERR_FILE" >&3 2>/dev/null || FINALIZE_SUCCEEDED=0;
    write_chunk_line "" || FINALIZE_SUCCEEDED=0;
    write_chunk_line "===== ADB TRANSPORT STDERR COMPLETE =====" || FINALIZE_SUCCEEDED=0;
    ADB_STDERR_INCLUDED=1;
  fi;
  if [ "$FILE_IS_OPEN" -eq 1 ]; then finish_timestamped_file "$STOP_REASON" "$CLEANUP_EPOCH" || FINALIZE_SUCCEEDED=0; fi;
  close_chunk;
  close_report_file;
  if [ -s "$ADB_STDERR_FILE" ] && [ "$ADB_STDERR_INCLUDED" -eq 0 ] && [ "$RUN_STATUS" -ne 0 ]; then
    printf "WARNING: ADB transport diagnostics remain in private recovery directory %s\n" "$WORK_DIR" >&2;
    FINALIZE_SUCCEEDED=0;
  fi;
  if [ "$FINALIZE_SUCCEEDED" -eq 1 ]; then
    rm -f "$CHUNK_FILE" "$CONTEXT_FILE" "$TOP_PIPE" "$TOP_ARGUMENT_FILE" "$CONTEXT_PROCESS_LIST_FILE" "$THREAD_PROCESS_LIST_FILE" "$REMOTE_LAUNCH_FILE" "$ADB_STDERR_FILE" "$METADATA_FILE" "$DEADLINE_REASON_FILE" "$HOT_CANDIDATE_FILE" "$HOT_SELECTED_FILE" "$HOT_SELECTED_UNSORTED_FILE" "$HOT_DUE_FILE" "$HOT_STATE_FILE" "$HOT_SHAPE_STATE_FILE" "$HOT_SHAPE_PENDING_FILE" "$HOT_PROCESS_OUTPUT_FILE" "$HOT_PACKAGE_OUTPUT_FILE" "$HOT_CRITICAL_OUTPUT_FILE" "$HOT_STATE_TEMP_FILE" "$HOT_SHAPE_STATE_TEMP_FILE" "$HOT_CLASSIFICATION_FILE" "$HOT_PACKAGE_REGISTRY_FILE" "$HOT_PACKAGE_REGISTRY_OUTPUT_FILE" "$HOT_PACKAGE_REGISTRY_TEMP_FILE" 2>/dev/null;
    remove_private_work_dir 2>/dev/null || { printf "WARNING: private work directory could not be removed: %s\n" "$WORK_DIR" >&2; FINALIZE_SUCCEEDED=0; RUN_STATUS=1; };
  else
    printf "WARNING: final file flush failed; private recovery data remains in %s\n" "$WORK_DIR" >&2;
    RUN_STATUS=1;
  fi;
  measure_session_output_bytes;
  if [ "$FINALIZE_SUCCEEDED" -eq 1 ] && [ -e "$WORK_DIR" ]; then remove_private_work_dir 2>/dev/null || { printf "WARNING: final private work directory removal failed: %s\n" "$WORK_DIR" >&2; RUN_STATUS=1; }; fi;
  printf "PROFILE STOPPED: engine=controller reason=%s status=%s saved_reports=%s source_reports=%s output_bytes=%s\n" "$STOP_REASON" "$RUN_STATUS" "$SESSION_SAVED_REPORTS" "$SESSION_SOURCE_REPORTS" "$SESSION_MEASURED_OUTPUT_BYTES";
  FINAL_EXIT_STATUS=$CLEANUP_ENTRY_STATUS;
  if [ "$RUN_STATUS" -ne 0 ]; then FINAL_EXIT_STATUS=$RUN_STATUS; fi;
  exit "$FINAL_EXIT_STATUS";
};
trap cleanup_profile EXIT;
handle_controller_signal() { STOP_REASON="SIGNAL"; RUN_STATUS=130; exit 130; };
trap handle_controller_signal HUP INT TERM;
set -- -b;
if [ -n "$TOP_DELAY" ] && [ "$TOP_DELAY" != "native" ]; then set -- "$@" -d "$TOP_DELAY"; fi;
if [ "$TOP_ROWS" != "all" ]; then set -- "$@" -m "$TOP_ROWS"; fi;
if [ -n "$TOP_FIELDS" ]; then set -- "$@" -o "$TOP_FIELDS"; fi;
while IFS= read -r EXTRA_TOP_ARGUMENT; do set -- "$@" "$EXTRA_TOP_ARGUMENT"; done <"$TOP_ARGUMENT_FILE";
open_chunk || { STOP_REASON="PRIVATE_CHUNK_OPEN_FAILED"; printf "ERROR: cannot open private chunk %s\n" "$CHUNK_FILE" >&2; exit 1; };
REMOTE_TOP_SCRIPT='"'"'set -o pipefail || exit 125;
nice -n 10 /system/bin/top "$@" 2>&1 | while IFS= read -r TOP_SOURCE_LINE; do
  case "$TOP_SOURCE_LINE" in
    Tasks:*|Threads:*) printf "%s%s\n" "$FRAME_MARKER_PREFIX" "$(date "+%s|%Y%m%d|%Y%m%d_%H%M%S|%F %T %z")" ;;
  esac;
  printf "%s\n" "$TOP_SOURCE_LINE";
done;
REMOTE_TOP_STATUS=$?;
printf "%s%s\n" "$END_MARKER_PREFIX" "$REMOTE_TOP_STATUS";
exit "$REMOTE_TOP_STATUS";'"'"';
{
  printf "FRAME_MARKER_PREFIX='"'"'%s'"'"'\nEND_MARKER_PREFIX='"'"'%s'"'"'\n" "$FRAME_MARKER_PREFIX" "$END_MARKER_PREFIX";
  printf "%s\n%s\n" "$REMOTE_FIXED_PREAMBLE" "$REMOTE_UID_GUARD";
  printf "set --";
  for TARGET_TOP_ARGUMENT in "$@"; do printf " '"'"'%s'"'"'" "$TARGET_TOP_ARGUMENT"; done;
  printf "\n%s\n" "$REMOTE_TOP_SCRIPT";
} >"$REMOTE_LAUNCH_FILE" || { STOP_REASON="PRIVATE_LAUNCHER_WRITE_FAILED"; exit 1; };
if [ -n "$ADB_SERIAL" ]; then
  "$ADB_PATH" -s "$ADB_SERIAL" shell -T /system/bin/sh -s <"$REMOTE_LAUNCH_FILE" >"$TOP_PIPE" 2>"$ADB_STDERR_FILE" &
else
  "$ADB_PATH" shell -T /system/bin/sh -s <"$REMOTE_LAUNCH_FILE" >"$TOP_PIPE" 2>"$ADB_STDERR_FILE" &
fi;
TOP_PID=$!;
if [ "$STOP_AT_EPOCH" -gt 0 ]; then
  CONTROLLER_NOW_EPOCH=$(date +%s);
  UNTIL_DELAY=$((STOP_AT_EPOCH-CONTROLLER_NOW_EPOCH));
  [ "$UNTIL_DELAY" -gt 0 ] || UNTIL_DELAY=0;
  start_deadline_watchdog "$UNTIL_DELAY" "STOP_AT_TIME";
  UNTIL_WATCHDOG_PID=$NEW_WATCHDOG_PID;
fi;
while IFS= read -r TOP_LINE; do
  if [ -s "$DEADLINE_REASON_FILE" ]; then
    DEADLINE_REASON=$(head -n 1 "$DEADLINE_REASON_FILE");
    if [ -s "$HOT_CANDIDATE_FILE" ]; then write_chunk_line "HOT_COLLECTION_SKIPPED reason=deadline-reached pending_candidates=yes" || { STOP_REASON="PRIVATE_WRITE_FAILED"; RUN_STATUS=1; break; }; : >"$HOT_CANDIDATE_FILE"; fi;
    case "$DEADLINE_REASON" in MAX_ELAPSED_SECONDS|STOP_AT_TIME) STOP_REASON="$DEADLINE_REASON"; RUN_STATUS=0 ;; *) STOP_REASON="INVALID_LOCAL_DEADLINE_MARKER"; RUN_STATUS=1 ;; esac;
    break;
  fi;
  case "$TOP_LINE" in
    "$DEADLINE_MARKER_PREFIX"*)
      DEADLINE_REASON=${TOP_LINE#"$DEADLINE_MARKER_PREFIX"};
      if [ -s "$HOT_CANDIDATE_FILE" ]; then write_chunk_line "HOT_COLLECTION_SKIPPED reason=deadline-reached pending_candidates=yes" || { STOP_REASON="PRIVATE_WRITE_FAILED"; RUN_STATUS=1; break; }; : >"$HOT_CANDIDATE_FILE"; fi;
      case "$DEADLINE_REASON" in MAX_ELAPSED_SECONDS|STOP_AT_TIME) STOP_REASON="$DEADLINE_REASON"; RUN_STATUS=0 ;; *) STOP_REASON="INVALID_LOCAL_DEADLINE_MARKER"; RUN_STATUS=1 ;; esac;
      break;
      ;;
    "$FRAME_MARKER_PREFIX"*)
      FRAME_INFO=${TOP_LINE#"$FRAME_MARKER_PREFIX"};
      FRAME_EPOCH=${FRAME_INFO%%|*};
      FRAME_REMAINDER=${FRAME_INFO#*|};
      FRAME_DAY=${FRAME_REMAINDER%%|*};
      FRAME_REMAINDER=${FRAME_REMAINDER#*|};
      FRAME_FILE_TIMESTAMP=${FRAME_REMAINDER%%|*};
      FRAME_WALL=${FRAME_REMAINDER#*|};
      case "$FRAME_EPOCH" in ""|*[!0-9]*) STOP_REASON="INVALID_TARGET_FRAME_EPOCH"; break ;; esac;
      [ "${#FRAME_EPOCH}" -le 12 ] || { STOP_REASON="INVALID_TARGET_FRAME_EPOCH"; break; };
      case "$FRAME_DAY" in *[!0-9]*) STOP_REASON="INVALID_TARGET_FRAME_DAY"; break ;; esac;
      [ "${#FRAME_DAY}" -eq 8 ] || { STOP_REASON="INVALID_TARGET_FRAME_DAY"; break; };
      FRAME_TIMESTAMP_DAY=${FRAME_FILE_TIMESTAMP%%_*};
      FRAME_TIMESTAMP_TIME=${FRAME_FILE_TIMESTAMP#*_};
      case "$FRAME_TIMESTAMP_DAY$FRAME_TIMESTAMP_TIME" in *[!0-9]*) STOP_REASON="INVALID_TARGET_FILE_TIMESTAMP"; break ;; esac;
      [ "$FRAME_TIMESTAMP_DAY" = "$FRAME_DAY" ] && [ "${#FRAME_TIMESTAMP_TIME}" -eq 6 ] || { STOP_REASON="INVALID_TARGET_FILE_TIMESTAMP"; break; };
      if [ "$LAST_FRAME_EPOCH" -gt 0 ]; then sample_hot_processes "$LAST_FRAME_EPOCH" "$LAST_FRAME_WALL" "$FRAME_EPOCH" || { STOP_REASON="PRIVATE_WRITE_FAILED"; break; }; fi;
      LAST_FRAME_EPOCH=$FRAME_EPOCH;
      LAST_FRAME_WALL=$FRAME_WALL;
      if [ "$CAPTURE_START_EPOCH" -eq 0 ]; then
        CAPTURE_START_EPOCH=$FRAME_EPOCH;
        if [ "$MAX_ELAPSED_SECONDS" -gt 0 ]; then start_deadline_watchdog "$MAX_ELAPSED_SECONDS" "MAX_ELAPSED_SECONDS"; DURATION_WATCHDOG_PID=$NEW_WATCHDOG_PID; fi;
      fi;
      FLUSH_OCCURRED=0;
      if [ "$FILE_IS_OPEN" -eq 1 ]; then
        if [ "$FIRST_REPORT_IS_PENDING" -eq 1 ]; then
          flush_chunk "FIRST_COMPLETE_REPORT" "$FRAME_EPOCH" || { STOP_REASON="OUTPUT_WRITE_FAILED"; break; };
          FIRST_REPORT_IS_PENDING=0;
          FLUSH_OCCURRED=1;
        elif { [ "$FLUSH_SECONDS" -gt 0 ] && [ $((FRAME_EPOCH-LAST_FLUSH_EPOCH)) -ge "$FLUSH_SECONDS" ]; } || { [ "$FLUSH_EVERY_REPORTS" -gt 0 ] && [ $((SESSION_SAVED_REPORTS-SAVED_REPORTS_AT_LAST_FLUSH)) -ge "$FLUSH_EVERY_REPORTS" ]; }; then
          flush_chunk "CONFIGURED_CHECKPOINT" "$FRAME_EPOCH" || { STOP_REASON="OUTPUT_WRITE_FAILED"; break; };
          FLUSH_OCCURRED=1;
        fi;
      fi;
      if find_stop_reason "$FRAME_EPOCH"; then break; fi;
      FILE_WAS_ROTATED=0;
      if [ "$FILE_IS_OPEN" -eq 0 ]; then
        open_timestamped_file "$FRAME_DAY" "$FRAME_FILE_TIMESTAMP" "$FRAME_WALL" "$FRAME_EPOCH" || { STOP_REASON="OUTPUT_OPEN_FAILED"; break; };
        FILE_WAS_ROTATED=1;
      else
        ACTIVE_FILE_NAME=${REPORT_FILE##*/};
        case "$ACTIVE_FILE_NAME" in
          "$FILE_PREFIX"_"$FRAME_DAY"_*) ;;
          *)
            finish_timestamped_file "DAY_CHANGED_TO_$FRAME_DAY" "$FRAME_EPOCH" || { STOP_REASON="OUTPUT_WRITE_FAILED"; break; };
            open_timestamped_file "$FRAME_DAY" "$FRAME_FILE_TIMESTAMP" "$FRAME_WALL" "$FRAME_EPOCH" || { STOP_REASON="OUTPUT_OPEN_FAILED"; break; };
            FILE_WAS_ROTATED=1;
            ;;
        esac;
      fi;
      if [ "$FLUSH_OCCURRED" -eq 1 ] && [ "$FILE_WAS_ROTATED" -eq 0 ]; then start_context_capture "AFTER_CHECKPOINT" 0 || { STOP_REASON="CONTEXT_START_FAILED"; break; }; fi;
      if [ "$THREAD_SNAPSHOT_SECONDS" -gt 0 ] && [ "$FRAME_EPOCH" -ge "$NEXT_THREAD_SNAPSHOT_EPOCH" ]; then
        sample_watched_threads "$FRAME_WALL" || { STOP_REASON="PRIVATE_WRITE_FAILED"; break; };
        NEXT_THREAD_SNAPSHOT_EPOCH=$((FRAME_EPOCH+THREAD_SNAPSHOT_SECONDS));
      fi;
      SESSION_SOURCE_REPORTS=$((SESSION_SOURCE_REPORTS+1));
      FILE_SOURCE_REPORTS=$((FILE_SOURCE_REPORTS+1));
      KEEP_CURRENT_REPORT=0;
      if [ "$FILE_WAS_ROTATED" -eq 1 ]; then
        KEEP_CURRENT_REPORT=1;
      elif [ "$CAPTURE_MODE" = "EVERY_TIME" ]; then
        if [ "$LAST_SAVED_REPORT_EPOCH" -eq 0 ] || [ $((FRAME_EPOCH-LAST_SAVED_REPORT_EPOCH)) -ge "$SAVE_INTERVAL_SECONDS" ]; then KEEP_CURRENT_REPORT=1; fi;
      elif [ $(((FILE_SOURCE_REPORTS-1)%SAVE_EVERY_REPORTS)) -eq 0 ]; then
        KEEP_CURRENT_REPORT=1;
      fi;
      if [ "$KEEP_CURRENT_REPORT" -eq 1 ]; then
        SESSION_SAVED_REPORTS=$((SESSION_SAVED_REPORTS+1));
        FILE_SAVED_REPORTS=$((FILE_SAVED_REPORTS+1));
        LAST_SAVED_REPORT_EPOCH=$FRAME_EPOCH;
        REPORT_MARKER="===== TOP REPORT session=$SESSION_ID file_report=$FILE_SAVED_REPORTS source_report=$SESSION_SOURCE_REPORTS | $FRAME_WALL | epoch=$FRAME_EPOCH =====";
        write_chunk_line "" || { STOP_REASON="PRIVATE_WRITE_FAILED"; break; };
        write_chunk_line "$REPORT_MARKER" || { STOP_REASON="PRIVATE_WRITE_FAILED"; break; };
      fi;
      continue;
      ;;
    "$END_MARKER_PREFIX"*)
      if [ "$LAST_FRAME_EPOCH" -gt 0 ]; then sample_hot_processes "$LAST_FRAME_EPOCH" "$LAST_FRAME_WALL" 0 || { STOP_REASON="PRIVATE_WRITE_FAILED"; RUN_STATUS=1; break; }; fi;
      TOP_REMOTE_STATUS=${TOP_LINE#"$END_MARKER_PREFIX"};
      case "$TOP_REMOTE_STATUS" in ""|*[!0-9]*) STOP_REASON="INVALID_TOP_END_STATUS"; RUN_STATUS=1 ;; *)
        TOP_STREAM_END_SEEN=1;
        if [ "$TOP_REMOTE_STATUS" -ne 0 ]; then STOP_REASON="TOP_SOURCE_FAILED_STATUS_$TOP_REMOTE_STATUS"; RUN_STATUS=1;
        elif [ "$TOP_END_EXPECTED" -eq 1 ]; then STOP_REASON="TOP_ITERATIONS_COMPLETE"; RUN_STATUS=0;
        else STOP_REASON="TOP_SOURCE_ENDED_UNEXPECTEDLY"; RUN_STATUS=1;
        fi;
      esac;
      break;
      ;;
  esac;
  record_hot_top_line "$TOP_LINE";
  if [ "$KEEP_CURRENT_REPORT" -eq 1 ]; then
    write_chunk_line "$TOP_LINE" || { STOP_REASON="PRIVATE_WRITE_FAILED"; break; };
  elif [ "$FILE_IS_OPEN" -eq 0 ] && [ -n "$TOP_LINE" ]; then
    PRE_FRAME_LINE_COUNT=$((PRE_FRAME_LINE_COUNT+1));
    if [ "$PRE_FRAME_LINE_COUNT" -eq 1 ]; then printf "NOTICE: target emitted data before the first recognized top report; raw bytes are not echoed to the terminal.\n" >&2; fi;
  fi;
done <"$TOP_PIPE";
if [ -z "$STOP_REASON" ]; then
  if [ "$TOP_STREAM_END_SEEN" -eq 0 ]; then STOP_REASON="ADB_TOP_STREAM_LOST"; RUN_STATUS=1; fi;
fi;
case "$STOP_REASON" in
  MAX_ELAPSED_SECONDS|STOP_AT_TIME|MAX_SAVED_REPORTS|MAX_SOURCE_REPORTS|MAX_CAPTURE_BYTES|TOP_ITERATIONS_COMPLETE) RUN_STATUS=0 ;;
  "") STOP_REASON="CONTROLLER_COMPLETED" ;;
  SIGNAL) RUN_STATUS=130 ;;
  *) [ "$RUN_STATUS" -ne 0 ] || RUN_STATUS=1 ;;
esac;
exit "$RUN_STATUS";
';
  LEGACY_REMOTE_SCRIPT='OUTPUT_DIR="/sdcard/Download";
FILE_PREFIX="phone_top";
TOP_DELAY="";
TOP_PATH="/system/bin/top";
CAPTURE_MODE="";
SAVE_EVERY_REPORTS=1;
SAVE_INTERVAL_SECONDS=0;
FLUSH_SECONDS=300;
FLUSH_EVERY_REPORTS=0;
MAX_ELAPSED_SECONDS=0;
STOP_AT_EPOCH=0;
MAX_CAPTURE_BYTES=0;
MAX_SAVED_REPORTS=0;
MAX_SOURCE_REPORTS=0;
TOP_ROWS=50;
TOP_FIELDS="PID,USER,PR,NI,VIRT,RES,SHR,S,%CPU,%MEM,NAME:64,TIME+";
CONTEXT_ENABLED=1;
THREAD_SNAPSHOT_SECONDS=60;
WATCH_REGEX="org\.telegram\.messenger|com\.android\.vending|com\.google\.android\.apps\.photos|com\.google\.android\.providers\.media\.module|com\.google\.android\.gms|com\.xiaomi\.xmsf|com\.miui\.|hotspotshield|system_server|surfaceflinger|media\.swcodec|audioserver";
SESSION_ID="$(date +%Y%m%d_%H%M%S)_$$";
WORK_DIR="/data/local/tmp/.phone_top_profile_$$";
TOP_PIPE="$WORK_DIR/top_stream.pipe";
CHUNK_FILE="$WORK_DIR/current_chunk.txt";
CONTEXT_FILE="$WORK_DIR/latest_context.txt";
TOP_ARGUMENT_FILE="$WORK_DIR/top_arguments.txt";
export LC_ALL=C;
umask 077;
mkdir "$WORK_DIR" || exit 1;
: >"$TOP_ARGUMENT_FILE" || exit 1;
is_unsigned_integer() {
  case "$1" in
    ""|*[!0-9]*) return 1 ;;
    *) return 0 ;;
  esac;
};
is_positive_decimal() {
  DECIMAL_TEXT="$1";
  DECIMAL_WHOLE="";
  DECIMAL_FRACTION="";
  case "$DECIMAL_TEXT" in
    *.*)
      DECIMAL_WHOLE=${DECIMAL_TEXT%%.*};
      DECIMAL_FRACTION=${DECIMAL_TEXT#*.};
      is_unsigned_integer "$DECIMAL_WHOLE" && is_unsigned_integer "$DECIMAL_FRACTION" || return 1;
      ;;
    *)
      is_unsigned_integer "$DECIMAL_TEXT" || return 1;
      ;;
  esac;
  case "${DECIMAL_WHOLE:-$DECIMAL_TEXT}${DECIMAL_FRACTION:-}" in *[1-9]*) return 0 ;; *) return 1 ;; esac;
};
parse_duration_seconds() {
  DURATION_TEXT="$1";
  case "$DURATION_TEXT" in
    *[sS]) DURATION_NUMBER=${DURATION_TEXT%?}; DURATION_MULTIPLIER=1 ;;
    *[mM]) DURATION_NUMBER=${DURATION_TEXT%?}; DURATION_MULTIPLIER=60 ;;
    *[hH]) DURATION_NUMBER=${DURATION_TEXT%?}; DURATION_MULTIPLIER=3600 ;;
    *[dD]) DURATION_NUMBER=${DURATION_TEXT%?}; DURATION_MULTIPLIER=86400 ;;
    *) DURATION_NUMBER=$DURATION_TEXT; DURATION_MULTIPLIER=1 ;;
  esac;
  is_unsigned_integer "$DURATION_NUMBER" || return 1;
  PARSED_DURATION_SECONDS=$((DURATION_NUMBER*DURATION_MULTIPLIER));
};
parse_size_bytes() {
  SIZE_TEXT="$1";
  case "$SIZE_TEXT" in
    *[kK]) SIZE_NUMBER=${SIZE_TEXT%?}; SIZE_MULTIPLIER=1024 ;;
    *[mM]) SIZE_NUMBER=${SIZE_TEXT%?}; SIZE_MULTIPLIER=1048576 ;;
    *[gG]) SIZE_NUMBER=${SIZE_TEXT%?}; SIZE_MULTIPLIER=1073741824 ;;
    *) SIZE_NUMBER=$SIZE_TEXT; SIZE_MULTIPLIER=1 ;;
  esac;
  is_unsigned_integer "$SIZE_NUMBER" || return 1;
  PARSED_SIZE_BYTES=$((SIZE_NUMBER*SIZE_MULTIPLIER));
};
fail_configuration() {
  printf "CONFIGURATION ERROR: %s\n" "$1" >&2;
  rm -f "$TOP_ARGUMENT_FILE" "$TOP_PIPE" "$CHUNK_FILE" "$CONTEXT_FILE" 2>/dev/null;
  rmdir "$WORK_DIR" 2>/dev/null;
  exit 2;
};
select_capture_mode() {
  [ -z "$CAPTURE_MODE" ] || fail_configuration "choose only one capture mode";
  CAPTURE_MODE="$1";
};
while [ "$#" -gt 0 ]; do
  OPTION_NAME="$1";
  case "$OPTION_NAME" in
    --every-top)
      select_capture_mode "EVERY_TOP";
      SAVE_EVERY_REPORTS=1;
      shift;
      ;;
    --every-reports)
      [ "$#" -ge 2 ] || fail_configuration "--every-reports needs a positive report count";
      is_unsigned_integer "$2" && [ "$2" -ge 1 ] || fail_configuration "--every-reports must be at least 1";
      select_capture_mode "EVERY_REPORTS";
      SAVE_EVERY_REPORTS="$2";
      shift 2;
      ;;
    --every-time)
      [ "$#" -ge 2 ] || fail_configuration "--every-time needs a duration such as 10s";
      parse_duration_seconds "$2" && [ "$PARSED_DURATION_SECONDS" -ge 1 ] || fail_configuration "invalid --every-time duration";
      select_capture_mode "EVERY_TIME";
      SAVE_INTERVAL_SECONDS=$PARSED_DURATION_SECONDS;
      shift 2;
      ;;
    --top-delay|--delay)
      [ "$#" -ge 2 ] || fail_configuration "--top-delay needs native or seconds";
      TOP_DELAY="$2";
      shift 2;
      ;;
    --top-path)
      [ "$#" -ge 2 ] || fail_configuration "--top-path needs a command path";
      TOP_PATH="$2";
      shift 2;
      ;;
    --flush-every|--flush)
      [ "$#" -ge 2 ] || fail_configuration "--flush-every needs a duration such as 5m";
      parse_duration_seconds "$2" || fail_configuration "invalid --flush duration";
      FLUSH_SECONDS=$PARSED_DURATION_SECONDS;
      shift 2;
      ;;
    --flush-reports)
      [ "$#" -ge 2 ] || fail_configuration "--flush-reports needs a report count";
      is_unsigned_integer "$2" || fail_configuration "invalid --flush-reports count";
      FLUSH_EVERY_REPORTS="$2";
      shift 2;
      ;;
    --duration)
      [ "$#" -ge 2 ] || fail_configuration "--duration needs a duration such as 1h";
      parse_duration_seconds "$2" || fail_configuration "invalid --duration";
      MAX_ELAPSED_SECONDS=$PARSED_DURATION_SECONDS;
      shift 2;
      ;;
    --until)
      [ "$#" -ge 2 ] || fail_configuration "--until needs a local date and time";
      STOP_AT_EPOCH=$(date -d "$2" +%s 2>/dev/null) || fail_configuration "--until could not be parsed";
      shift 2;
      ;;
    --until-epoch)
      [ "$#" -ge 2 ] || fail_configuration "--until-epoch needs an epoch value";
      is_unsigned_integer "$2" || fail_configuration "invalid --until-epoch";
      STOP_AT_EPOCH="$2";
      shift 2;
      ;;
    --max-size)
      [ "$#" -ge 2 ] || fail_configuration "--max-size needs bytes or K, M, G suffix";
      parse_size_bytes "$2" || fail_configuration "invalid --max-size";
      MAX_CAPTURE_BYTES=$PARSED_SIZE_BYTES;
      shift 2;
      ;;
    --max-reports)
      [ "$#" -ge 2 ] || fail_configuration "--max-reports needs a count";
      is_unsigned_integer "$2" || fail_configuration "invalid --max-reports";
      MAX_SAVED_REPORTS="$2";
      shift 2;
      ;;
    --max-source-reports)
      [ "$#" -ge 2 ] || fail_configuration "--max-source-reports needs a count";
      is_unsigned_integer "$2" || fail_configuration "invalid --max-source-reports";
      MAX_SOURCE_REPORTS="$2";
      shift 2;
      ;;
    --dir|--output-dir)
      [ "$#" -ge 2 ] || fail_configuration "$OPTION_NAME needs a path";
      OUTPUT_DIR="$2";
      shift 2;
      ;;
    --prefix)
      [ "$#" -ge 2 ] || fail_configuration "--prefix needs a filename prefix";
      FILE_PREFIX="$2";
      case "$FILE_PREFIX" in ""|*/*) fail_configuration "--prefix cannot be empty or contain slash" ;; esac;
      shift 2;
      ;;
    --top-rows|--rows)
      [ "$#" -ge 2 ] || fail_configuration "--rows needs all or a positive count";
      TOP_ROWS="$2";
      if [ "$TOP_ROWS" != "all" ]; then
        is_unsigned_integer "$TOP_ROWS" && [ "$TOP_ROWS" -ge 1 ] || fail_configuration "--rows must be all or at least 1";
      fi;
      shift 2;
      ;;
    --top-fields|--fields)
      [ "$#" -ge 2 ] || fail_configuration "--fields needs a Toybox field list or raw";
      if [ "$2" = "raw" ]; then TOP_FIELDS=""; else TOP_FIELDS="$2"; fi;
      shift 2;
      ;;
    --raw-top)
      TOP_ROWS="all";
      TOP_FIELDS="";
      shift;
      ;;
    --top-arg)
      [ "$#" -ge 2 ] || fail_configuration "--top-arg needs one complete argument token";
      case "$2" in -q|--quiet|-*q*|-b|-*b*|-d|-d*|-m|-m*|-o|-o*) fail_configuration "use dedicated options for top batch, delay, rows, and fields; quiet mode is unsupported" ;; esac;
      printf "%s\n" "$2" >>"$TOP_ARGUMENT_FILE" || fail_configuration "could not save top argument";
      shift 2;
      ;;
    --no-context)
      CONTEXT_ENABLED=0;
      shift;
      ;;
    --thread-every)
      [ "$#" -ge 2 ] || fail_configuration "--thread-every needs a duration or 0";
      parse_duration_seconds "$2" || fail_configuration "invalid --thread-every";
      THREAD_SNAPSHOT_SECONDS=$PARSED_DURATION_SECONDS;
      shift 2;
      ;;
    --watch)
      [ "$#" -ge 2 ] || fail_configuration "--watch needs an extended regular expression";
      WATCH_REGEX="$2";
      shift 2;
      ;;
    --help|-h|help)
      fail_configuration "help is displayed by calling phone_top_profile without arguments";
      ;;
    *)
      fail_configuration "unknown option $OPTION_NAME";
      ;;
  esac;
done;
[ -n "$CAPTURE_MODE" ] || fail_configuration "choose --every-top, --every-reports N, or --every-time DURATION";
if [ -n "$TOP_DELAY" ] && [ "$TOP_DELAY" != "native" ]; then
  is_positive_decimal "$TOP_DELAY" || fail_configuration "--top-delay must be a positive integer or decimal";
fi;
command -v "$TOP_PATH" >/dev/null 2>&1 || fail_configuration "top command not found at $TOP_PATH";
mkdir -p "$OUTPUT_DIR" || fail_configuration "cannot create output directory";
mkfifo "$TOP_PIPE" || fail_configuration "cannot create private top pipe";
: >"$CHUNK_FILE" || fail_configuration "cannot create private chunk";
: >"$CONTEXT_FILE" || fail_configuration "cannot create private context file";
renice -n 10 -p $$ >/dev/null 2>&1;
ionice -c 3 -p $$ >/dev/null 2>&1;
CAPTURE_START_EPOCH=0;
SESSION_SOURCE_REPORTS=0;
SESSION_SAVED_REPORTS=0;
SESSION_COMMITTED_BYTES=0;
CLOSED_OUTPUT_BYTES=0;
SESSION_MEASURED_OUTPUT_BYTES=0;
PENDING_CHUNK_BYTES=0;
FILE_SOURCE_REPORTS=0;
FILE_SAVED_REPORTS=0;
FILE_CHECKPOINT_NUMBER=0;
SAVED_REPORTS_AT_LAST_FLUSH=0;
LAST_FLUSH_EPOCH=$CAPTURE_START_EPOCH;
NEXT_THREAD_SNAPSHOT_EPOCH=$CAPTURE_START_EPOCH;
LAST_SAVED_REPORT_EPOCH=0;
REPORT_FILE="";
FILE_IS_OPEN=0;
CHUNK_FD_IS_OPEN=0;
FIRST_REPORT_IS_PENDING=0;
KEEP_CURRENT_REPORT=0;
TOP_PID="";
CONTEXT_PID="";
STOP_REASON="";
open_chunk() {
  exec 3>>"$CHUNK_FILE" || return 1;
  CHUNK_FD_IS_OPEN=1;
};
close_chunk() {
  if [ "$CHUNK_FD_IS_OPEN" -eq 1 ]; then
    exec 3>&-;
    CHUNK_FD_IS_OPEN=0;
  fi;
};
write_chunk_line() {
  CHUNK_LINE="$1";
  printf "%s\n" "$CHUNK_LINE" >&3 || return 1;
  PENDING_CHUNK_BYTES=$((PENDING_CHUNK_BYTES+${#CHUNK_LINE}+1));
};
measure_file_bytes() {
  MEASURE_FILE_PATH="$1";
  if [ -e "$MEASURE_FILE_PATH" ]; then
    MEASURED_FILE_BYTES=$(stat -c %s "$MEASURE_FILE_PATH" 2>/dev/null);
    if ! is_unsigned_integer "$MEASURED_FILE_BYTES"; then MEASURED_FILE_BYTES=$(wc -c <"$MEASURE_FILE_PATH"); fi;
  else
    MEASURED_FILE_BYTES=0;
  fi;
};
measure_session_output_bytes() {
  if [ -n "$CONTEXT_PID" ]; then wait "$CONTEXT_PID" 2>/dev/null; CONTEXT_PID=""; fi;
  ACTIVE_REPORT_BYTES=0;
  if [ "$FILE_IS_OPEN" -eq 1 ]; then measure_file_bytes "$REPORT_FILE"; ACTIVE_REPORT_BYTES=$MEASURED_FILE_BYTES; fi;
  measure_file_bytes "$CHUNK_FILE";
  ACTIVE_CHUNK_BYTES=$MEASURED_FILE_BYTES;
  measure_file_bytes "$CONTEXT_FILE";
  ACTIVE_CONTEXT_BYTES=$MEASURED_FILE_BYTES;
  SESSION_MEASURED_OUTPUT_BYTES=$((CLOSED_OUTPUT_BYTES+ACTIVE_REPORT_BYTES+ACTIVE_CHUNK_BYTES+ACTIVE_CONTEXT_BYTES));
};
collect_context() {
  CONTEXT_REASON="$1";
  INCLUDE_DAILY_BASELINE="$2";
  printf "===== CONTEXT | reason=%s | captured=%s =====\n" "$CONTEXT_REASON" "$(date "+%F %T %z")" >&3;
  printf "WALL_UPTIME_FOREGROUND_POWER_BATTERY\n" >&3;
  date "+%F %T %z" >&3;
  cat /proc/uptime >&3 2>&1;
  timeout 2 dumpsys activity activities 2>&1 | grep -m 4 -E "mResumedActivity|topResumedActivity|ResumedActivity|mFocusedApp" >&3;
  timeout 2 dumpsys power 2>&1 | grep -m 5 -E "Wakefulness=|mWakefulness=|Display Power: state=|mScreenOn=" >&3;
  timeout 2 dumpsys battery 2>&1 | grep -E "status:|plugged:|level:|voltage:|temperature:" >&3;
  printf "PRESSURE_AND_MEMORY\n" >&3;
  for PRESSURE_NAME in cpu memory io; do printf "%s " "$PRESSURE_NAME" >&3; cat "/proc/pressure/$PRESSURE_NAME" >&3 2>/dev/null; done;
  grep -E "MemAvailable:|SwapFree:|Cached:|Dirty:|Writeback:" /proc/meminfo >&3;
  printf "WATCHED_PROCESS_CPU_AND_IO\n" >&3;
  ps -A -o PID,UID,PR,NI,STAT,RSS,VSZ,TIME+,NAME 2>&1 | grep -E "$WATCH_REGEX" >&3;
  WATCHED_PIDS=$(ps -A -o PID,NAME 2>/dev/null | grep -E "$WATCH_REGEX" | sed -n "s/^ *\([0-9][0-9]*\) .*/\1/p");
  for WATCHED_PID in $WATCHED_PIDS; do
    printf "PID=%s\n" "$WATCHED_PID" >&3;
    cat "/proc/$WATCHED_PID/stat" "/proc/$WATCHED_PID/schedstat" "/proc/$WATCHED_PID/io" "/proc/$WATCHED_PID/oom_score_adj" "/proc/$WATCHED_PID/cgroup" >&3 2>&1;
  done;
  printf "THERMAL_ZONES\n" >&3;
  for THERMAL_ZONE in /sys/class/thermal/thermal_zone*; do
    if [ -r "$THERMAL_ZONE/temp" ]; then printf "%s %s %s\n" "$THERMAL_ZONE" "$(cat "$THERMAL_ZONE/type" 2>/dev/null)" "$(cat "$THERMAL_ZONE/temp" 2>/dev/null)" >&3; fi;
  done;
  printf "BOUNDED_ACTIVITY_AND_BACKGROUND_LOGS\n" >&3;
  timeout 3 logcat -b events -d -t 200 -v threadtime am_anr:I am_proc_died:I am_proc_start:I am_low_memory:I am_kill:I am_uid_active:I am_uid_idle:I wm_task_to_front:I wm_resume_activity:I wm_pause_activity:I "*:S" >&3 2>&1;
  timeout 3 logcat -b main -b system -b crash -b radio -d -t 200 -v threadtime ActivityManager:I ActivityTaskManager:I JobScheduler:I AlarmManager:I NotificationService:I Telecom:I FirebaseMessaging:I GcmPushListenerService:I TMessagesProj:I tgnet:I MediaProvider:I ModernMediaScanner:I ExternalStorageService:I FuseDaemon:I AndroidRuntime:D DEBUG:D libc:D "*:S" >&3 2>&1;
  if [ "$INCLUDE_DAILY_BASELINE" -eq 1 ]; then
    printf "DAILY_TELEGRAM_COMPONENTS_APPOPS_JOBS\n" >&3;
    timeout 5 dumpsys package org.telegram.messenger 2>&1 | grep -i -E "versionCode=|versionName=|GcmPushListenerService|FirebaseMessagingService|NotificationsService|KeepAliveJob|VoIPService|TelegramConnectionService|enabledComponents|disabledComponents|stopped=" >&3;
    timeout 5 cmd appops get --user current org.telegram.messenger 2>&1 | grep -E "RUN_IN_BACKGROUND|RUN_ANY_IN_BACKGROUND|WAKE_LOCK|READ_CONTACTS|WRITE_CONTACTS|READ_MEDIA|POST_NOTIFICATION" >&3;
    timeout 5 dumpsys jobscheduler org.telegram.messenger >&3 2>&1;
  fi;
  printf "===== CONTEXT COMPLETE =====\n" >&3;
};
start_context_capture() {
  [ "$CONTEXT_ENABLED" -eq 1 ] || return 0;
  CONTEXT_REASON="$1";
  INCLUDE_DAILY_BASELINE="$2";
  : >"$CONTEXT_FILE" || return 1;
  collect_context "$CONTEXT_REASON" "$INCLUDE_DAILY_BASELINE" 3>"$CONTEXT_FILE" &
  CONTEXT_PID=$!;
};
flush_chunk() {
  FLUSH_REASON="$1";
  FLUSH_EPOCH="$2";
  close_chunk;
  if [ -n "$CONTEXT_PID" ]; then wait "$CONTEXT_PID" 2>/dev/null; CONTEXT_PID=""; fi;
  CHUNK_SIZE=$(wc -c <"$CHUNK_FILE");
  CONTEXT_SIZE=$(wc -c <"$CONTEXT_FILE");
  COMMIT_SIZE=$((CHUNK_SIZE+CONTEXT_SIZE));
  if [ "$COMMIT_SIZE" -gt 0 ]; then
    FILE_CHECKPOINT_NUMBER=$((FILE_CHECKPOINT_NUMBER+1));
    { printf "\n===== CHECKPOINT %s | reason=%s | committed=%s | context_bytes=%s | top_bytes=%s =====\n" "$FILE_CHECKPOINT_NUMBER" "$FLUSH_REASON" "$(date "+%F %T %z")" "$CONTEXT_SIZE" "$CHUNK_SIZE" && cat "$CONTEXT_FILE" && cat "$CHUNK_FILE" && printf "\n===== CHECKPOINT %s COMPLETE =====\n" "$FILE_CHECKPOINT_NUMBER"; } >>"$REPORT_FILE" || return 1;
    fsync "$REPORT_FILE" 2>/dev/null || printf "WARNING: fsync failed for %s\n" "$REPORT_FILE" >&2;
    SESSION_COMMITTED_BYTES=$((SESSION_COMMITTED_BYTES+COMMIT_SIZE));
    printf "COMMITTED: %s checkpoint=%s bytes=%s\n" "$REPORT_FILE" "$FILE_CHECKPOINT_NUMBER" "$COMMIT_SIZE";
  fi;
  : >"$CHUNK_FILE" || return 1;
  : >"$CONTEXT_FILE" || return 1;
  PENDING_CHUNK_BYTES=0;
  LAST_FLUSH_EPOCH=$FLUSH_EPOCH;
  SAVED_REPORTS_AT_LAST_FLUSH=$SESSION_SAVED_REPORTS;
  open_chunk || return 1;
};
open_timestamped_file() {
  NEW_FILE_DAY="$1";
  NEW_FILE_TIMESTAMP="$2";
  FIRST_FRAME_WALL="$3";
  FIRST_FRAME_EPOCH="$4";
  FILE_BASE="$OUTPUT_DIR/${FILE_PREFIX}_${NEW_FILE_TIMESTAMP}";
  REPORT_FILE="$FILE_BASE.txt";
  COLLISION_NUMBER=2;
  while [ -e "$REPORT_FILE" ]; do REPORT_FILE="${FILE_BASE}_$COLLISION_NUMBER.txt"; COLLISION_NUMBER=$((COLLISION_NUMBER+1)); done;
  FILE_SOURCE_REPORTS=0;
  FILE_SAVED_REPORTS=0;
  FILE_CHECKPOINT_NUMBER=0;
  LAST_SAVED_REPORT_EPOCH=0;
  FIRST_REPORT_IS_PENDING=1;
  {
    printf "===== CONFIGURABLE CONTINUOUS PHONE TOP PROFILE =====\n";
    printf "FILE_DAY=%s\nFILE_CREATED_TIMESTAMP=%s\nFIRST_TOP_ARRIVAL=%s\nSESSION=%s\nREPORT=%s\n" "$NEW_FILE_DAY" "$NEW_FILE_TIMESTAMP" "$FIRST_FRAME_WALL" "$SESSION_ID" "$REPORT_FILE";
    printf "EVENT_FLOW=block waiting for top; process each arriving Tasks or Threads report; no separate polling loop\n";
    printf "CAPTURE_MODE=%s SAVE_EVERY_REPORTS=%s SAVE_INTERVAL_SECONDS=%s TOP_PATH=%s TOP_DELAY=%s FLUSH_SECONDS=%s FLUSH_REPORTS=%s ROWS=%s FIELDS=%s\n" "$CAPTURE_MODE" "$SAVE_EVERY_REPORTS" "$SAVE_INTERVAL_SECONDS" "$TOP_PATH" "${TOP_DELAY:-native}" "$FLUSH_SECONDS" "$FLUSH_EVERY_REPORTS" "$TOP_ROWS" "${TOP_FIELDS:-raw}";
    printf "STOP_LIMITS=elapsed:%s until_epoch:%s max_size:%s max_saved_reports:%s max_source_reports:%s\n" "$MAX_ELAPSED_SECONDS" "$STOP_AT_EPOCH" "$MAX_CAPTURE_BYTES" "$MAX_SAVED_REPORTS" "$MAX_SOURCE_REPORTS";
    printf "ALLOWED_ACTIVE_USE=games, sound recorder, Chrome or Chrome Dev, and Termux; Telegram is allowed while visible or in a call and notifications are required\n";
    printf "BUILD=%s\n" "$(getprop ro.build.fingerprint)";
  } >"$REPORT_FILE" || return 1;
  HEADER_SIZE=$(wc -c <"$REPORT_FILE");
  SESSION_COMMITTED_BYTES=$((SESSION_COMMITTED_BYTES+HEADER_SIZE));
  fsync "$REPORT_FILE" 2>/dev/null || printf "WARNING: initial fsync failed for %s\n" "$REPORT_FILE" >&2;
  FILE_IS_OPEN=1;
  if [ "$CHUNK_FD_IS_OPEN" -eq 0 ]; then open_chunk || return 1; fi;
  LAST_FLUSH_EPOCH=$FIRST_FRAME_EPOCH;
  SAVED_REPORTS_AT_LAST_FLUSH=$SESSION_SAVED_REPORTS;
  NEXT_THREAD_SNAPSHOT_EPOCH=$((FIRST_FRAME_EPOCH+THREAD_SNAPSHOT_SECONDS));
  start_context_capture "FILE_OPEN" 1 || return 1;
  printf "OPENED: %s\n" "$REPORT_FILE";
};
finish_timestamped_file() {
  FINISH_REASON="$1";
  FINISH_EPOCH="$2";
  [ "$FILE_IS_OPEN" -eq 1 ] || return 0;
  flush_chunk "$FINISH_REASON" "$FINISH_EPOCH" || return 1;
  close_chunk;
  printf "\n===== FILE FINISHED | reason=%s | time=%s | source_reports=%s | saved_reports=%s =====\n" "$FINISH_REASON" "$(date "+%F %T %z")" "$FILE_SOURCE_REPORTS" "$FILE_SAVED_REPORTS" >>"$REPORT_FILE" || return 1;
  fsync "$REPORT_FILE" 2>/dev/null || printf "WARNING: final fsync failed for %s\n" "$REPORT_FILE" >&2;
  printf "FINISHED: %s\n" "$REPORT_FILE";
  measure_file_bytes "$REPORT_FILE";
  CLOSED_OUTPUT_BYTES=$((CLOSED_OUTPUT_BYTES+MEASURED_FILE_BYTES));
  FILE_IS_OPEN=0;
};
sample_watched_threads() {
  THREAD_SAMPLE_WALL="$1";
  WATCHED_PIDS=$(ps -A -o PID,NAME 2>/dev/null | grep -E "$WATCH_REGEX" | sed -n "s/^ *\([0-9][0-9]*\) .*/\1/p" | tr "\n" "," | sed "s/,$//");
  write_chunk_line "===== WATCHED THREAD STATE | $THREAD_SAMPLE_WALL | pids=$WATCHED_PIDS =====";
  if [ -n "$WATCHED_PIDS" ]; then ps -T -p "$WATCHED_PIDS" -o PID,TID,UID,PR,NI,S,%CPU,RSS,NAME:64,TIME >&3 2>&1; fi;
  write_chunk_line "===== WATCHED THREAD STATE COMPLETE =====";
};
find_stop_reason() {
  CHECK_EPOCH="$1";
  STOP_REASON="";
  if [ "$MAX_ELAPSED_SECONDS" -gt 0 ] && [ $((CHECK_EPOCH-CAPTURE_START_EPOCH)) -ge "$MAX_ELAPSED_SECONDS" ]; then STOP_REASON="MAX_ELAPSED_SECONDS";
  elif [ "$STOP_AT_EPOCH" -gt 0 ] && [ "$CHECK_EPOCH" -ge "$STOP_AT_EPOCH" ]; then STOP_REASON="STOP_AT_TIME";
  elif [ "$MAX_SAVED_REPORTS" -gt 0 ] && [ "$SESSION_SAVED_REPORTS" -ge "$MAX_SAVED_REPORTS" ]; then STOP_REASON="MAX_SAVED_REPORTS";
  elif [ "$MAX_SOURCE_REPORTS" -gt 0 ] && [ "$SESSION_SOURCE_REPORTS" -ge "$MAX_SOURCE_REPORTS" ]; then STOP_REASON="MAX_SOURCE_REPORTS";
  elif [ "$MAX_CAPTURE_BYTES" -gt 0 ]; then
    measure_session_output_bytes;
    if [ "$SESSION_MEASURED_OUTPUT_BYTES" -ge "$MAX_CAPTURE_BYTES" ]; then STOP_REASON="MAX_CAPTURE_BYTES"; fi;
  fi;
  [ -n "$STOP_REASON" ];
};
cleanup_profile() {
  trap - EXIT HUP INT TERM;
  if [ -n "$TOP_PID" ]; then kill "$TOP_PID" 2>/dev/null; wait "$TOP_PID" 2>/dev/null; fi;
  CLEANUP_EPOCH=$(date +%s);
  [ -n "$STOP_REASON" ] || STOP_REASON="TOP_STREAM_ENDED";
  FINALIZE_SUCCEEDED=1;
  if [ "$FILE_IS_OPEN" -eq 1 ]; then finish_timestamped_file "$STOP_REASON" "$CLEANUP_EPOCH" || FINALIZE_SUCCEEDED=0; fi;
  close_chunk;
  if [ "$FINALIZE_SUCCEEDED" -eq 1 ]; then
    rm -f "$CHUNK_FILE" "$CONTEXT_FILE" "$TOP_PIPE" "$TOP_ARGUMENT_FILE" 2>/dev/null;
    rmdir "$WORK_DIR" 2>/dev/null;
  else
    printf "WARNING: final file flush failed; private recovery data remains in %s\n" "$WORK_DIR" >&2;
  fi;
  measure_session_output_bytes;
  printf "PROFILE STOPPED: reason=%s saved_reports=%s source_reports=%s output_bytes=%s\n" "$STOP_REASON" "$SESSION_SAVED_REPORTS" "$SESSION_SOURCE_REPORTS" "$SESSION_MEASURED_OUTPUT_BYTES";
};
trap cleanup_profile EXIT;
trap "STOP_REASON=SIGNAL; exit 130" HUP INT TERM;
set -- -b;
if [ -n "$TOP_DELAY" ] && [ "$TOP_DELAY" != "native" ]; then set -- "$@" -d "$TOP_DELAY"; fi;
if [ "$TOP_ROWS" != "all" ]; then set -- "$@" -m "$TOP_ROWS"; fi;
if [ -n "$TOP_FIELDS" ]; then set -- "$@" -o "$TOP_FIELDS"; fi;
while IFS= read -r EXTRA_TOP_ARGUMENT; do set -- "$@" "$EXTRA_TOP_ARGUMENT"; done <"$TOP_ARGUMENT_FILE";
open_chunk || { STOP_REASON="PRIVATE_CHUNK_OPEN_FAILED"; printf "ERROR: cannot open private chunk %s\n" "$CHUNK_FILE" >&2; exit 1; };
"$TOP_PATH" "$@" >"$TOP_PIPE" 2>&1 &
TOP_PID=$!;
while IFS= read -r TOP_LINE; do
  case "$TOP_LINE" in
    Tasks:*|Threads:*)
      FRAME_INFO=$(date "+%s|%Y%m%d|%Y%m%d_%H%M%S|%F %T %z");
      FRAME_EPOCH=${FRAME_INFO%%|*};
      FRAME_REMAINDER=${FRAME_INFO#*|};
      FRAME_DAY=${FRAME_REMAINDER%%|*};
      FRAME_REMAINDER=${FRAME_REMAINDER#*|};
      FRAME_FILE_TIMESTAMP=${FRAME_REMAINDER%%|*};
      FRAME_WALL=${FRAME_REMAINDER#*|};
      if [ "$CAPTURE_START_EPOCH" -eq 0 ]; then CAPTURE_START_EPOCH=$FRAME_EPOCH; fi;
      FLUSH_OCCURRED=0;
      if [ "$FILE_IS_OPEN" -eq 1 ]; then
        if [ "$FIRST_REPORT_IS_PENDING" -eq 1 ]; then
          flush_chunk "FIRST_COMPLETE_REPORT" "$FRAME_EPOCH" || { STOP_REASON="OUTPUT_WRITE_FAILED"; break; };
          FIRST_REPORT_IS_PENDING=0;
          FLUSH_OCCURRED=1;
        elif { [ "$FLUSH_SECONDS" -gt 0 ] && [ $((FRAME_EPOCH-LAST_FLUSH_EPOCH)) -ge "$FLUSH_SECONDS" ]; } || { [ "$FLUSH_EVERY_REPORTS" -gt 0 ] && [ $((SESSION_SAVED_REPORTS-SAVED_REPORTS_AT_LAST_FLUSH)) -ge "$FLUSH_EVERY_REPORTS" ]; }; then
          flush_chunk "CONFIGURED_CHECKPOINT" "$FRAME_EPOCH" || { STOP_REASON="OUTPUT_WRITE_FAILED"; break; };
          FLUSH_OCCURRED=1;
        fi;
      fi;
      if find_stop_reason "$FRAME_EPOCH"; then break; fi;
      FILE_WAS_ROTATED=0;
      if [ "$FILE_IS_OPEN" -eq 0 ]; then
        open_timestamped_file "$FRAME_DAY" "$FRAME_FILE_TIMESTAMP" "$FRAME_WALL" "$FRAME_EPOCH" || { STOP_REASON="OUTPUT_OPEN_FAILED"; break; };
        FILE_WAS_ROTATED=1;
      else
        ACTIVE_FILE_NAME=${REPORT_FILE##*/};
        case "$ACTIVE_FILE_NAME" in
          "$FILE_PREFIX"_"$FRAME_DAY"_*) ;;
          *)
            finish_timestamped_file "DAY_CHANGED_TO_$FRAME_DAY" "$FRAME_EPOCH" || { STOP_REASON="OUTPUT_WRITE_FAILED"; break; };
            open_timestamped_file "$FRAME_DAY" "$FRAME_FILE_TIMESTAMP" "$FRAME_WALL" "$FRAME_EPOCH" || { STOP_REASON="OUTPUT_OPEN_FAILED"; break; };
            FILE_WAS_ROTATED=1;
            ;;
        esac;
      fi;
      if [ "$FLUSH_OCCURRED" -eq 1 ] && [ "$FILE_WAS_ROTATED" -eq 0 ]; then start_context_capture "AFTER_CHECKPOINT" 0 || { STOP_REASON="CONTEXT_START_FAILED"; break; }; fi;
      if [ "$THREAD_SNAPSHOT_SECONDS" -gt 0 ] && [ "$FRAME_EPOCH" -ge "$NEXT_THREAD_SNAPSHOT_EPOCH" ]; then
        sample_watched_threads "$FRAME_WALL" || { STOP_REASON="PRIVATE_WRITE_FAILED"; break; };
        NEXT_THREAD_SNAPSHOT_EPOCH=$((FRAME_EPOCH+THREAD_SNAPSHOT_SECONDS));
      fi;
      SESSION_SOURCE_REPORTS=$((SESSION_SOURCE_REPORTS+1));
      FILE_SOURCE_REPORTS=$((FILE_SOURCE_REPORTS+1));
      KEEP_CURRENT_REPORT=0;
      if [ "$FILE_WAS_ROTATED" -eq 1 ]; then
        KEEP_CURRENT_REPORT=1;
      elif [ "$CAPTURE_MODE" = "EVERY_TIME" ]; then
        if [ "$LAST_SAVED_REPORT_EPOCH" -eq 0 ] || [ $((FRAME_EPOCH-LAST_SAVED_REPORT_EPOCH)) -ge "$SAVE_INTERVAL_SECONDS" ]; then KEEP_CURRENT_REPORT=1; fi;
      elif [ $(((FILE_SOURCE_REPORTS-1)%SAVE_EVERY_REPORTS)) -eq 0 ]; then
        KEEP_CURRENT_REPORT=1;
      fi;
      if [ "$KEEP_CURRENT_REPORT" -eq 1 ]; then
        SESSION_SAVED_REPORTS=$((SESSION_SAVED_REPORTS+1));
        FILE_SAVED_REPORTS=$((FILE_SAVED_REPORTS+1));
        LAST_SAVED_REPORT_EPOCH=$FRAME_EPOCH;
        REPORT_MARKER="===== TOP REPORT session=$SESSION_ID file_report=$FILE_SAVED_REPORTS source_report=$SESSION_SOURCE_REPORTS | $FRAME_WALL | epoch=$FRAME_EPOCH =====";
        write_chunk_line "" || { STOP_REASON="PRIVATE_WRITE_FAILED"; break; };
        write_chunk_line "$REPORT_MARKER" || { STOP_REASON="PRIVATE_WRITE_FAILED"; break; };
      fi;
      ;;
  esac;
  if [ "$KEEP_CURRENT_REPORT" -eq 1 ]; then
    write_chunk_line "$TOP_LINE" || { STOP_REASON="PRIVATE_WRITE_FAILED"; break; };
  elif [ "$FILE_IS_OPEN" -eq 0 ] && [ -n "$TOP_LINE" ]; then
    printf "TOP BEFORE FIRST REPORT: %s\n" "$TOP_LINE" >&2;
  fi;
done <"$TOP_PIPE";
';
  if [ "$ENGINE" = "controller" ]; then
    {
      printf "set --";
      for PHONE_TOP_ARGUMENT in "${ORIGINAL_ARGUMENTS[@]}"; do printf " '%s'" "$PHONE_TOP_ARGUMENT"; done;
      printf "\n%s\n" "$LOCAL_CONTROLLER_SCRIPT";
    } | bash -s;
    PHONE_TOP_STATUS=$?;
  else
    if ! command -v "$ADB_PATH" >/dev/null 2>&1; then printf "ERROR: adb command not found at %s.\n" "$ADB_PATH" >&2; return 2; fi;
    if [ -n "$ADB_SERIAL" ]; then
      {
        printf "set --";
        for PHONE_TOP_ARGUMENT in "${LEGACY_ARGUMENTS[@]}"; do printf " '%s'" "$PHONE_TOP_ARGUMENT"; done;
        printf "\n%s\n" "$LEGACY_REMOTE_SCRIPT";
      } | "$ADB_PATH" -s "$ADB_SERIAL" shell sh -s;
      PHONE_TOP_STATUS=$?;
    else
      {
        printf "set --";
        for PHONE_TOP_ARGUMENT in "${LEGACY_ARGUMENTS[@]}"; do printf " '%s'" "$PHONE_TOP_ARGUMENT"; done;
        printf "\n%s\n" "$LEGACY_REMOTE_SCRIPT";
      } | "$ADB_PATH" shell sh -s;
      PHONE_TOP_STATUS=$?;
    fi;
  fi;
  return "$PHONE_TOP_STATUS";
};
phone_top_profile;
