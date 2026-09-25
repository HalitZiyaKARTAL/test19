#!/bin/bash
# mx.sh name query budget
cd "$(dirname "$0")"; ./runS_claudeedit1.sh "$2" ${3:-40000} > mx/$1.json
