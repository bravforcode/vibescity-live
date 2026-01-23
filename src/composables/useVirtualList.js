/**
 * useVirtualList.js - Virtual scrolling for large lists
 * Feature #27: Virtual List for Carousel
 * 
 * Provides efficient rendering for lists with many items
 */
import { ref, computed, onMounted, onUnmounted } from 'vue';

export function useVirtualList(options = {}) {
  const {
    itemHeight = 180,
    overscan = 3,
    containerRef = null
  } = options;

  const scrollTop = ref(0);
  const containerHeight = ref(0);
  const items = ref([]);

  const visibleRange = computed(() => {
    const start = Math.floor(scrollTop.value / itemHeight);
    const visibleCount = Math.ceil(containerHeight.value / itemHeight);
    
    return {
      start: Math.max(0, start - overscan),
      end: Math.min(items.value.length, start + visibleCount + overscan)
    };
  });

  const visibleItems = computed(() => {
    const { start, end } = visibleRange.value;
    return items.value.slice(start, end).map((item, index) => ({
      ...item,
      _virtualIndex: start + index,
      _style: {
        position: 'absolute',
        top: `${(start + index) * itemHeight}px`,
        height: `${itemHeight}px`,
        width: '100%'
      }
    }));
  });

  const totalHeight = computed(() => items.value.length * itemHeight);

  const handleScroll = (e) => {
    scrollTop.value = e.target.scrollTop;
  };

  const setItems = (newItems) => {
    items.value = newItems;
  };

  const scrollToIndex = (index) => {
    if (containerRef?.value) {
      containerRef.value.scrollTop = index * itemHeight;
    }
  };

  onMounted(() => {
    if (containerRef?.value) {
      containerHeight.value = containerRef.value.clientHeight;
      
      const resizeObserver = new ResizeObserver((entries) => {
        containerHeight.value = entries[0].contentRect.height;
      });
      resizeObserver.observe(containerRef.value);
      
      return () => resizeObserver.disconnect();
    }
  });

  return {
    visibleItems,
    totalHeight,
    handleScroll,
    setItems,
    scrollToIndex,
    visibleRange
  };
}

/**
 * Horizontal virtual list for carousels
 */
export function useHorizontalVirtualList(options = {}) {
  const {
    itemWidth = 160,
    overscan = 2,
    containerRef = null
  } = options;

  const scrollLeft = ref(0);
  const containerWidth = ref(0);
  const items = ref([]);

  const visibleRange = computed(() => {
    const start = Math.floor(scrollLeft.value / itemWidth);
    const visibleCount = Math.ceil(containerWidth.value / itemWidth);
    
    return {
      start: Math.max(0, start - overscan),
      end: Math.min(items.value.length, start + visibleCount + overscan)
    };
  });

  const visibleItems = computed(() => {
    const { start, end } = visibleRange.value;
    return items.value.slice(start, end).map((item, index) => ({
      ...item,
      _virtualIndex: start + index,
      _style: {
        position: 'absolute',
        left: `${(start + index) * itemWidth}px`,
        width: `${itemWidth}px`
      }
    }));
  });

  const totalWidth = computed(() => items.value.length * itemWidth);

  const handleScroll = (e) => {
    scrollLeft.value = e.target.scrollLeft;
  };

  const setItems = (newItems) => {
    items.value = newItems;
  };

  return {
    visibleItems,
    totalWidth,
    handleScroll,
    setItems,
    visibleRange
  };
}

export default useVirtualList;
