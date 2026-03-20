"""Manual test script to verify CORS configuration for Mapbox directions proxy.

Run this script with the backend server running to verify CORS headers are present.
"""

import requests


def test_cors_preflight():
    """Test OPTIONS preflight request."""
    print("Testing OPTIONS preflight request...")
    
    response = requests.options(
        "http://localhost:8000/api/v1/proxy/mapbox-directions",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Content-Type,X-Mapbox-Token",
        },
    )
    
    print(f"Status Code: {response.status_code}")
    print("CORS Headers:")
    for header, value in response.headers.items():
        if "access-control" in header.lower():
            print(f"  {header}: {value}")
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    assert "access-control-allow-origin" in response.headers, "Missing Access-Control-Allow-Origin"
    print("✅ OPTIONS preflight test passed!\n")


def test_cors_get_request():
    """Test GET request includes CORS headers."""
    print("Testing GET request CORS headers...")
    
    # This will fail with 422 due to missing params, but we can check CORS headers
    response = requests.get(
        "http://localhost:8000/api/v1/proxy/mapbox-directions",
        headers={"Origin": "http://localhost:5173"},
    )
    
    print(f"Status Code: {response.status_code}")
    print("CORS Headers:")
    for header, value in response.headers.items():
        if "access-control" in header.lower():
            print(f"  {header}: {value}")
    
    assert "access-control-allow-origin" in response.headers, "Missing Access-Control-Allow-Origin"
    print("✅ GET request CORS test passed!\n")


def test_lan_origin():
    """Test LAN IP origin is allowed."""
    print("Testing LAN IP origin (172.27.16.1)...")
    
    response = requests.options(
        "http://localhost:8000/api/v1/proxy/mapbox-directions",
        headers={
            "Origin": "http://172.27.16.1:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    
    print(f"Status Code: {response.status_code}")
    print("CORS Headers:")
    for header, value in response.headers.items():
        if "access-control" in header.lower():
            print(f"  {header}: {value}")
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    print("✅ LAN origin test passed!\n")


if __name__ == "__main__":
    print("=" * 60)
    print("CORS Configuration Manual Test")
    print("=" * 60)
    print("Make sure the backend server is running on http://localhost:8000\n")
    
    try:
        test_cors_preflight()
        test_cors_get_request()
        test_lan_origin()
        print("=" * 60)
        print("✅ All CORS tests passed!")
        print("=" * 60)
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
    except requests.exceptions.ConnectionError:
        print("\n❌ Could not connect to backend server.")
        print("Please start the backend server first: python backend/run_backend.py")
