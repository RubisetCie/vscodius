#!/bin/bash
exec grep -i 'telemetry' -r . --exclude-dir={.git,node_modules,out,cli,scripts,package.json,yarn.lock}
