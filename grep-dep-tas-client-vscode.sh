#!/bin/bash
exec grep -F 'vscode-tas-client' -r . --exclude-dir={.git,node_modules,out} --include=package.json
