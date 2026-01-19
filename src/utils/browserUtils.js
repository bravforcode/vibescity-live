/**
 * src/utils/browserUtils.js
 * รวมฟังก์ชันจัดการ Browser Actions, External Links และ Clipboard
 * เวอร์ชันปรับปรุงสำหรับมือถือ
 */

// คัดลอกข้อความลงคลิปบอร์ด (รองรับทั้ง Desktop และ Mobile)
export const copyToClipboard = async (text) => {
  try {
    // วิธีที่ 1: ใช้ Clipboard API (Modern Browsers)
    // เพิ่มการดัก Error ในกรณีที่ใช้ API ไม่ได้
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {
        console.warn("Clipboard API failed, using fallback", e);
      }
    }
    
    // วิธีที่ 2: Fallback สำหรับเบราว์เซอร์เก่า / มือถือบางรุ่น
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // ป้องกัน Keyboard เด้ง (สำคัญมาก)
    textArea.setAttribute("readonly", "");
    textArea.style.contain = "strict";
    
    // เอา textarea ออกจาก viewport แบบไม่ให้ส่งผลต่อ Layout
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.fontSize = "12pt"; // ป้องกัน Zoom บน iOS
    
    document.body.appendChild(textArea);
    
    // เลือกข้อความ
    const range = document.createRange();
    range.selectNodeContents(textArea);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    
    textArea.setSelectionRange(0, 999999); // สำหรับมือถือ
    
    // คัดลอก
    const success = document.execCommand('copy');
    
    // Cleanup
    document.body.removeChild(textArea);
    selection.removeAllRanges();
    
    return success;
  } catch (err) {
    console.error('Copy failed:', err);
    return false;
  }
};

// เปิด Google Maps สำหรับนำทาง
export const openGoogleMapsDir = (lat, lng) => {
  if (!lat || !lng) {
    console.error('Invalid coordinates:', lat, lng);
    return false;
  }
  
  // สร้าง URL สำหรับอุปกรณ์ต่างๆ
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
  const isAndroid = /android/i.test(userAgent);
  
  // Encode ชื่อปลายทาง
  const destination = encodeURIComponent(`${lat},${lng}`);
  
  try {
    if (isIOS) {
      // สำหรับ iOS - พยายามเปิดแอพ Google Maps
      const iosUrl = `maps://maps.google.com/maps?daddr=${destination}&directionsmode=driving`;
      window.location.href = iosUrl;
      
      // Fallback หลังจาก 500ms
      setTimeout(() => {
        if (document.visibilityState === 'visible') {
          window.open(`https://maps.apple.com/?daddr=${destination}`, '_blank');
        }
      }, 500);
    } else if (isAndroid) {
      // สำหรับ Android
      const androidUrl = `google.navigation:q=${destination}&mode=d`;
      window.location.href = androidUrl;
      
      // Fallback หลังจาก 500ms
      setTimeout(() => {
        if (document.visibilityState === 'visible') {
          window.open(`https://www.google.com/maps/dir/?api=1&destination=${destination}`, '_blank');
        }
      }, 500);
    } else {
      // สำหรับ Desktop/Browser อื่นๆ
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${destination}`, '_blank', 'noopener,noreferrer');
    }
    
    return true;
  } catch (error) {
    console.error('Failed to open Google Maps:', error);
    // Fallback มาตรฐาน
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${destination}`, '_blank', 'noopener,noreferrer');
    return false;
  }
};

// เปิดแอพ Grab (สำหรับมือถือ)
export const openGrabApp = (shop) => {
  try {
    const lat = shop.lat || shop.latitude;
    const lng = shop.lng || shop.longitude;
    const name = encodeURIComponent(shop.name || shop.Name || '');
    const address = encodeURIComponent(shop.address || shop.Address || '');
    
    if (!lat || !lng) {
      console.error('Missing location for Grab:', shop);
      return false;
    }
    
    // Grab Deep Links สำหรับแพลตฟอร์มต่างๆ
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
    const isAndroid = /android/i.test(userAgent);
    
    // สำหรับแอพ Grab
    let grabDeepLink = '';
    let grabWebUrl = '';
    
    if (isIOS) {
      // iOS Deep Link
      grabDeepLink = `grab://open?screenType=BOOKING&dropOffLatitude=${lat}&dropOffLongitude=${lng}&dropOffName=${name}`;
      grabWebUrl = `https://m.grab.com/th/ride/?pickupType=point&pickupAddress=&dropoffType=point&dropoffAddress=${address}&dropoffLat=${lat}&dropoffLng=${lng}`;
    } else if (isAndroid) {
      // Android Deep Link
      grabDeepLink = `grab://open?screenType=BOOKING&dropOffLatitude=${lat}&dropOffLongitude=${lng}&dropOffName=${name}`;
      grabWebUrl = `https://m.grab.com/th/ride/?pickupType=point&pickupAddress=&dropoffType=point&dropoffAddress=${address}&dropoffLat=${lat}&dropoffLng=${lng}`;
    } else {
      // Desktop - เปิดหน้าเว็บ
      grabWebUrl = `https://m.grab.com/th/ride/?pickupType=point&pickupAddress=&dropoffType=point&dropoffAddress=${address}&dropoffLat=${lat}&dropoffLng=${lng}`;
    }
    
    console.log('Opening Grab with:', { lat, lng, name });
    
    // พยายามเปิด Deep Link
    if (grabDeepLink) {
      window.location.href = grabDeepLink;
      
      // ตรวจสอบว่าเปิดแอพสำเร็จหรือไม่ (ใช้ Page Visibility API)
      const appOpened = new Promise((resolve) => {
        let timer = setTimeout(() => {
          if (document.visibilityState === 'visible') {
            // แอพไม่เปิด - เปิดเว็บแทน
            window.open(grabWebUrl, '_blank', 'noopener,noreferrer');
          }
          resolve(true);
        }, 1000); // รอ 1 วินาที
        
        // ถ้าแอพเปิดสำเร็จ (หน้าเว็บถูกซ่อน)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
            clearTimeout(timer);
            resolve(true);
          }
        }, { once: true });
      });
      
      return appOpened;
    } else {
      // สำหรับ Desktop
      window.open(grabWebUrl, '_blank', 'noopener,noreferrer');
      return Promise.resolve(true);
    }
  } catch (error) {
    console.error('Error opening Grab:', error);
    return false;
  }
};

// เปิดแอพ Bolt (สำหรับมือถือ)
export const openBoltApp = (shop) => {
  try {
    const lat = shop.lat || shop.latitude;
    const lng = shop.lng || shop.longitude;
    const name = encodeURIComponent(shop.name || shop.Name || '');
    
    if (!lat || !lng) {
      console.error('Missing location for Bolt:', shop);
      return false;
    }
    
    // Bolt Deep Links
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
    const isAndroid = /android/i.test(userAgent);
    
    let boltDeepLink = '';
    let boltWebUrl = '';
    
    if (isIOS) {
      // iOS
      boltDeepLink = `bolt://ride?destination_lat=${lat}&destination_lng=${lng}&destination_name=${name}`;
      boltWebUrl = `https://bolt.eu/th-th/ride/?destination_lat=${lat}&destination_lng=${lng}&destination_name=${name}`;
    } else if (isAndroid) {
      // Android
      boltDeepLink = `bolt://ride?destination_lat=${lat}&destination_lng=${lng}&destination_name=${name}`;
      boltWebUrl = `https://bolt.eu/th-th/ride/?destination_lat=${lat}&destination_lng=${lng}&destination_name=${name}`;
    } else {
      // Desktop
      boltWebUrl = `https://bolt.eu/th-th/ride/?destination_lat=${lat}&destination_lng=${lng}&destination_name=${name}`;
    }
    
    console.log('Opening Bolt with:', { lat, lng, name });
    
    // พยายามเปิด Deep Link
    if (boltDeepLink) {
      window.location.href = boltDeepLink;
      
      const appOpened = new Promise((resolve) => {
        let timer = setTimeout(() => {
          if (document.visibilityState === 'visible') {
            window.open(boltWebUrl, '_blank', 'noopener,noreferrer');
          }
          resolve(true);
        }, 1000);
        
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
            clearTimeout(timer);
            resolve(true);
          }
        }, { once: true });
      });
      
      return appOpened;
    } else {
      window.open(boltWebUrl, '_blank', 'noopener,noreferrer');
      return Promise.resolve(true);
    }
  } catch (error) {
    console.error('Error opening Bolt:', error);
    return false;
  }
};

// เปิดแอพ Lineman (เพิ่มฟังก์ชันใหม่)
export const openLinemanApp = (shop) => {
  try {
    const lat = shop.lat || shop.latitude;
    const lng = shop.lng || shop.longitude;
    const name = encodeURIComponent(shop.name || shop.Name || '');
    
    if (!lat || !lng) {
      console.error('Missing location for Lineman:', shop);
      return false;
    }
    
    // Lineman Deep Links
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
    const isAndroid = /android/i.test(userAgent);
    
    let linemanDeepLink = '';
    let linemanWebUrl = '';
    
    if (isIOS || isAndroid) {
      // Mobile Deep Link
      linemanDeepLink = `lineman://taxi?dropoff_lat=${lat}&dropoff_lng=${lng}&dropoff_name=${name}`;
      linemanWebUrl = `https://lineman.onelink.me/2695613898?af_dp=lineman://taxi&dropoff_lat=${lat}&dropoff_lng=${lng}&dropoff_name=${name}`;
    } else {
      // Desktop
      linemanWebUrl = `https://lineman.onelink.me/2695613898?af_dp=lineman://taxi&dropoff_lat=${lat}&dropoff_lng=${lng}&dropoff_name=${name}`;
    }
    
    console.log('Opening Lineman with:', { lat, lng, name });
    
    // พยายามเปิด Deep Link
    if (linemanDeepLink) {
      window.location.href = linemanDeepLink;
      
      const appOpened = new Promise((resolve) => {
        let timer = setTimeout(() => {
          if (document.visibilityState === 'visible') {
            window.open(linemanWebUrl, '_blank', 'noopener,noreferrer');
          }
          resolve(true);
        }, 1000);
        
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
            clearTimeout(timer);
            resolve(true);
          }
        }, { once: true });
      });
      
      return appOpened;
    } else {
      window.open(linemanWebUrl, '_blank', 'noopener,noreferrer');
      return Promise.resolve(true);
    }
  } catch (error) {
    console.error('Error opening Lineman:', error);
    return false;
  }
};

// ฟังก์ชันเช็คว่าอยู่บนมือถือหรือไม่
export const isMobileDevice = () => {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  return (
    /android/i.test(userAgent) ||
    /iPad|iPhone|iPod/.test(userAgent) ||
    (window.innerWidth <= 768 && window.innerHeight <= 1024)
  );
};

// ฟังก์ชันเปิดแอพ Ride-hailing ตามตัวเลือก
export const openRideApp = (appName, shop) => {
  switch (appName.toLowerCase()) {
    case 'grab':
      return openGrabApp(shop);
    case 'bolt':
      return openBoltApp(shop);
    case 'lineman':
      return openLinemanApp(shop);
    default:
      console.error('Unknown ride app:', appName);
      return false;
  }
};

// ฟังก์ชันตรวจสอบว่าแอพติดตั้งหรือไม่ (experimental)
export const checkAppInstalled = (appName) => {
  return new Promise((resolve) => {
    if (!isMobileDevice()) {
      resolve(false);
      return;
    }
    
    // ใช้วิธีเช็คด้วย timer และ visibility
    const startTime = Date.now();
    
    // สร้าง iframe ที่พยายามเปิดแอพ
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    
    let deepLink = '';
    switch (appName.toLowerCase()) {
      case 'grab':
        deepLink = 'grab://';
        break;
      case 'bolt':
        deepLink = 'bolt://';
        break;
      case 'lineman':
        deepLink = 'lineman://';
        break;
      default:
        resolve(false);
        return;
    }
    
    iframe.src = deepLink;
    document.body.appendChild(iframe);
    
    // ตรวจสอบว่าแอพเปิดหรือไม่
    setTimeout(() => {
      document.body.removeChild(iframe);
      const elapsed = Date.now() - startTime;
      
      // ถ้าใช้เวลาน้อยกว่า 100ms แสดงว่าแอพไม่ติดตั้ง (เปิดหน้าเว็บแทน)
      // ถ้าใช้เวลามากกว่า 100ms แสดงว่าแอพพยายามเปิด
      resolve(elapsed > 100);
    }, 300);
  });
};

// ฟังก์ชันแชร์ตำแหน่ง
export const shareLocation = (shop) => {
  if (navigator.share && isMobileDevice()) {
    const shareData = {
      title: shop.name,
      text: `ไปร้าน ${shop.name} กัน!\nตำแหน่ง: https://maps.google.com/?q=${shop.lat},${shop.lng}`,
      url: window.location.href,
    };
    
    return navigator.share(shareData).catch(console.error);
  } else {
    // Fallback สำหรับ Desktop หรือเบราว์เซอร์ที่ไม่รองรับ
    const shareUrl = `https://maps.google.com/?q=${shop.lat},${shop.lng}`;
    copyToClipboard(shareUrl);
    alert('ลิงก์ตำแหน่งถูกคัดลอกไปยังคลิปบอร์ดแล้ว!');
    return true;
  }
};