sanitize_cache_part() {
  printf '%s\n' "$1" | sed 's/[^A-Za-z0-9._-]/-/g; s/--*/-/g; s/^-//; s/-$//'
}

cache_identity_hash() {
  local digest
  if command -v sha256sum >/dev/null 2>&1; then
    digest="$(printf '%s\0' "$@" | sha256sum)"
  elif command -v shasum >/dev/null 2>&1; then
    digest="$(printf '%s\0' "$@" | shasum -a 256)"
  else
    echo "::error::SHA-256 is required to compute cache keys" >&2
    return 1
  fi
  printf '%s' "${digest%% *}"
}
