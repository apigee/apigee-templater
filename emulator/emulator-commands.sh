# Set a proxy to focus on
PROXY=ai-chat-completions-v1

# Start a trace session and save the session id
export SESSION_ID=$(curl -X POST "http://localhost:8080/v1/emulator/trace?proxyName=$PROXY" | jq --raw-output '.name')

# Stop trace and write output to trace.json. Open in trace.html to view.
curl -X GET "http://localhost:8080/v1/emulator/trace/transactions?sessionid=$SESSION_ID" > emulator/trace.json

# Get deployment inforation
curl "http://localhost:8080/v1/emulator/tree" > emulator/tree.json

# Get environment kvm data
curl "http://localhost:8080/v1/emulator/test/maps" > emulator/maps.json
