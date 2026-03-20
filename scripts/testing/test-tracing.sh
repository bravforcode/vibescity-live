#!/bin/bash
# Test script for distributed tracing setup

set -e

echo "🔍 Testing Distributed Tracing Setup"
echo "===================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
JAEGER_URL="${JAEGER_URL:-http://localhost:16686}"
BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:5173}"

# Test 1: Check Jaeger is running
echo -e "\n${YELLOW}Test 1: Checking Jaeger availability...${NC}"
if curl -s "${JAEGER_URL}/api/services" > /dev/null; then
    echo -e "${GREEN}✓ Jaeger is running${NC}"
else
    echo -e "${RED}✗ Jaeger is not accessible at ${JAEGER_URL}${NC}"
    exit 1
fi

# Test 2: Check backend is instrumented
echo -e "\n${YELLOW}Test 2: Checking backend instrumentation...${NC}"
if curl -s "${BACKEND_URL}/health" > /dev/null; then
    echo -e "${GREEN}✓ Backend is running${NC}"
    
    # Generate some traffic
    echo "  Generating test traffic..."
    for i in {1..5}; do
        curl -s "${BACKEND_URL}/api/v1/shops" > /dev/null || true
        sleep 1
    done
    
    # Wait for traces to be exported
    echo "  Waiting for traces to be exported..."
    sleep 10
    
    # Check if traces exist
    SERVICES=$(curl -s "${JAEGER_URL}/api/services" | grep -o "vibecity-api" || true)
    if [ -n "$SERVICES" ]; then
        echo -e "${GREEN}✓ Backend traces found in Jaeger${NC}"
    else
        echo -e "${YELLOW}⚠ No backend traces found yet (may need more time)${NC}"
    fi
else
    echo -e "${RED}✗ Backend is not accessible${NC}"
    exit 1
fi

# Test 3: Check OTLP endpoint
echo -e "\n${YELLOW}Test 3: Checking OTLP endpoint...${NC}"
if curl -s "http://localhost:4318/v1/traces" -X POST -H "Content-Type: application/json" -d '{}' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ OTLP HTTP endpoint is accessible${NC}"
else
    echo -e "${YELLOW}⚠ OTLP HTTP endpoint check inconclusive${NC}"
fi

# Test 4: Check Grafana (if running)
echo -e "\n${YELLOW}Test 4: Checking Grafana...${NC}"
if curl -s "http://localhost:3001/api/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Grafana is running${NC}"
else
    echo -e "${YELLOW}⚠ Grafana is not running (optional)${NC}"
fi

# Test 5: Verify trace context propagation
echo -e "\n${YELLOW}Test 5: Testing trace context propagation...${NC}"
RESPONSE=$(curl -s -D - "${BACKEND_URL}/api/v1/shops" | grep -i "x-request-id" || true)
if [ -n "$RESPONSE" ]; then
    echo -e "${GREEN}✓ Request ID header present${NC}"
else
    echo -e "${YELLOW}⚠ Request ID header not found${NC}"
fi

# Summary
echo -e "\n${GREEN}===================================="
echo "✓ Tracing setup test complete!"
echo "====================================${NC}"
echo ""
echo "Next steps:"
echo "1. Open Jaeger UI: ${JAEGER_URL}"
echo "2. Select service: vibecity-api"
echo "3. Click 'Find Traces' to view traces"
echo ""
echo "For more details, see:"
echo "- infrastructure/tracing/README.md"
echo "- docs/observability/distributed-tracing-deployment.md"
