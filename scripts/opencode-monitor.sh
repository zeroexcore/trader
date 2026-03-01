#!/bin/bash
# OpenCode-based trading monitor
# Runs OpenCode with trading prompt for intelligent decision making

cd /Users/runcible/code/runcible/trader

# Run OpenCode with the trading prompt
/Users/runcible/.opencode/bin/opencode run "$(cat prompts/monitor-and-trade.md)" \
  --format json \
  >> opencode-monitor.log 2>&1

# Append timestamp
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Monitor run completed" >> opencode-monitor.log
