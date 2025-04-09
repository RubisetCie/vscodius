#!/bin/bash
exec grep -F 'extension-telemetry' -r . --exclude-dir={.git,node_modules,out} --include=package.json
