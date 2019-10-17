#!/usr/bin/env bash

# -----------------------------
# Travis CI matrix job selector
# -----------------------------

# Exit immediately on error
set -o errexit

if [ "$TEST" = "unit" ]; then

  npm run build
  npm run test:unit
  npm run dtslint

elif [ "$TEST" = "unit_and_e2e" ]; then

  npm run build
  npm run test:e2e:all
  npm run test:unit
  npm run dtslint
  npm run coveralls

fi
