#!/bin/bash
grep -i 'telemetry' -r . --exclude-dir=.git --exclude-dir=cli --exclude-dir=scripts --exclude=package.json --exclude=yarn.lock