import { useAuthStore } from '../stores/authStore';

export const usePermissions = () => {
  const { admin } = useAuthStore();
  const role = admin?.role;

  return {
    role,
    isSuperAdmin: role === 'super_admin',
    isAdmin: role === 'admin',
    isModerator: role === 'moderator',
    canDeleteZone: role === 'super_admin',
    canEditPricing: role === 'super_admin' || role === 'admin',
    canEditZones: role === 'super_admin' || role === 'admin',
    canResolveDisputes: role === 'super_admin' || role === 'admin' || role === 'moderator',
    canExportFinancials: role === 'super_admin' || role === 'admin',
    canGlobalSettings: role === 'super_admin',
    canSendBroadcast: role === 'super_admin' || role === 'admin',
  };
};
