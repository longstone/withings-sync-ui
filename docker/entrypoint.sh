#!/usr/bin/env bash
set -euo pipefail

# Set default UID/GID if not provided
PUID=${PUID:-1000}
PGID=${PGID:-1000}

# Create user and group if they don't exist
if ! getent group withings-sync >/dev/null; then
    # Try to create group with specified GID, fallback to any available GID if it exists
    groupadd -g $PGID withings-sync 2>/dev/null || groupadd withings-sync
fi

if ! id withings-sync >/dev/null 2>&1; then
    # Try to create user with specified UID, fallback to any available UID if it exists
    useradd -u $PUID -g withings-sync -s /bin/bash -m withings-sync 2>/dev/null || useradd -g withings-sync -s /bin/bash -m withings-sync
fi

# Ensure data directories exist (host volume may override build-time dirs)
mkdir -p "${DATA_DIR}"/db "${DATA_DIR}"/logs "${DATA_DIR}"/withings-config

# Set ownership of app directories (ensure recursive ownership)
chown -R withings-sync:withings-sync /app
chown -R withings-sync:withings-sync "${DATA_DIR}"

# Ensure database directory has write permissions
chmod 775 "${DATA_DIR}"/db

# Ensure database file has correct permissions if it exists
if [ -f "${DATA_DIR}/db/app.db" ]; then
    chmod 664 "${DATA_DIR}"/db/app.db
    chown withings-sync:withings-sync /app/data/db/app.db
fi

cd /app/backend
export DATABASE_URL="file:${DATA_DIR}/db/app.db"

# Switch to withings-sync user for migrations and app execution
exec gosu withings-sync:withings-sync /bin/bash -c "
    # do migrations
    npx prisma migrate deploy --schema /app/backend/prisma/schema.prisma
    
    # Run the application
    exec node dist/app.js
"
