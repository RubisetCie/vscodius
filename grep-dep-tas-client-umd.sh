#!/bin/bash
exec grep -F 'tas-client-umd' -r . --exclude-dir={.git,node_modules,out} --include=package.json
