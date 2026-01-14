import axios from 'axios';
import Papa from 'papaparse';

const getVal = (obj, key) => {
  const foundKey = Object.keys(obj).find(k => k.trim().toLowerCase() === key.toLowerCase());
  const value = foundKey ? obj[foundKey] : '';
  return (typeof value === 'string') ? value.trim() : '';
};

export const fetchShopData = async (sheetUrl) => {
  try {
    // Handle both local files and remote URLs
    let finalUrl = sheetUrl;
    
    // Only add cache buster for remote URLs
    if (sheetUrl.startsWith('http')) {
      const cacheBuster = `&t=${new Date().getTime()}`;
      finalUrl = sheetUrl.includes('?') ? `${sheetUrl}${cacheBuster}` : `${sheetUrl}?${cacheBuster}`;
    }

    const response = await axios.get(finalUrl);
    
    const parsedData = Papa.parse(response.data, {
      header: true,
      skipEmptyLines: true
    });

    return parsedData.data
      .filter(item => getVal(item, 'Name') && getVal(item, 'Latitude'))
      .map((item, index) => {
        const img1 = getVal(item, 'Image_URL1');
        const img2 = getVal(item, 'Image_URL2');
        

        
        return {
          id: index,
          name: getVal(item, 'Name'),
          category: getVal(item, 'Category') || 'General',
          lat: parseFloat(getVal(item, 'Latitude')),
          lng: parseFloat(getVal(item, 'Longitude')),
          videoUrl: getVal(item, 'Video_URL'),
          
          // เก็บค่า Status เดิมจาก Sheet เอาไว้ใช้ Override
          originalStatus: getVal(item, 'Status').toUpperCase() || '', 
          status: getVal(item, 'Status').toUpperCase() || 'OFF', 

          vibeTag: getVal(item, 'Vibe_Info'),
          crowdInfo: getVal(item, 'Crowd_Info'),
          
          promotionInfo: getVal(item, 'Promotion_info'),
          promotionEndtime: getVal(item, 'Promotion_endtime'),

          // --- Time Ranges ---
          openTime: getVal(item, 'open_time'),          
          closeTime: getVal(item, 'close_time'),        
          goldenStart: getVal(item, 'golden_time'),
          goldenEnd: getVal(item, 'end_golden_time'),   

          // --- Zone & Building Navigation ---
          Province: getVal(item, 'Province') || 'เชียงใหม่',
          Zone: getVal(item, 'Zone') || null,
          Building: getVal(item, 'Building') || null,
          Floor: getVal(item, 'Floor') || null,
          CategoryColor: getVal(item, 'CategoryColor') || null,

          images: [img1, img2].filter(url => url && url.length > 5),
          Image_URL1: img1,
          Image_URL2: img2
        };
      });
  } catch (error) {
    console.error("Error fetching Sheets data:", error);
    throw new Error("Unable to load data from Google Sheets");
  }
};