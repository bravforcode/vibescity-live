/**
 * src/utils/browserUtils.js
 * รวมฟังก์ชันจัดการ Browser Actions, External Links และ Clipboard
 */

export const copyToClipboard = (text) => {
  try {
    // ใช้ Fallback method เพื่อความชัวร์ในทุก Browser
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Copy failed', err);
    return false;
  }
};

export const openGoogleMapsDir = (lat, lng) => {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  window.open(url, '_blank');
};

export const openGrabApp = (shop) => {
  const name = encodeURIComponent(shop.name);
  window.location.href = `grab://open?screenType=BOOKING&dropOffName=${name}&dropOffLatitude=${shop.lat}&dropOffLongitude=${shop.lng}`;
};

export const openBoltApp = (shop) => {
  window.location.href = `bolt://ride?destination_lat=${shop.lat}&destination_lng=${shop.lng}`;
};