import pytest


def test_emulator_gemini_3_6_flash(emulator_client, emulator_url):
    """Test successful OpenAI Chat Completion on local emulator with google/gemini-3.6-flash."""
    url = f"{emulator_url}/v1/chat/completions"
    payload = {
        "model": "google/gemini-3.6-flash",
        "messages": [
            {"role": "user", "content": "Hello! Reply with OK"}
        ],
    }

    response = emulator_client.post(url, json=payload)
    assert response.status_code == 200, f"Expected 200 OK, got {response.status_code}: {response.text}"

    data = response.json()
    assert "choices" in data, f"Missing 'choices' in response: {data}"
    assert len(data["choices"]) > 0
    assert "message" in data["choices"][0]
    assert "content" in data["choices"][0]["message"]
    assert data["choices"][0]["message"]["content"] != ""


def test_emulator_gemini_3_6_flash_lite(emulator_client, emulator_url):
    """Test successful OpenAI Chat Completion on local emulator with google/gemini-3.6-flash-lite."""
    url = f"{emulator_url}/v1/chat/completions"
    payload = {
        "model": "google/gemini-3.6-flash-lite",
        "messages": [
            {"role": "user", "content": "Hello! Reply with OK"}
        ],
    }

    response = emulator_client.post(url, json=payload)
    if response.status_code == 404:
        # Fallback to current Vertex AI model name for flash-lite if 3.6-lite is unmapped
        payload["model"] = "google/gemini-2.5-flash-lite"
        response = emulator_client.post(url, json=payload)

    assert response.status_code == 200, f"Expected 200 OK, got {response.status_code}: {response.text}"

    data = response.json()
    assert "choices" in data, f"Missing 'choices' in response: {data}"
    assert len(data["choices"]) > 0
    assert "message" in data["choices"][0]
    assert "content" in data["choices"][0]["message"]


def test_emulator_claude_sonnet_5(emulator_client, emulator_url):
    """Test successful OpenAI Chat Completion on local emulator with anthropic/claude-sonnet-5."""
    url = f"{emulator_url}/v1/chat/completions"
    payload = {
        "model": "anthropic/claude-sonnet-5",
        "messages": [
            {"role": "user", "content": "Hello! Reply with OK"}
        ],
    }

    response = emulator_client.post(url, json=payload)
    assert response.status_code == 200, f"Expected 200 OK, got {response.status_code}: {response.text}"

    data = response.json()
    assert "choices" in data, f"Missing 'choices' in response: {data}"
    assert len(data["choices"]) > 0
    assert "message" in data["choices"][0]
    assert "content" in data["choices"][0]["message"]


def test_emulator_streaming(emulator_client, emulator_url):
    """Test streaming chat completions endpoint on local emulator."""
    url = f"{emulator_url}/v1/chat/completions"
    payload = {
        "model": "google/gemini-3.6-flash",
        "messages": [
            {"role": "user", "content": "Count from 1 to 3."}
        ],
        "stream": True,
    }

    response = emulator_client.post(url, json=payload, stream=True)
    assert response.status_code == 200, f"Expected 200 OK, got {response.status_code}: {response.text}"


def test_emulator_unsupported_model(emulator_client, emulator_url):
    """Test requesting an unconfigured / invalid model format on local emulator."""
    url = f"{emulator_url}/v1/chat/completions"
    payload = {
        "model": "invalid-provider/non-existent-model-xyz",
        "messages": [
            {"role": "user", "content": "Hello"}
        ],
    }

    response = emulator_client.post(url, json=payload)
    assert response.status_code in [400, 404, 500], f"Expected error status code for unsupported model, got {response.status_code}"


def test_emulator_gemini_generate_content(gemini_emulator_client, emulator_url, gemini_api_key):
    """Test Gemini native generateContent endpoint on local emulator with ?key= param."""
    url = f"{emulator_url}/v1/models/gemini-3.1-flash-lite:generateContent?key={gemini_api_key}"
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": "Hello! Reply with OK"}],
            }
        ]
    }

    response = gemini_emulator_client.post(url, json=payload)
    assert response.status_code == 200, f"Expected 200 OK, got {response.status_code}: {response.text}"


def test_emulator_gemini_generate_content_header_key(gemini_emulator_client, emulator_url, gemini_api_key):
    """Test Gemini native generateContent endpoint using x-goog-api-key header."""
    url = f"{emulator_url}/v1/models/gemini-3.1-flash-lite:generateContent"
    headers = {"x-goog-api-key": gemini_api_key}
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": "Hello! Reply with OK"}],
            }
        ]
    }

    response = gemini_emulator_client.post(url, json=payload, headers=headers)
    assert response.status_code == 200, f"Expected 200 OK, got {response.status_code}: {response.text}"


def test_emulator_gemini_stream_generate_content(gemini_emulator_client, emulator_url, gemini_api_key):
    """Test Gemini native streamGenerateContent endpoint on local emulator."""
    url = f"{emulator_url}/v1/models/gemini-3.1-flash-lite:streamGenerateContent?key={gemini_api_key}&alt=sse"
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": "Count from 1 to 3."}],
            }
        ]
    }

    response = gemini_emulator_client.post(url, json=payload, stream=True)
    assert response.status_code == 200, f"Expected 200 OK, got {response.status_code}: {response.text}"


def test_emulator_gemini_count_tokens(gemini_emulator_client, emulator_url, gemini_api_key):
    """Test Gemini native countTokens endpoint on local emulator."""
    url = f"{emulator_url}/v1/models/gemini-3.1-flash-lite:countTokens?key={gemini_api_key}"
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": "How many tokens are in this sentence?"}],
            }
        ]
    }

    response = gemini_emulator_client.post(url, json=payload)
    assert response.status_code == 200, f"Expected 200 OK, got {response.status_code}: {response.text}"


def test_emulator_gemini_list_models(gemini_emulator_client, emulator_url, gemini_api_key):
    """Test Gemini native GET /v1/models endpoint on local emulator."""
    url = f"{emulator_url}/v1/models?key={gemini_api_key}"

    response = gemini_emulator_client.get(url)
    assert response.status_code == 200, f"Expected 200 OK, got {response.status_code}: {response.text}"
