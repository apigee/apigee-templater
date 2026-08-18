# Apigee Proxy Integration Test Suite

This directory contains integration test suites for both the **Local Apigee Emulator** and remote **Apigee X** deployments.

## Directory Structure

- **[`conftest.py`](file:///home/tyayers/projects/dbg/tests/conftest.py)**: Shared Pytest fixtures, `LoggingSession`, and authentication management.
- **[`test_emulator.py`](file:///home/tyayers/projects/dbg/tests/test_emulator.py)**: Test suite targeting the local Apigee Emulator container.
- **[`test_apigee_x.py`](file:///home/tyayers/projects/dbg/tests/test_apigee_x.py)**: Test suite targeting remote Apigee X environments.
- **[`pytest.ini`](file:///home/tyayers/projects/dbg/pytest.ini)**: Pytest CLI configuration.

---

## Output & Verbosity Modes

Output capture is managed natively by `pytest`:

| Command | Output Behavior |
| --- | --- |
| `pytest tests/` | **Default / Clean**: Prints summary progress (`.....`). Hides all HTTP request/response logs. |
| `pytest -v tests/` | **Verbose Results**: Displays individual test names and status (`PASSED`, `SKIPPED`). Hides HTTP logs. |
| `pytest -s tests/` | **Live Debug Logs**: Disables output capture, streaming full HTTP requests and responses live. |
| `pytest -v -s tests/` | **Full Verbose + Live Debug**: Displays both individual test names and live HTTP payloads. |

> **Note on Test Failures**: If any test fails, `pytest` automatically dumps the captured HTTP request and response payload for that specific failing test.

---

## Environment Variables & Running Tests

Copy and paste the code snippets below into your terminal to configure environment variables and execute the tests.

### 1. Local Emulator Configuration

Local emulator tests support both OpenAI Chat Completions (`/v1/chat/completions`) and Gemini Native (`/v1/models`) endpoints. 

- **OpenAI Chat Completions** endpoints use `GCLOUD_ADC_TOKEN` for authentication.
- **Gemini Native** endpoints (`ai-generate-content.yaml`) use `GEMINI_API_KEY` (passed via query parameter `?key=...` or `x-goog-api-key` header). If `GEMINI_API_KEY` is not provided, a default test key (`test-api-key-12345`) is used.

```bash
# Optional overrides (defaults shown below):
export EMULATOR_URL="http://localhost:8998"
export EMULATOR_PROJECT_ID="ai-portals-solution"
export GCLOUD_ADC_TOKEN="$(gcloud auth application-default print-access-token)"
export GEMINI_API_KEY="your-gemini-api-key"

# Run local emulator test suite:
pytest tests/test_emulator.py
```

#### Inline Execution with Gemini API Key:

```bash
GEMINI_API_KEY="your-gemini-api-key" pytest tests/test_emulator.py
```

### 2. Remote Apigee X Configuration

Remote Apigee X tests require target URL and developer app API key:

```bash
# Required remote configuration:
export APIGEE_X_URL="https://api.your-domain.com"
export APIGEE_X_API_KEY="your-apigee-x-api-key"

# Optional overrides:
export APIGEE_X_PROJECT_ID="$(gcloud config get-value project 2>/dev/null || echo 'ai-portals-solution')"
export GCLOUD_ADC_TOKEN="$(gcloud auth application-default print-access-token)"

# Run remote Apigee X test suite:
pytest tests/test_apigee_x.py
```

#### Inline Single-Line Execution Example

```bash
APIGEE_X_URL="https://api.your-domain.com" APIGEE_X_API_KEY="your-api-key" pytest tests/test_apigee_x.py
```
