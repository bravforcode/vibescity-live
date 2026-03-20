"""
CDN Performance Testing Script

Tests CDN performance across different geographic regions and measures:
- Latency from different locations
- Cache hit rates
- Response times
- Geographic routing effectiveness
"""

import time
import statistics
import requests
from typing import List, Dict, Tuple
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor, as_completed


@dataclass
class PerformanceMetrics:
    """Performance metrics for a single request"""
    url: str
    location: str
    status_code: int
    response_time: float
    cache_status: str
    cache_age: int
    ttfb: float  # Time to first byte
    total_time: float
    content_length: int


class CDNPerformanceTester:
    """Test CDN performance across regions"""
    
    def __init__(self, base_url: str):
        """
        Initialize performance tester
        
        Args:
            base_url: Base URL of the CDN
        """
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
    
    def test_url(self, url: str, location: str = "local") -> PerformanceMetrics:
        """
        Test a single URL and collect metrics
        
        Args:
            url: URL to test
            location: Geographic location identifier
            
        Returns:
            Performance metrics
        """
        full_url = f"{self.base_url}{url}"
        
        start_time = time.time()
        
        try:
            response = self.session.get(
                full_url,
                timeout=30,
                stream=True
            )
            
            # Time to first byte
            ttfb = time.time() - start_time
            
            # Read full response
            content = response.content
            total_time = time.time() - start_time
            
            # Extract cache headers
            cache_status = response.headers.get('X-Cache-Status', 'UNKNOWN')
            cache_age = int(response.headers.get('X-Cache-Age', 0))
            
            return PerformanceMetrics(
                url=url,
                location=location,
                status_code=response.status_code,
                response_time=total_time * 1000,  # Convert to ms
                cache_status=cache_status,
                cache_age=cache_age,
                ttfb=ttfb * 1000,  # Convert to ms
                total_time=total_time * 1000,  # Convert to ms
                content_length=len(content)
            )
        
        except requests.exceptions.RequestException as e:
            return PerformanceMetrics(
                url=url,
                location=location,
                status_code=0,
                response_time=0,
                cache_status='ERROR',
                cache_age=0,
                ttfb=0,
                total_time=0,
                content_length=0
            )
    
    def test_urls_multiple_times(
        self,
        urls: List[str],
        iterations: int = 10,
        location: str = "local"
    ) -> List[PerformanceMetrics]:
        """
        Test multiple URLs multiple times
        
        Args:
            urls: List of URLs to test
            iterations: Number of times to test each URL
            location: Geographic location identifier
            
        Returns:
            List of performance metrics
        """
        results = []
        
        for url in urls:
            print(f"Testing {url} ({iterations} iterations)...")
            
            for i in range(iterations):
                metrics = self.test_url(url, location)
                results.append(metrics)
                
                # Small delay between requests
                time.sleep(0.1)
        
        return results
    
    def test_cache_effectiveness(
        self,
        url: str,
        iterations: int = 5
    ) -> Tuple[int, int]:
        """
        Test cache effectiveness by making multiple requests
        
        Args:
            url: URL to test
            iterations: Number of requests to make
            
        Returns:
            Tuple of (cache_hits, cache_misses)
        """
        cache_hits = 0
        cache_misses = 0
        
        print(f"Testing cache effectiveness for {url}...")
        
        for i in range(iterations):
            metrics = self.test_url(url)
            
            if metrics.cache_status == 'HIT':
                cache_hits += 1
            elif metrics.cache_status == 'MISS':
                cache_misses += 1
            
            print(f"  Request {i+1}: {metrics.cache_status} "
                  f"({metrics.response_time:.2f}ms)")
            
            time.sleep(0.5)
        
        return cache_hits, cache_misses
    
    def analyze_results(
        self,
        results: List[PerformanceMetrics]
    ) -> Dict:
        """
        Analyze performance test results
        
        Args:
            results: List of performance metrics
            
        Returns:
            Analysis summary
        """
        if not results:
            return {}
        
        # Filter successful requests
        successful = [r for r in results if r.status_code == 200]
        
        if not successful:
            return {
                "error": "No successful requests",
                "total_requests": len(results)
            }
        
        # Calculate statistics
        response_times = [r.response_time for r in successful]
        ttfbs = [r.ttfb for r in successful]
        
        # Cache statistics
        cache_hits = len([r for r in successful if r.cache_status == 'HIT'])
        cache_misses = len([r for r in successful if r.cache_status == 'MISS'])
        cache_bypasses = len([r for r in successful if r.cache_status == 'BYPASS'])
        
        return {
            "total_requests": len(results),
            "successful_requests": len(successful),
            "failed_requests": len(results) - len(successful),
            
            "response_time": {
                "min": min(response_times),
                "max": max(response_times),
                "mean": statistics.mean(response_times),
                "median": statistics.median(response_times),
                "p95": statistics.quantiles(response_times, n=20)[18],  # 95th percentile
                "p99": statistics.quantiles(response_times, n=100)[98],  # 99th percentile
            },
            
            "ttfb": {
                "min": min(ttfbs),
                "max": max(ttfbs),
                "mean": statistics.mean(ttfbs),
                "median": statistics.median(ttfbs),
            },
            
            "cache": {
                "hits": cache_hits,
                "misses": cache_misses,
                "bypasses": cache_bypasses,
                "hit_rate": cache_hits / len(successful) if successful else 0,
            }
        }
    
    def print_analysis(self, analysis: Dict):
        """
        Print analysis results in a readable format
        
        Args:
            analysis: Analysis dictionary
        """
        print("\n" + "="*60)
        print("CDN PERFORMANCE ANALYSIS")
        print("="*60)
        
        if "error" in analysis:
            print(f"\nError: {analysis['error']}")
            return
        
        print(f"\nTotal Requests: {analysis['total_requests']}")
        print(f"Successful: {analysis['successful_requests']}")
        print(f"Failed: {analysis['failed_requests']}")
        
        print("\nResponse Time (ms):")
        rt = analysis['response_time']
        print(f"  Min:    {rt['min']:.2f}")
        print(f"  Max:    {rt['max']:.2f}")
        print(f"  Mean:   {rt['mean']:.2f}")
        print(f"  Median: {rt['median']:.2f}")
        print(f"  P95:    {rt['p95']:.2f}")
        print(f"  P99:    {rt['p99']:.2f}")
        
        print("\nTime to First Byte (ms):")
        ttfb = analysis['ttfb']
        print(f"  Min:    {ttfb['min']:.2f}")
        print(f"  Max:    {ttfb['max']:.2f}")
        print(f"  Mean:   {ttfb['mean']:.2f}")
        print(f"  Median: {ttfb['median']:.2f}")
        
        print("\nCache Performance:")
        cache = analysis['cache']
        print(f"  Hits:     {cache['hits']}")
        print(f"  Misses:   {cache['misses']}")
        print(f"  Bypasses: {cache['bypasses']}")
        print(f"  Hit Rate: {cache['hit_rate']:.2%}")
        
        print("\n" + "="*60)


def main():
    """Main CLI interface"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="CDN Performance Testing Tool"
    )
    
    parser.add_argument(
        "--url",
        required=True,
        help="Base URL of the CDN"
    )
    
    parser.add_argument(
        "--test-urls",
        nargs="+",
        default=["/", "/api/v1/shops", "/assets/main.js"],
        help="URLs to test"
    )
    
    parser.add_argument(
        "--iterations",
        type=int,
        default=10,
        help="Number of iterations per URL"
    )
    
    parser.add_argument(
        "--location",
        default="local",
        help="Geographic location identifier"
    )
    
    parser.add_argument(
        "--cache-test",
        action="store_true",
        help="Run cache effectiveness test"
    )
    
    args = parser.parse_args()
    
    tester = CDNPerformanceTester(args.url)
    
    if args.cache_test:
        # Test cache effectiveness
        print("\n" + "="*60)
        print("CACHE EFFECTIVENESS TEST")
        print("="*60 + "\n")
        
        for url in args.test_urls:
            hits, misses = tester.test_cache_effectiveness(url, args.iterations)
            hit_rate = hits / (hits + misses) if (hits + misses) > 0 else 0
            
            print(f"\n{url}:")
            print(f"  Cache Hits:   {hits}")
            print(f"  Cache Misses: {misses}")
            print(f"  Hit Rate:     {hit_rate:.2%}")
    
    else:
        # Test performance
        print("\n" + "="*60)
        print("CDN PERFORMANCE TEST")
        print("="*60 + "\n")
        
        results = tester.test_urls_multiple_times(
            args.test_urls,
            args.iterations,
            args.location
        )
        
        analysis = tester.analyze_results(results)
        tester.print_analysis(analysis)
        
        # Performance targets
        print("\nPerformance Targets:")
        rt_mean = analysis['response_time']['mean']
        cache_hit_rate = analysis['cache']['hit_rate']
        
        if rt_mean < 200:
            print(f"  ✓ Response time: {rt_mean:.2f}ms (target: <200ms)")
        else:
            print(f"  ✗ Response time: {rt_mean:.2f}ms (target: <200ms)")
        
        if cache_hit_rate > 0.8:
            print(f"  ✓ Cache hit rate: {cache_hit_rate:.2%} (target: >80%)")
        else:
            print(f"  ✗ Cache hit rate: {cache_hit_rate:.2%} (target: >80%)")


if __name__ == "__main__":
    main()
