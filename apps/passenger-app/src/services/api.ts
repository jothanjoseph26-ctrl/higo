import { createHigoClient } from '@higo/api-client';
import type {
  EmergencyContact,
  SavedPlace,
  SetEmergencyContactsResponse,
  SetSavedPlacesResponse,
} from '@higo/shared-types';
import { API_BASE_URL } from '../config';
import { tokenStorage } from './storage';

export const api = createHigoClient({
  baseURL: API_BASE_URL,
  tokenStorage,
  platform: 'mobile',
  onAuthFailure: () => {
    void import('../stores/authStore').then(({ useAuthStore }) =>
      useAuthStore.getState().logout(),
    );
  },
});

export async function getEmergencyContacts(): Promise<EmergencyContact[]> {
  const result = await api.request<{ contacts: EmergencyContact[] }>({
    method: 'GET',
    url: '/passengers/me/emergency-contacts',
  });
  return result.contacts;
}

export async function setEmergencyContacts(
  contacts: EmergencyContact[],
): Promise<EmergencyContact[]> {
  const result = await api.request<SetEmergencyContactsResponse>({
    method: 'POST',
    url: '/passengers/emergency-contacts',
    data: { contacts },
  });
  return result.contacts;
}

export async function getSavedPlaces(): Promise<SavedPlace[]> {
  const result = await api.request<{ places: SavedPlace[] }>({
    method: 'GET',
    url: '/passengers/me/saved-places',
  });
  return result.places;
}

export async function setSavedPlaces(places: SavedPlace[]): Promise<SavedPlace[]> {
  const result = await api.request<SetSavedPlacesResponse>({
    method: 'PUT',
    url: '/passengers/me/saved-places',
    data: { places },
  });
  return result.places;
}