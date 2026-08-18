import os
import json
import logging
import subprocess
import pytest
import requests

DEFAULT_EMULATOR_URL = "http://localhost:8998"

logger = logging.getLogger("test_suite")


class LoggingSession(requests.Session):
    """Custom requests session that automatically prints detailed HTTP request and response data (captured by pytest unless -s is passed)."""

    def request(self, method, url, **kwargs):
        headers = {**self.headers, **kwargs.get("headers", {})}
        json_data = kwargs.get("json")
        data = kwargs.get("data")

        print(f"\n=================== HTTP REQUEST ===================")
        print(f"{method.upper()} {url}")
        print(f"Headers: {json.dumps(headers, indent=2)}")
        if json_data:
            print(f"Payload:\n{json.dumps(json_data, indent=2)}")
        elif data:
            print(f"Body: {data}")

        response = super().request(method, url, **kwargs)

        print(f"=================== HTTP RESPONSE ==================")
        print(f"Status Code: {response.status_code} ({response.reason})")
        print(f"Elapsed Time: {response.elapsed.total_seconds():.3f}s")
        print(f"Response Headers: {json.dumps(dict(response.headers), indent=2)}")

        if kwargs.get("stream"):
            print("Response Body: [Streaming content]")
        else:
            try:
                parsed_json = response.json()
                print(f"Response Body:\n{json.dumps(parsed_json, indent=2)}")
            except Exception:
                print(f"Response Body: {response.text[:1000]}")
        print(f"====================================================\n")

        return response


# --- Shared Helpers ---

@pytest.fixture(scope="session")
def adc_token():
    """Retrieve gcloud Application Default Credentials access token."""
    token = os.getenv("GCLOUD_ADC_TOKEN")
    if token:
        return token
    try:
        res = subprocess.run(
            ["gcloud", "auth", "application-default", "print-access-token"],
            capture_output=True,
            text=True,
            check=True,
        )
        return res.stdout.strip()
    except Exception as e:
        pytest.skip(f"Failed to fetch gcloud application-default access token: {e}")


@pytest.fixture(scope="session")
def default_project_id():
    """Retrieve default GCP project ID from environment or gcloud config."""
    proj = os.getenv("GCP_PROJECT")
    if proj:
        return proj
    try:
        res = subprocess.run(
            ["gcloud", "config", "get-value", "project"],
            capture_output=True,
            text=True,
        )
        val = res.stdout.strip()
        if val and val != "(unset)":
            return val
    except Exception:
        pass
    return "ai-portals-solution"


# --- Emulator Fixtures ---

@pytest.fixture(scope="session")
def emulator_url():
    """Return the Apigee Emulator base URL."""
    return os.getenv("EMULATOR_URL", DEFAULT_EMULATOR_URL).rstrip("/")


@pytest.fixture(scope="session")
def emulator_project_id(default_project_id):
    """Return target project ID for local emulator requests."""
    return os.getenv("EMULATOR_PROJECT_ID", default_project_id)


@pytest.fixture(scope="session")
def gemini_api_key():
    """Return GEMINI_API_KEY from environment or skip if not provided."""
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        pytest.skip("GEMINI_API_KEY environment variable is not set.")
    return key


@pytest.fixture
def gemini_emulator_client(emulator_url, emulator_project_id):
    """Pre-configured LoggingSession for Gemini native endpoints (API key auth, no Bearer token)."""
    session = LoggingSession()
    session.headers.update(
        {
            "Content-Type": "application/json",
            "x-project": emulator_project_id,
        }
    )
    return session


@pytest.fixture
def emulator_client(emulator_url, adc_token, emulator_project_id):
    """Pre-configured LoggingSession for Local Emulator (token auth, no API key)."""
    session = LoggingSession()
    session.headers.update(
        {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {adc_token}",
            "x-project": emulator_project_id,
        }
    )
    return session


# --- Apigee X Remote Fixtures ---

@pytest.fixture(scope="session")
def apigee_x_url():
    """Return the remote Apigee X gateway base URL."""
    url = os.getenv("APIGEE_X_URL", os.getenv("APIGEE_X_HOST"))
    if not url:
        return None
    return url.rstrip("/")


@pytest.fixture(scope="session")
def apigee_x_api_key():
    """Return the API Key for remote Apigee X developer app."""
    return os.getenv("APIGEE_X_API_KEY", os.getenv("APIGEE_API_KEY"))


@pytest.fixture(scope="session")
def apigee_x_project_id(default_project_id):
    """Return target project ID for remote Apigee X requests."""
    return os.getenv("APIGEE_X_PROJECT_ID", default_project_id)


@pytest.fixture
def apigee_x_client(apigee_x_url, apigee_x_api_key, adc_token, apigee_x_project_id):
    """Pre-configured LoggingSession for Remote Apigee X (API Key + ADC token auth)."""
    if not apigee_x_url:
        pytest.skip("APIGEE_X_URL environment variable is not set. Skipping Apigee X remote test.")
    if not apigee_x_api_key:
        pytest.skip("APIGEE_X_API_KEY environment variable is not set. Skipping Apigee X remote test.")

    session = LoggingSession()
    session.headers.update(
        {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {adc_token}",
            "x-api-key": apigee_x_api_key,
            "x-project": apigee_x_project_id,
        }
    )
    return session
