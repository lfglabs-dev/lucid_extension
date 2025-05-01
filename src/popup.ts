import QRCode from 'qrcode';
import { APP_LINK } from './config';
import { getEncryptionKey, getLinkToken } from './services/auth';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup script loaded');

  try {
    const response = await getLinkToken();
    const linkToken = response.data;
    console.log('Link token received:', linkToken);
    const deviceName = navigator.userAgent;
    const decryptionKey = await getEncryptionKey();
    if (!decryptionKey) throw new Error('Failed to get encryption key');

    // we encode everything in URL to avoid duplicates and allow our app to retrieve everything
    const deepLink = `${APP_LINK}/--/connect?t=${linkToken}&n=${deviceName}&d=${decryptionKey.k}`;

    const qrCodeDataUrl = await QRCode.toDataURL(deepLink, {
      width: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      // in this context it's better to have a readable qrcode than a recoverable code
      errorCorrectionLevel: 'L',
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
