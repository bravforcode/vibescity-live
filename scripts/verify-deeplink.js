
// scripts/verify-deeplink.js
import { openRideApp, checkAppInstalled } from '../src/services/DeepLinkService.js';
import { isMobileDevice } from '../src/utils/browserUtils.js';

console.log("DeepLinkService Loaded Successfully");
console.log("openRideApp:", typeof openRideApp);
console.log("checkAppInstalled:", typeof checkAppInstalled);
console.log("isMobileDevice:", typeof isMobileDevice);
