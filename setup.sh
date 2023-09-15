#!/bin/sh
docker compose up -d postgis
# We need postgis image to be running before yarn setup.
# We cannot make yarn setup be a build step, because postgis container is not
# accessible trough "postgis" hostname at that time.
docker compose run app yarn setup

# now, you can run docker compose up normally
