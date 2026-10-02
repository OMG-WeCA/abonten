#!/bin/sh
set -eu
# No credential in argv or logs. The approved provisioning flow supplies this
# URL-safe password, also percent-encoded as necessary in REDIS_URL.
case "${REDIS_PASSWORD:-}" in
  ''|*[!A-Za-z0-9_-]*)
    echo 'REDIS_PASSWORD must be a provisioned URL-safe value.' >&2
    exit 1
    ;;
esac
if [ "${#REDIS_PASSWORD}" -lt 32 ]; then
  echo 'REDIS_PASSWORD must contain at least 32 characters.' >&2
  exit 1
fi
umask 077
mkdir -p /run/abonten
chown redis:redis /run/abonten
chmod 750 /run/abonten
{
  printf '%s\n' 'bind 0.0.0.0' 'protected-mode yes' 'dir /data' \
    'appendonly yes' 'appendfsync everysec' 'maxmemory 128mb' \
    'maxmemory-policy noeviction'
  printf 'requirepass %s\n' "$REDIS_PASSWORD"
} > /run/abonten/redis.conf
chown redis:redis /run/abonten/redis.conf
unset REDIS_PASSWORD
exec /usr/local/bin/docker-entrypoint.sh redis-server /run/abonten/redis.conf
