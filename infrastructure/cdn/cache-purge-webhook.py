"""
Cache Purge Webhook Handler

This script provides utilities to purge CDN cache via webhook.
Can be integrated into CI/CD pipelines or triggered manually.
"""

import os
import sys
import json
import requests
from typing import List, Optional
from datetime import datetime


class CachePurgeClient:
    """Client for purging CDN cache"""
    
    def __init__(self, worker_url: str, secret: str):
        """
        Initialize cache purge client
        
        Args:
            worker_url: Cloudflare Worker URL
            secret: Cache purge secret
        """
        self.worker_url = worker_url.rstrip('/')
        self.secret = secret
        self.purge_endpoint = f"{self.worker_url}/__cache/purge"
    
    def purge_patterns(self, patterns: List[str]) -> dict:
        """
        Purge cache by URL patterns
        
        Args:
            patterns: List of regex patterns to purge
            
        Returns:
            Response from purge endpoint
        """
        payload = {
            "secret": self.secret,
            "patterns": patterns
        }
        
        try:
            response = requests.post(
                self.purge_endpoint,
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def purge_all(self) -> dict:
        """
        Purge all cached content
        
        Returns:
            Response from purge endpoint
        """
        return self.purge_patterns([".*"])
    
    def purge_static_assets(self) -> dict:
        """
        Purge all static assets (JS, CSS, images)
        
        Returns:
            Response from purge endpoint
        """
        patterns = [
            r".*\.(js|css)$",
            r".*\.(jpg|jpeg|png|gif|svg|webp|avif)$",
            r".*\.(woff|woff2|ttf|otf|eot)$"
        ]
        return self.purge_patterns(patterns)
    
    def purge_api_cache(self) -> dict:
        """
        Purge API response cache
        
        Returns:
            Response from purge endpoint
        """
        patterns = [
            r"^/api/v1/.*"
        ]
        return self.purge_patterns(patterns)
    
    def purge_html_pages(self) -> dict:
        """
        Purge HTML pages
        
        Returns:
            Response from purge endpoint
        """
        patterns = [
            r".*\.html$",
            r"^/$",
            r"^/map$",
            r"^/about$"
        ]
        return self.purge_patterns(patterns)


class CacheWarmClient:
    """Client for warming CDN cache"""
    
    def __init__(self, worker_url: str, secret: str):
        """
        Initialize cache warm client
        
        Args:
            worker_url: Cloudflare Worker URL
            secret: Cache warm secret
        """
        self.worker_url = worker_url.rstrip('/')
        self.secret = secret
        self.warm_endpoint = f"{self.worker_url}/__cache/warm"
    
    def warm_urls(self, urls: Optional[List[str]] = None) -> dict:
        """
        Warm cache for specific URLs
        
        Args:
            urls: List of URLs to warm (None = use default critical pages)
            
        Returns:
            Response from warm endpoint
        """
        payload = {
            "secret": self.secret
        }
        
        if urls:
            payload["urls"] = urls
        
        try:
            response = requests.post(
                self.warm_endpoint,
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def warm_critical_pages(self) -> dict:
        """
        Warm cache for critical pages
        
        Returns:
            Response from warm endpoint
        """
        urls = [
            "/",
            "/map",
            "/api/v1/shops?province=Bangkok",
            "/api/v1/venues?featured=true"
        ]
        return self.warm_urls(urls)


def main():
    """Main CLI interface"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="CDN Cache Management Tool"
    )
    
    parser.add_argument(
        "action",
        choices=["purge", "warm"],
        help="Action to perform"
    )
    
    parser.add_argument(
        "--worker-url",
        required=True,
        help="Cloudflare Worker URL"
    )
    
    parser.add_argument(
        "--secret",
        help="Cache secret (or set CACHE_SECRET env var)"
    )
    
    parser.add_argument(
        "--type",
        choices=["all", "static", "api", "html", "patterns", "critical"],
        default="all",
        help="Type of content to purge/warm"
    )
    
    parser.add_argument(
        "--patterns",
        nargs="+",
        help="Custom patterns to purge (for --type patterns)"
    )
    
    parser.add_argument(
        "--urls",
        nargs="+",
        help="Custom URLs to warm (for --type patterns)"
    )
    
    args = parser.parse_args()
    
    # Get secret from args or environment
    secret = args.secret or os.getenv("CACHE_SECRET")
    if not secret:
        print("Error: Secret not provided. Use --secret or set CACHE_SECRET env var")
        sys.exit(1)
    
    # Perform action
    if args.action == "purge":
        client = CachePurgeClient(args.worker_url, secret)
        
        print(f"Purging cache: {args.type}")
        
        if args.type == "all":
            result = client.purge_all()
        elif args.type == "static":
            result = client.purge_static_assets()
        elif args.type == "api":
            result = client.purge_api_cache()
        elif args.type == "html":
            result = client.purge_html_pages()
        elif args.type == "patterns":
            if not args.patterns:
                print("Error: --patterns required for --type patterns")
                sys.exit(1)
            result = client.purge_patterns(args.patterns)
        else:
            print(f"Error: Unknown purge type: {args.type}")
            sys.exit(1)
    
    elif args.action == "warm":
        client = CacheWarmClient(args.worker_url, secret)
        
        print(f"Warming cache: {args.type}")
        
        if args.type == "critical":
            result = client.warm_critical_pages()
        elif args.type == "patterns" or args.type == "all":
            result = client.warm_urls(args.urls)
        else:
            print(f"Error: Unknown warm type: {args.type}")
            sys.exit(1)
    
    # Print result
    print("\nResult:")
    print(json.dumps(result, indent=2))
    
    if result.get("success"):
        print("\n✓ Operation completed successfully")
        sys.exit(0)
    else:
        print("\n✗ Operation failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
