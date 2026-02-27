import { onUnmounted, ref } from "vue";

export function useAudioSystem() {
	const isMuted = ref(true); // Default muted (browser policy)
	const currentZone = ref("default");
	const currentWeather = ref(null);
	const audioContext = ref(null);
	const activeSource = ref(null);
	const gainNode = ref(null);
	const started = ref(false);

	// Map Zones to Audio Files
	// TODO: Replace with real assets or CDN links
	const tracks = {
		default: "https://cdn.pixabay.com/audio/2022/03/15/audio_73147.mp3", // City Ambience
		nightlife: "https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d2.mp3", // Soft House Beat
		nature: "https://cdn.pixabay.com/audio/2021/09/06/audio_32c023506b.mp3", // Forest/Wind
		temple: "https://cdn.pixabay.com/audio/2022/10/14/audio_34b075e72e.mp3", // Bell/Chime
	};

	const audioCache = {};
	const pendingFetches = {}; // ✅ Track pending fetch promises to avoid race conditions

	const initAudio = () => {
		if (audioContext.value) return;
		const AudioContext =
			globalThis.AudioContext || globalThis.webkitAudioContext;
		if (!AudioContext) return;
		audioContext.value = new AudioContext();
		gainNode.value = audioContext.value.createGain();
		gainNode.value.connect(audioContext.value.destination);
		gainNode.value.gain.value = isMuted.value ? 0 : 0.5;
	};

	const loadTrack = async (url) => {
		// Return cached buffer if available
		if (audioCache[url]) return audioCache[url];

		// Return pending fetch promise to avoid duplicate requests
		if (pendingFetches[url]) return pendingFetches[url];

		// Start new fetch and cache the promise
		pendingFetches[url] = (async () => {
			try {
				const response = await fetch(url);
				if (!response.ok) {
					console.warn(`Failed to fetch audio (${response.status}):`, url);
					return null;
				}
				const arrayBuffer = await response.arrayBuffer();
				const decodedBuffer =
					await audioContext.value.decodeAudioData(arrayBuffer);
				audioCache[url] = decodedBuffer;
				return decodedBuffer;
			} catch (e) {
				console.warn("Failed to load audio:", url, e);
				return null;
			} finally {
				delete pendingFetches[url];
			}
		})();

		return pendingFetches[url];
	};

	const playZoneTrack = async (zone) => {
		// If not initialized (waiting for user interaction), skip real playback logic until unmute
		if (!audioContext.value) return;

		if (audioContext.value.state === "suspended") {
			await audioContext.value.resume();
		}

		const url = tracks[zone] || tracks.default;
		const buffer = await loadTrack(url);
		if (!buffer) return;

		// Crossfade Logic could go here (simplified for now: stop -> play)
		if (activeSource.value) {
			// Stop and disconnect old source to prevent memory leak
			try {
				activeSource.value.stop();
				activeSource.value.disconnect();
			} catch (e) {
				console.debug("Error stopping previous audio source:", e);
			}
		}

		const source = audioContext.value.createBufferSource();
		source.buffer = buffer;
		source.loop = true;
		source.connect(gainNode.value);
		source.start(0);
		activeSource.value = source;
	};

	const setZone = (zone) => {
		if (currentZone.value === zone) return;
		currentZone.value = zone;
		if (!isMuted.value) {
			playZoneTrack(zone);
		}
	};

	/** Stop all audio playback and reset state */
	const stop = () => {
		if (activeSource.value) {
			try {
				activeSource.value.stop();
				activeSource.value.disconnect();
			} catch {
				// Ignore errors during stop
			}
			activeSource.value = null;
		}
	};

	/** Set weather condition for ambient audio adjustments */
	const setWeather = (condition) => {
		currentWeather.value = condition;
		// Weather-based audio adjustments could go here in the future
		// For now this is a no-op stub to prevent runtime errors
	};

	/** Set audio volume (0.0 - 1.0) */
	const setVolume = (vol) => {
		if (!gainNode.value || !audioContext.value) return;
		const clamped = Math.max(0, Math.min(1, vol));
		try {
			gainNode.value.gain.setTargetAtTime(
				isMuted.value ? 0 : clamped,
				audioContext.value.currentTime,
				0.1,
			);
		} catch {
			// Ignore if context is closed
		}
	};

	/** Ensure audio context is started (call on user gesture) */
	const ensureStarted = () => {
		if (started.value) return;
		started.value = true;
		if (!audioContext.value) {
			initAudio();
		}
		if (audioContext.value?.state === "suspended") {
			audioContext.value.resume().catch(() => {});
		}
		if (!isMuted.value && !activeSource.value) {
			playZoneTrack(currentZone.value);
		}
	};

	const toggleMute = () => {
		isMuted.value = !isMuted.value;

		if (!audioContext.value) {
			initAudio();
		}

		if (!audioContext.value) return;

		if (isMuted.value) {
			if (gainNode.value)
				gainNode.value.gain.setTargetAtTime(
					0,
					audioContext.value.currentTime,
					0.5,
				);
		} else {
			if (gainNode.value)
				gainNode.value.gain.setTargetAtTime(
					0.5,
					audioContext.value.currentTime,
					0.5,
				);
			// Ensure track is playing
			if (!activeSource.value) {
				playZoneTrack(currentZone.value);
			}
			// Resume context if suspended
			if (audioContext.value.state === "suspended") {
				audioContext.value.resume();
			}
		}
	};

	// ✅ Cleanup on unmount
	onUnmounted(() => {
		// Stop active source
		stop();

		// Close audio context
		if (audioContext.value && audioContext.value.state !== "closed") {
			audioContext.value.close().catch(() => {});
			audioContext.value = null;
		}

		gainNode.value = null;
	});

	return {
		isMuted,
		toggleMute,
		setZone,
		stop,
		setWeather,
		setVolume,
		ensureStarted,
	};
}
