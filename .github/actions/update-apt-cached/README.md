# Update APT Lists

Linux-only action that refreshes and caches APT package indexes. It does not
install packages; non-Linux runners are a no-op.

## Inputs

| Input | Default | Description |
|---|---:|---|
| `cache-key` | `apt-lists` | Cache namespace. Empty disables this action. |
| `libc` | `glibc` | Cache partition; intended for glibc-based Ubuntu runners. |
| `acquire-timeout` | `20` | Seconds per HTTP(S) mirror request. |
| `acquire-retries` | `2` | Retries per mirror request. |

Cache keys include the runner OS, Ubuntu version, architecture, libc, and a
hash of the repository `InRelease` files. ARM64 probes Ubuntu Ports, not the
x86-64 archive. A consumer using
[install-cached](../install-cached/README.md) can restore these indexes by
using the same `lists-cache-key` and `libc`.

## Example

```yaml
- uses: stormbytepp/githubactions/.github/actions/update-apt-cached@master
  with:
    cache-key: apt-lists
    libc: glibc
```

When mirror probing succeeds, unchanged indexes are reused. If indexes change,
or no usable cache exists, the action runs `apt-get update`; if mirrors are
unreachable it falls back to a usable cached index when available.

## License

MIT. See [`LICENSE.txt`](../../../LICENSE.txt) at the repository root.
