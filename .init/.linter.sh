#!/bin/bash
cd /home/kavia/workspace/code-generation/5g-drive-test-tracking-and-analytics-platform-9135-9144/frontend_portal
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

