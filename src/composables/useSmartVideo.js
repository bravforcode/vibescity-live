import { onMounted, onBeforeUnmount, ref } from 'vue';

// Singleton Observer (One to rule them all) 💍
let sharedObserver = null;
const observedElements = new Map();

/**
 * Lazy init the shared observer to save resources until needed.
 */
const getObserver = () => {
    if (sharedObserver) return sharedObserver;

    sharedObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            const video = entry.target;
            
            if (entry.isIntersecting) {
                // Feature: Auto-play when 60% visible
                if (video.readyState >= 2) {
                    // Mute first (Browser Policy)
                    // Note: We might want to respect global mute state here later
                    // But for "Entry", mute is safe.
                    // video.muted = true; // Assumed handled by prop/attribute or user pref
                    
                    const playPromise = video.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(() => {
                            // Auto-play prevented
                            // console.debug("Autoplay blocked - awaiting interaction");
                        });
                    }
                } else {
                    // If not ready, add listener to play once loaded? 
                    // Or just let the loop handle it if it triggers again?
                    // Simple approach: try load
                    video.preload = "auto";
                }
            } else {
                // Stop immediately when out of view
                video.pause();
                // Optional: Reset time? TikTok does this often, or keeps it.
                // video.currentTime = 0; 
            }
        });
    }, {
        threshold: 0.6, // Strict 60% visibility
        rootMargin: "0px"
    });

    return sharedObserver;
};

export function useSmartVideo() {
    const videoRef = ref(null);

    const registerVideo = (el) => {
        videoRef.value = el;
        if (el) {
            getObserver().observe(el);
            observedElements.set(el, true);
        }
    };

    const unregisterVideo = () => {
        if (videoRef.value && sharedObserver) {
            sharedObserver.unobserve(videoRef.value);
            observedElements.delete(videoRef.value);
        }
    };

    onMounted(() => {
        if (videoRef.value) registerVideo(videoRef.value);
    });

    onBeforeUnmount(() => {
        unregisterVideo();
    });

    return {
        videoRef,
        registerVideo
    };
}
