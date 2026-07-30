# chat completions
# SUCCESS - working.
curl -i -X POST "http://localhost:8998/v1/chat/completions" \
     -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
     -H "Content-Type: application/json; charset=utf-8" \
    -d '
{
  "model": "google/gemini-flash-latest",
  "stream": true,
  "messages": [{
    "role": "user",
    "content": "Why is the sky blue?"
  }]
}'

# eu
# SUCCESS - working.
curl -i -X POST "http://localhost:8998/v1/chat/completions" \
     -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
     -H "Content-Type: application/json; charset=utf-8" \
    -d '
{
  "model": "google-eu/gemini-3.5-flash",
  "stream": true,
  "messages": [{
    "role": "user",
    "content": "Why is the sky blue?"
  }]
}'

# /embeddings
# FAIL - 404 - OpenMaaS model: 'google/text-embedding-004' not supported.
curl -i -X POST "http://localhost:8998/v1/embeddings" \
  -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google-eu/text-embedding-004",
    "input": "The quick brown fox jumps over the lazy dog"
  }'

  # /images/generations
  # FAIL - 404 - projects/ai-portals-solution/locations/us-central1/publishers/google/models/imagen-3.0-generate-002 not found
curl -i -X POST "http://localhost:8998/v1/images/generations" \
  -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/imagen-3.0-generate-002",
    "prompt": "A cute red panda wearing a tiny wizard hat",
    "n": 1,
    "response_format": "b64_json"
  }'

# /audio/transcriptions
# FAIL - curl error - failed to open/read local data from file/application
curl -i -X POST "http://localhost:8998/v1/audio/transcriptions" \
  -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/path/to/sample.mp3" \
  -F "model=openai/whisper-1"

# /audio/speech
# FAIL - 421 Misdirected Request
curl -i -X POST "http://localhost:8998/v1/audio/speech" \
  -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/tts-1",
    "input": "Hello! This is a test of the text to speech API.",
    "voice": "alloy"
  }' \
  --output output.mp3
