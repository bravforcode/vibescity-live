import { ref, watch, onMounted, onUnmounted } from 'vue';

export function useAudioSystem() {
  const isMuted = ref(true); // Default muted (browser policy)
  const currentZone = ref("default");
  const audioContext = ref(null);
  const activeSource = ref(null);
  const gainNode = ref(null);

  // Map Zones to Audio Files
  // TODO: Replace with real assets or CDN links
  const tracks = {
    default: "https://cdn.pixabay.com/audio/2022/03/15/audio_73147.mp3", // City Ambience
    nightlife: "https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d2.mp3", // Soft House Beat
    nature: "https://cdn.pixabay.com/audio/2021/09/06/audio_32c023506b.mp3", // Forest/Wind
    temple: "https://cdn.pixabay.com/audio/2022/10/14/audio_34b075e72e.mp3", // Bell/Chime
  };

  const audioCache = {};

  const initAudio = () => {
    if (audioContext.value) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioContext.value = new AudioContext();
    gainNode.value = audioContext.value.createGain();
    gainNode.value.connect(audioContext.value.destination);
    gainNode.value.gain.value = isMuted.value ? 0 : 0.5;
  };

  const loadTrack = async (url) => {
    if (audioCache[url]) return audioCache[url];
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const decodedBuffer = await audioContext.value.decodeAudioData(arrayBuffer);
      audioCache[url] = decodedBuffer;
      return decodedBuffer;
    } catch (e) {
      console.warn("Failed to load audio:", url, e);
      return null;
    }
  };

  const playZoneTrack = async (zone) => {
    // If not initialized (waiting for user interaction), skip real playback logic until unmute
    if (!audioContext.value) return;

    if (audioContext.value.state === 'suspended') {
      await audioContext.value.resume();
    }

    const url = tracks[zone] || tracks.default;
    const buffer = await loadTrack(url);
    if (!buffer) return;

    // Crossfade Logic could go here (simplified for now: stop -> play)
    if (activeSource.value) {
        // Fade out old source?
        // simple stop for MVP
        try { activeSource.value.stop(); } catch(e){}
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

  const toggleMute = () => {
    isMuted.value = !isMuted.value;
    
    if (!audioContext.value) {
      initAudio();
    }

    if (isMuted.value) {
      if (gainNode.value) gainNode.value.gain.setTargetAtTime(0, audioContext.value.currentTime, 0.5);
    } else {
      if (gainNode.value) gainNode.value.gain.setTargetAtTime(0.5, audioContext.value.currentTime, 0.5);
      // Ensure track is playing
      if (!activeSource.value) {
        playZoneTrack(currentZone.value);
      }
      // Resume context if suspended
      if (audioContext.value.state === 'suspended') {
        audioContext.value.resume();
      }
    }
  };

  return {
    isMuted,
    toggleMute,
    setZone
  };
}
