#!/bin/bash
exec grep -F 'VS Code' -r . --exclude-dir={.git,node_modules,out,test} --exclude=*.md
