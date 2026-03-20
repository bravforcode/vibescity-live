#!/bin/bash

# Cloudflare Worker Deployment Script
# This script deploys the CDN worker to Cloudflare

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_FILE="$SCRIPT_DIR/cloudflare-worker.js"
CONFIG_FILE="$SCRIPT_DIR/wrangler.toml"

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if wrangler is installed
    if ! command -v wrangler &> /dev/null; then
        log_error "Wrangler CLI is not installed"
        log_info "Install it with: npm install -g wrangler"
        exit 1
    fi
    
    # Check if logged in
    if ! wrangler whoami &> /dev/null; then
        log_error "Not logged in to Cloudflare"
        log_info "Login with: wrangler login"
        exit 1
    fi
    
    # Check if worker file exists
    if [ ! -f "$WORKER_FILE" ]; then
        log_error "Worker file not found: $WORKER_FILE"
        exit 1
    fi
    
    # Check if config file exists
    if [ ! -f "$CONFIG_FILE" ]; then
        log_error "Config file not found: $CONFIG_FILE"
        exit 1
    fi
    
    log_info "Prerequisites check passed"
}

validate_config() {
    log_info "Validating configuration..."
    
    # Check if account ID is set
    if grep -q "YOUR_ACCOUNT_ID" "$CONFIG_FILE"; then
        log_error "Account ID not configured in wrangler.toml"
        log_info "Update account_id in $CONFIG_FILE"
        exit 1
    fi
    
    log_info "Configuration validation passed"
}

set_secrets() {
    local ENV=$1
    
    log_info "Setting secrets for environment: $ENV"
    
    # Check if secrets are already set
    if wrangler secret list --env "$ENV" 2>/dev/null | grep -q "CACHE_PURGE_SECRET"; then
        log_warn "Secrets already set for $ENV"
        read -p "Do you want to update them? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            return
        fi
    fi
    
    # Generate random secrets if not provided
    if [ -z "$CACHE_PURGE_SECRET" ]; then
        CACHE_PURGE_SECRET=$(openssl rand -hex 32)
        log_info "Generated CACHE_PURGE_SECRET"
    fi
    
    if [ -z "$CACHE_WARM_SECRET" ]; then
        CACHE_WARM_SECRET=$(openssl rand -hex 32)
        log_info "Generated CACHE_WARM_SECRET"
    fi
    
    # Set secrets
    echo "$CACHE_PURGE_SECRET" | wrangler secret put CACHE_PURGE_SECRET --env "$ENV"
    echo "$CACHE_WARM_SECRET" | wrangler secret put CACHE_WARM_SECRET --env "$ENV"
    
    log_info "Secrets set successfully"
    log_warn "Save these secrets securely:"
    echo "CACHE_PURGE_SECRET=$CACHE_PURGE_SECRET"
    echo "CACHE_WARM_SECRET=$CACHE_WARM_SECRET"
}

deploy_worker() {
    local ENV=$1
    
    log_info "Deploying worker to environment: $ENV"
    
    cd "$SCRIPT_DIR"
    
    if [ "$ENV" = "production" ]; then
        wrangler deploy --env production
    elif [ "$ENV" = "staging" ]; then
        wrangler deploy --env staging
    else
        wrangler deploy
    fi
    
    log_info "Worker deployed successfully"
}

test_worker() {
    local ENV=$1
    local WORKER_URL=$2
    
    log_info "Testing worker deployment..."
    
    # Test basic request
    log_info "Testing basic request..."
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$WORKER_URL")
    
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
        log_info "Basic request test passed (HTTP $HTTP_CODE)"
    else
        log_error "Basic request test failed (HTTP $HTTP_CODE)"
        exit 1
    fi
    
    # Test cache headers
    log_info "Testing cache headers..."
    CACHE_STATUS=$(curl -s -I "$WORKER_URL/assets/test.js" | grep -i "x-cache-status" || echo "")
    
    if [ -n "$CACHE_STATUS" ]; then
        log_info "Cache headers present: $CACHE_STATUS"
    else
        log_warn "Cache headers not found (this may be expected for first request)"
    fi
    
    log_info "Worker tests completed"
}

configure_routes() {
    local ENV=$1
    
    log_info "Configuring routes for environment: $ENV"
    log_warn "Routes must be configured manually in Cloudflare dashboard or wrangler.toml"
    log_info "Recommended routes:"
    echo "  - vibecity.live/*"
    echo "  - www.vibecity.live/*"
    echo "  - *.vibecity.live/*"
}

show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -e, --env ENV        Environment to deploy (staging|production)"
    echo "  -s, --secrets        Set secrets only"
    echo "  -t, --test URL       Test worker at URL"
    echo "  -h, --help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --env staging"
    echo "  $0 --env production"
    echo "  $0 --secrets --env production"
}

# Main script
main() {
    local ENV="staging"
    local SECRETS_ONLY=false
    local TEST_ONLY=false
    local TEST_URL=""
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -e|--env)
                ENV="$2"
                shift 2
                ;;
            -s|--secrets)
                SECRETS_ONLY=true
                shift
                ;;
            -t|--test)
                TEST_ONLY=true
                TEST_URL="$2"
                shift 2
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    # Validate environment
    if [ "$ENV" != "staging" ] && [ "$ENV" != "production" ]; then
        log_error "Invalid environment: $ENV"
        log_info "Valid environments: staging, production"
        exit 1
    fi
    
    log_info "Starting deployment process for environment: $ENV"
    
    # Check prerequisites
    check_prerequisites
    
    # Validate configuration
    validate_config
    
    # Handle test-only mode
    if [ "$TEST_ONLY" = true ]; then
        test_worker "$ENV" "$TEST_URL"
        exit 0
    fi
    
    # Handle secrets-only mode
    if [ "$SECRETS_ONLY" = true ]; then
        set_secrets "$ENV"
        exit 0
    fi
    
    # Full deployment
    log_info "Starting full deployment..."
    
    # Set secrets
    set_secrets "$ENV"
    
    # Deploy worker
    deploy_worker "$ENV"
    
    # Configure routes
    configure_routes "$ENV"
    
    log_info "Deployment completed successfully!"
    log_info "Next steps:"
    echo "  1. Configure routes in Cloudflare dashboard"
    echo "  2. Test the worker with: $0 --test https://your-worker-url.workers.dev"
    echo "  3. Monitor cache performance in Cloudflare Analytics"
}

# Run main function
main "$@"
