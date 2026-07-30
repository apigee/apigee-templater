SESSION_ID=$(curl -X POST "http://localhost:8080/v1/emulator/trace?proxyName=completions-v1" | jq --raw-output '.name')
