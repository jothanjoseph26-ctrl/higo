import { api } from './api';
import type { LatLng } from '@higo/shared-types';

let sosInterval: any = null;

export async function sendSosRequest(tripId: string, location: LatLng, note?: string) {
  try {
    const result = await api.sendTripSos(tripId, { location, note });
    return result;
  } catch (error) {
    console.error('Failed to submit SOS request to backend:', error);
    throw error;
  }
}

export async function sendEmergencySms(phoneNumbers: string[], location: LatLng) {
  const message = `EMERGENCY: HiGo passenger needs assistance. Current location: https://maps.google.com/?q=${location.lat},${location.lng}`;
  console.log(`Sending emergency SMS to ${phoneNumbers.join(', ')}: "${message}"`);
  
  // In a native app, we would use expo-sms:
  // import * as SMS from 'expo-sms';
  // const isAvailable = await SMS.isAvailableAsync();
  // if (isAvailable) { await SMS.sendSMSAsync(phoneNumbers, message); }
  return true;
}

export function startEmergencySosSharing(tripId: string, phoneNumbers: string[], onTick?: (loc: LatLng) => void) {
  if (sosInterval) {
    clearInterval(sosInterval);
  }

  const runSosTick = async () => {
    // Simulate current GPS location (default Abuja FCT)
    const simulatedLocation = {
      lat: 9.0765 + (Math.random() - 0.5) * 0.001,
      lng: 7.3986 + (Math.random() - 0.5) * 0.001,
    };

    if (onTick) {
      onTick(simulatedLocation);
    }

    try {
      // 1. Post location to backend SOS endpoint
      await sendSosRequest(tripId, simulatedLocation, 'Active SOS distress telemetry');
      
      // 2. Send SMS alerts to contacts
      if (phoneNumbers.length > 0) {
        await sendEmergencySms(phoneNumbers, simulatedLocation);
      }
    } catch (e) {
      console.warn('Error during SOS location update cycle', e);
    }
  };

  // Run immediately and then every 30 seconds
  void runSosTick();
  sosInterval = setInterval(runSosTick, 30000);
}

export function stopEmergencySosSharing() {
  if (sosInterval) {
    clearInterval(sosInterval);
    sosInterval = null;
    console.log('Background SOS tracking terminated');
  }
}
