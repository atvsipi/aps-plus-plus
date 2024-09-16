#!/usr/bin/sh
while true
do
	bun --trace-warnings server/index
	sleep 5
done