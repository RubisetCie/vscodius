#!/bin/bash
exec grep -F 'Visual Studio Code' -r . --exclude-dir={.git,node_modules,out,test} --exclude=*.md
