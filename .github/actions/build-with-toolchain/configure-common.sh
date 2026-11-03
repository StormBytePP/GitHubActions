parse_action_arguments() {
  local input="$1" label="$2" parser_pid arg
  PARSED_ARGS=()
  exec 3< <(python3 -c '
import shlex
import sys

try:
    args = shlex.split(sys.argv[1])
except ValueError as error:
    print(error, file=sys.stderr)
    sys.exit(2)
for arg in args:
    sys.stdout.buffer.write(arg.encode() + b"\0")
' "$input")
  parser_pid=$!
  while IFS= read -r -d '' arg <&3; do
    PARSED_ARGS+=("$arg")
  done
  exec 3<&-
  if ! wait "$parser_pid"; then
    echo "::error::Invalid ${label}" >&2
    return 1
  fi
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
