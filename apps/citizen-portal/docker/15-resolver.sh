#!/bin/sh
# Generate the nginx `resolver` directive at container start from the pod's DNS
# (Kubernetes CoreDNS / Docker embedded DNS). This lets nginx re-resolve the
# CloudFront-fronted analytics & feature-flag upstreams on DNS TTL instead of
# pinning whatever IPs it resolved at worker start — the failure mode behind the
# analytics "no live upstreams" 502s (a dead pinned edge set with no refresh).
#
# Runs via the nginx image's /docker-entrypoint.d mechanism before nginx starts.
# nginx.conf includes /tmp/resolver.conf* (wildcard = optional, so this is safe).
set -eu

ns=$(awk '/^nameserver/ { printf "%s ", $2 } END { print "" }' /etc/resolv.conf 2>/dev/null | sed 's/[[:space:]]*$//')

# Fallback to Docker's embedded DNS if resolv.conf had no usable nameserver.
if [ -z "$ns" ]; then
  ns="127.0.0.11"
fi

{
  echo "resolver ${ns} valid=30s ipv6=off;"
  echo "resolver_timeout 5s;"
} >/tmp/resolver.conf

echo "[15-resolver] wrote /tmp/resolver.conf -> resolver ${ns} valid=30s ipv6=off"
