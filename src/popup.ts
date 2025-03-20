import QRCode from 'qrcode';
import { APP_LINK } from './config';
import { getLinkToken } from './services/auth';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup script loaded');
  
  try {
    const response = await getLinkToken();
    const linkToken = response.data; // Extract token from response
    console.log('Link token received:', linkToken);
    
    const deepLink = `${APP_LINK}/--/connect?token=${linkToken}`;
    const tokenOnlyUrl = `token-${linkToken}`;
    const deviceName = navigator.userAgent;
    
    const combinedData = JSON.stringify({
      app: deepLink,
      token: tokenOnlyUrl,
      name: deviceName 
    });

    const qrCodeDataUrl = await QRCode.toDataURL(combinedData, {
      width: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
    console.log('QR code generated successfully');

    const qrCodeElement = document.getElementById('qrcode');
    if (qrCodeElement) {
      console.log('QR code element found');
      const img = document.createElement('img');
      img.src = qrCodeDataUrl;
      img.alt = 'QR Code for Lucid Mobile App Connection';
      qrCodeElement.appendChild(img);
      console.log('QR code image added to DOM');
    } else {
      console.error('QR code element not found in DOM');
    }
  } catch (error) {
    console.error('Error in popup script:', error);
  }
}); 