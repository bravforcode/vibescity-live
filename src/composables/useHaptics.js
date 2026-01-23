/**
 * useHaptics.js - Haptic Feedback Composable
 * Provides vibration feedback for mobile devices
 */

export const useHaptics = () => {
  // Check if vibration API is supported
  const isSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator;

  /**
   * Light tap feedback - for minor interactions
   */
  const tapFeedback = () => {
    if (isSupported) {
      navigator.vibrate(10);
    }
  };

  /**
   * Selection feedback - for selecting items
   */
  const selectFeedback = () => {
    if (isSupported) {
      navigator.vibrate([10, 30, 10]);
    }
  };

  /**
   * Success feedback - for completing actions
   */
  const successFeedback = () => {
    if (isSupported) {
      navigator.vibrate([10, 50, 20, 50, 30]);
    }
  };

  /**
   * Error feedback - for errors
   */
  const errorFeedback = () => {
    if (isSupported) {
      navigator.vibrate([50, 100, 50]);
    }
  };

  /**
   * Heavy impact - for important actions
   */
  const heavyFeedback = () => {
    if (isSupported) {
      navigator.vibrate(50);
    }
  };

  return {
    isSupported,
    tapFeedback,
    selectFeedback,
    successFeedback,
    errorFeedback,
    heavyFeedback,
  };
};

export default useHaptics;
