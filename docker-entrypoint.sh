#!/bin/sh
set -e

if [ "$DATABASE_ENGINE" = "sqlite" ] && [ -n "$SQLITE_PATH" ]; then
    mkdir -p "$(dirname "$SQLITE_PATH")"
fi

if [ "$DATABASE_ENGINE" != "sqlite" ]; then
    python - <<'PY'
import os
import time

import psycopg

host = os.environ.get('POSTGRES_HOST', 'db')
port = os.environ.get('POSTGRES_PORT', '5432')
dbname = os.environ.get('POSTGRES_DB', 'zebra_web_print')
user = os.environ.get('POSTGRES_USER', 'zebra_web_print')
password = os.environ.get('POSTGRES_PASSWORD', '')

for attempt in range(30):
    try:
        with psycopg.connect(
            host=host,
            port=port,
            dbname=dbname,
            user=user,
            password=password,
            connect_timeout=3,
        ):
            print('PostgreSQL is ready')
            break
    except psycopg.OperationalError:
        if attempt == 29:
            raise
        print('Waiting for PostgreSQL...')
        time.sleep(2)
PY
fi

python manage.py migrate --noinput
python manage.py collectstatic --noinput

exec "$@"
