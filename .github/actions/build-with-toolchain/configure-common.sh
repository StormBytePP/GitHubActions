parse_action_arguments() {
  local input="$1" label="$2" parsed arg
  PARSED_ARGS=()
  # A temporary file instead of process substitution: macOS /bin/bash 3.2
  # cannot wait for a process substitution to read its exit status.
  parsed="$(mktemp)"
  if ! python3 -c '
import shlex
import sys

try:
    args = shlex.split(sys.argv[1])
except ValueError as error:
    print(error, file=sys.stderr)
    sys.exit(2)
for arg in args:
    sys.stdout.buffer.write(arg.encode() + b"\0")
' "$input" > "$parsed"; then
    rm -f "$parsed"
    echo "::error::Invalid ${label}" >&2
    return 1
  fi
  while IFS= read -r -d '' arg; do
    PARSED_ARGS+=("$arg")
  done < "$parsed"
  rm -f "$parsed"
}

CPU_FLAG_PATTERN='(^|[[:space:]])(-march=|-mcpu=|[/-]arch:)'

# Appends CPU_FLAGS to CFLAGS/CXXFLAGS and to any CMAKE_C/CXX_FLAGS definition,
# unless the caller already selects a target CPU.
apply_cpu_baseline() {
  local arg name source
  local -a adjusted

  [[ -z "${CPU_FLAGS:-}" ]] && return 0

  source=""
  if [[ "${CFLAGS:-}" =~ $CPU_FLAG_PATTERN ]]; then
    source="CFLAGS"
  elif [[ "${CXXFLAGS:-}" =~ $CPU_FLAG_PATTERN ]]; then
    source="CXXFLAGS"
  else
    for arg in ${CONFIGURE_ARGS[@]+"${CONFIGURE_ARGS[@]}"}; do
      if [[ "$arg" =~ ^-D(CMAKE_(C|CXX)_FLAGS(_[A-Za-z]+)?)(:[^=]+)?=(.*)$ ]]; then
        name="${BASH_REMATCH[1]}"
        if [[ "${BASH_REMATCH[5]}" =~ $CPU_FLAG_PATTERN ]]; then
          source="$name"
          break
        fi
      fi
    done
  fi
  if [[ -n "$source" ]]; then
    echo "::warning::${source} already selects a target CPU; cpu-baseline (${CPU_FLAGS}) was not applied" >&2
    return 0
  fi

  export CFLAGS="${CFLAGS:+${CFLAGS} }${CPU_FLAGS}"
  export CXXFLAGS="${CXXFLAGS:+${CXXFLAGS} }${CPU_FLAGS}"
  adjusted=()
  for arg in ${CONFIGURE_ARGS[@]+"${CONFIGURE_ARGS[@]}"}; do
    if [[ "$arg" =~ ^-DCMAKE_(C|CXX)_FLAGS(:[^=]+)?=(.*)$ ]]; then
      if [[ -n "${BASH_REMATCH[3]}" ]]; then
        arg="${arg} ${CPU_FLAGS}"
      else
        arg="${arg}${CPU_FLAGS}"
      fi
    fi
    adjusted+=("$arg")
  done
  CONFIGURE_ARGS=(${adjusted[@]+"${adjusted[@]}"})
  echo "🎯 CPU baseline: ${CPU_FLAGS}" >&2
}

prepare_cmake_options() {
  local setting value desired option existing present normalized actual arg
  local name found stdlib_flag pending_definition
  local -a adjusted

  parse_action_arguments "$CMAKE_OPTIONS" "cmake-options"
  CONFIGURE_ARGS=()
  pending_definition=false
  for arg in ${PARSED_ARGS[@]+"${PARSED_ARGS[@]}"}; do
    if [[ "$pending_definition" == true ]]; then
      CONFIGURE_ARGS+=("-D${arg}")
      pending_definition=false
    elif [[ "$arg" == -D ]]; then
      pending_definition=true
    else
      CONFIGURE_ARGS+=("$arg")
    fi
  done
  if [[ "$pending_definition" == true ]]; then CONFIGURE_ARGS+=("-D"); fi

  for setting in PGO LTO; do
    case "$setting" in
      PGO) value="$PGO" ;;
      LTO) value="$LTO" ;;
    esac
    [[ -z "$value" ]] && continue
    case "$value" in
      true) desired=ON ;;
      false) desired=OFF ;;
    esac
    option="ENABLE_${setting}"
    present=0
    existing=""
    for arg in ${CONFIGURE_ARGS[@]+"${CONFIGURE_ARGS[@]}"}; do
      if [[ "$arg" =~ ^-D${option}(:[A-Za-z]+)?=(.*)$ ]]; then
        existing="${BASH_REMATCH[2]}"
        present=1
      fi
    done
    if [[ "$present" == 1 ]]; then
      normalized="$(printf '%s' "$existing" | tr '[:lower:]' '[:upper:]')"
      case "$normalized" in
        1|ON|YES|TRUE|Y) actual=true ;;
        ""|0|OFF|NO|FALSE|N|IGNORE|NOTFOUND|*-NOTFOUND) actual=false ;;
        *)
          echo "::error::${option} in cmake-options is not a recognized boolean: ${existing}" >&2
          return 1
          ;;
      esac
      if [[ "$actual" != "$value" ]]; then
        echo "::error::${option} in cmake-options conflicts with ${setting}=${value}" >&2
        return 1
      fi
    else
      CONFIGURE_ARGS+=("-D${option}=${desired}")
    fi
  done

  if [[ -n "$INSTALL_PREFIX" ]]; then
    CONFIGURE_ARGS+=("-DCMAKE_INSTALL_PREFIX=${INSTALL_PREFIX}")
  fi

  apply_cpu_baseline

  if [[ "$COMPILER" == clang && -n "$CXX_STDLIB" ]]; then
    stdlib_flag="-stdlib=${CXX_STDLIB}"
    value="${CXXFLAGS:-}"
    if [[ "$value" =~ (^|[[:space:]])-stdlib=([^[:space:]]+) ]]; then
      if [[ "${BASH_REMATCH[2]}" != "$CXX_STDLIB" ]]; then
        echo "::error::CXXFLAGS selects a different C++ standard library than cxx-stdlib" >&2
        return 1
      fi
    else
      value="${value:+${value} }${stdlib_flag}"
    fi
    export CXXFLAGS="$value"

    for name in CMAKE_CXX_FLAGS CMAKE_CXX_STANDARD_LIBRARIES; do
      found=0
      adjusted=()
      for arg in ${CONFIGURE_ARGS[@]+"${CONFIGURE_ARGS[@]}"}; do
        if [[ "$arg" =~ ^-D${name}(:[^=]+)?=(.*)$ ]]; then
          value="${BASH_REMATCH[2]}"
          if [[ "$value" =~ (^|[[:space:]])-stdlib=([^[:space:]]+) ]]; then
            if [[ "${BASH_REMATCH[2]}" != "$CXX_STDLIB" ]]; then
              echo "::error::${name} selects a different C++ standard library than cxx-stdlib" >&2
              return 1
            fi
          else
            arg="${arg} ${stdlib_flag}"
          fi
          found=1
        fi
        adjusted+=("$arg")
      done
      CONFIGURE_ARGS=(${adjusted[@]+"${adjusted[@]}"})
      if [[ "$found" == 0 ]]; then
        if [[ "$name" == CMAKE_CXX_FLAGS ]]; then
          CONFIGURE_ARGS+=("-D${name}=${CXXFLAGS}")
        else
          CONFIGURE_ARGS+=("-D${name}=${stdlib_flag}")
        fi
      fi
    done
  fi
}
