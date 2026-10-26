#!/usr/bin/env bash
# This former root entrypoint intentionally has no deployment capability.
set -euo pipefail
if (( $# )); then
  echo 'Caller-supplied release arguments are refused. Use the installed versioned wrapper.' >&2
  exit 64
fi
echo 'Use the reviewed root-owned /usr/local/sbin/yubie-release-<full-sha> wrapper.' >&2
exit 77
