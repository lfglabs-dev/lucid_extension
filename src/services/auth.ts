import { LUCID_API_URL } from '../config';

const AUTH_STORAGE_KEY = 'lucid_auth';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Debug helper
const debugLog = (action: string, data: any) => {
    console.log(`[Auth] ${action}:`, data);
};

interface AuthResponse {
    status: string;
    data: {
        device_id: string;
        device_type: "initiator";
        jwt: string;
    };
}

function isJWTExpired(token: string): boolean {
    try {
        const [, payloadBase64] = token.split('.');
        const payload = JSON.parse(atob(payloadBase64));
        return Date.now() > payload.exp * 1000;
    } catch (error) {
        console.error('Error parsing JWT:', error);
        return true;
    }
}

function needsRefresh(jwt: string): boolean {
    if (isJWTExpired(jwt)) return true;
    
    try {
        const [, payloadBase64] = jwt.split('.');
        const payload = JSON.parse(atob(payloadBase64));
        return (payload.exp * 1000 - Date.now()) < ONE_DAY_MS;
    } catch (error) {
        console.error('Error checking JWT refresh:', error);
        return true;
    }
}

async function getDeviceName(): Promise<string> {
    const browserInfo = navigator.userAgent;
    return `Chrome Extension (${browserInfo})`;
}

async function registerDevice(): Promise<AuthResponse> {
    try {
        const deviceName = await getDeviceName();
        const url = `${LUCID_API_URL}/register_device`;
        debugLog('Register', { device_name: deviceName, device_type: 'initiator' });

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                device_name: deviceName,
                device_type: 'initiator'
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            debugLog('Register failed', { status: response.status, error: errorText });
            throw new Error(`Failed to register device: ${response.status} - ${errorText}`);
        }

        const responseData = await response.json();
        debugLog('Register success', { device_id: responseData.data.device_id });
        return responseData;
    } catch (error) {
        debugLog('Register error', error instanceof Error ? error.message : 'Unknown error');
        throw error;
    }
}

async function refreshSession(jwt: string): Promise<AuthResponse> {
    try {
        debugLog('Refresh', { token: jwt.substring(0, 10) + '...' });

        const response = await fetch(`${LUCID_API_URL}/refresh_session`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            debugLog('Refresh failed', { status: response.status, error: errorText });
            throw new Error(`Failed to refresh session: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        debugLog('Refresh success', { device_id: data.data?.device_id });
        return data;
    } catch (error) {
        debugLog('Refresh error', error instanceof Error ? error.message : 'Unknown error');
        throw error;
    }
}

export async function getOrRefreshAuth(): Promise<AuthResponse> {
    try {
        const stored = await chrome.storage.local.get([AUTH_STORAGE_KEY]);
        const auth = stored[AUTH_STORAGE_KEY];

        if (auth?.data?.jwt) {
            if (!needsRefresh(auth.data.jwt)) {
                return auth;
            }
            try {
                const refreshed = await refreshSession(auth.data.jwt);
                await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: refreshed });
                return refreshed;
            } catch (error) {
                debugLog('Refresh failed, registering new device', error instanceof Error ? error.message : 'Unknown error');
            }
        }

        const newAuth = await registerDevice();
        await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: newAuth });
        return newAuth;
    } catch (error) {
        debugLog('Auth error', error instanceof Error ? error.message : 'Unknown error');
        throw error;
    }
}

// Helper function to get the current JWT token
export async function getCurrentAuthToken(): Promise<string | null> {
    try {
        const auth = await getOrRefreshAuth();
        return auth.data.jwt;
    } catch (error) {
        console.error('Error getting current token:', error);
        return null;
    }
}

interface ApiResponse<T> {
  status: "success" | "error";
  data: T;
}

export async function getLinkToken(): Promise<ApiResponse<string>> {
  console.log('Getting link token...');
  try {
    const stored = await chrome.storage.local.get(['auth']);
    if (!stored.auth?.jwt) {
      throw new Error('No JWT found');
    }

    const response = await fetch(`${LUCID_API_URL}/link_token`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${stored.auth.jwt}`,
        'Content-Type': 'application/json',
      }
    });

    console.log('Link token response status:', response.status);
    if (!response.ok) {
      throw new Error(`Failed to get link token: ${response.status}`);
    }

    const data = await response.json();
    console.log('Link token received:', data);
    return data;
  } catch (error) {
    console.error('Get link token error:', error);
    throw error;
  }
} 