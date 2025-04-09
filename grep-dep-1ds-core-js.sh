#!/bin/bash
exec grep -F '1ds-core-js' -r . --exclude-dir={.git,node_modules,out} --include=package.json
