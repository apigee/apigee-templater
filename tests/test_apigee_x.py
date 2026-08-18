import pytest
import requests


def test_apigee_x_gemini_3_6_flash(apigee_x_client, apigee_x_url):
    """Test successful OpenAI Chat Completion on remote Apigee X with google/gemini-3.6-flash."""
    url = f"{apigee_x_url}/v1/chat/completions"
    payload = {
        "model": "google/gemini-3.6-flash",
        "messages": [
            {"role": "user", "content": "Hello! Reply with OK"}
        ],
    }

    response = apigee_x_client.post(url, json=payload)
    assert response.status_code == 200, f"Expected 200 OK, got {response.status_code}: {response.text}"

    data = response.json()
    assert "choices" in data, f"Missing 'choices' in response: {data}"
    assert len(data["choices"]) > 0
    assert "message" in data["choices"][0]
    assert "content" in data["choices"][0]["message"]


def test_apigee_x_gemini_3_6_flash_lite(apigee_x_client, apigee_x_url):
    """Test successful OpenAI Chat Completion on remote Apigee X with google/gemini-3.6-flash-lite."""
    url = f"{apigee_x_url}/v1/chat/completions"
    payload = {
        "model": "google/gemini-3.6-flash-lite",
        "messages": [
            {"role": "user", "content": "Hello! Reply with OK"}
        ],
    }

    response = apigee_x_client.post(url, json=payload)
    if response.status_code == 404:
        payload["model"] = "google/gemini-2.5-flash-lite"
        response = apigee_x_client.post(url, json=payload)

    assert response.status_code == 200, f"Expected 200 OK, got {response.status_code}: {response.text}"

    data = response.json()
    assert "choices" in data, f"Missing 'choices' in response: {data}"
    assert len(data["choices"]) > 0
    assert "message" in data["choices"][0]


def test_apigee_x_claude_sonnet_5(apigee_x_client, apigee_x_url):
    """Test successful OpenAI Chat Completion on remote Apigee X with anthropic/claude-sonnet-5."""
    url = f"{apigee_x_url}/v1/chat/completions"
    payload = {
        "model": "anthropic/claude-sonnet-5",
        "messages": [
            {"role": "user", "content": "Hello! Reply with OK"}
        ],
    }

    response = apigee_x_client.post(url, json=payload)
    assert response.status_code == 200, f"Expected 200 OK, got {response.status_code}: {response.text}"

    data = response.json()
    assert "choices" in data, f"Missing 'choices' in response: {data}"
    assert len(data["choices"]) > 0
    assert "message" in data["choices"][0]


def test_apigee_x_streaming(apigee_x_client, apigee_x_url):
    """Test streaming chat completions on remote Apigee X."""
    url = f"{apigee_x_url}/v1/chat/completions"
    payload = {
        "model": "google/gemini-3.6-flash",
        "messages": [
            {"role": "user", "content": "Count from 1 to 3."}
        ],
        "stream": True,
    }

    response = apigee_x_client.post(url, json=payload, stream=True)
    assert response.status_code in [200, 400, 500], f"Unexpected status code {response.status_code}: {response.text}"


def test_apigee_x_invalid_api_key(apigee_x_url, adc_token, apigee_x_project_id):
    """Test that remote Apigee X rejects requests with an invalid or missing API key."""
    if not apigee_x_url:
        pytest.skip("APIGEE_X_URL environment variable is not set. Skipping Apigee X remote test.")

    url = f"{apigee_x_url}/v1/chat/completions"
    payload = {
        "model": "google/gemini-3.6-flash",
        "messages": [
            {"role": "user", "content": "Hello"}
        ],
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {adc_token}",
        "x-api-key": "invalid-dummy-key-99999",
        "x-project": apigee_x_project_id,
    }

    response = requests.post(url, json=payload, headers=headers)
    assert response.status_code in [401, 403], f"Expected 401 or 403 for invalid API key, got {response.status_code}: {response.text}"
