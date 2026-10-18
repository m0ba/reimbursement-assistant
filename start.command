#!/bin/bash
cd "$(dirname "$0")" || exit 1
PORT=4173 node server.mjs &
sleep 1
open "http://localhost:4173"
wait
