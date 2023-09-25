#!/bin/bash
grep -F 'extension-telemetry' -r . --exclude-dir=.git --include=package.json