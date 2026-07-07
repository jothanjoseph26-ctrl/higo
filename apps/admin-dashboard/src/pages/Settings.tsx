import React, { useEffect, useState } from 'react';
import { usePermissions } from '../hooks/usePermissions';
import { useUiStore } from '../stores/uiStore';
import { apiService, HceAiStatus, HceCapability, HceProvider, PlatformSettings } from '../services/api';
import { Settings as SettingsIcon, ShieldCheck, ShieldAlert, Key, Loader2, Cpu } from 'lucide-react';

const FCM_KEY_MASK = '••••••••••••••••••••••••••••••••';

const hceCapabilities: HceCapability[] = [
  'translate',
  'intent_extract',
  'voice_booking',
  'tts',
  'transcribe',
  'landmark',
  'assistant',
];

const providerOptions: HceProvider[] = ['local', 'openrouter', 'azure', 'mock', 'disabled'];

const defaultHce: PlatformSettings['hce'] = {
  enabled: true,
  mockMode: false,
  defaultProvider: 'openrouter',
  defaultModel: 'openrouter/free',
  dailyLimits: {
    passenger: 10,
    driver: 20,
    admin: 50,
    globalOpenRouter: 50,
    azureSttMinutesMonthly: 240,
    azureTtsCharsMonthly: 450000,
  },
  capabilities: {
    translate: {
      provider: 'openrouter',
      model: 'openrouter/free',
      fallbackProvider: 'local',
      fallbackModel: 'phrase-dictionary',
      dailyLimit: 10,
    },
    intent_extract: {
      provider: 'local',
      model: 'keyword-rules',
      fallbackProvider: 'openrouter',
      fallbackModel: 'openrouter/free',
      dailyLimit: 20,
    },
    voice_booking: {
      provider: 'openrouter',
      model: 'openrouter/free',
      fallbackProvider: 'local',
      fallbackModel: 'manual-entry',
      dailyLimit: 10,
    },
    tts: {
      provider: 'local',
      model: 'device-native-or-voice-pack',
      fallbackProvider: 'azure',
      fallbackModel: 'azure-speech-f0',
      dailyLimit: 0,
    },
    transcribe: {
      provider: 'local',
      model: 'device-native',
      fallbackProvider: 'azure',
      fallbackModel: 'azure-speech-f0',
      dailyLimit: 0,
    },
    landmark: {
      provider: 'local',
      model: 'abuja-landmark-db',
      fallbackProvider: 'openrouter',
      fallbackModel: 'openrouter/free',
      dailyLimit: 10,
    },
    assistant: {
      provider: 'openrouter',
      model: 'openrouter/free',
      fallbackProvider: 'local',
      fallbackModel: 'support-template',
      dailyLimit: 10,
    },
  },
};

const defaultSettings: PlatformSettings = {
  googleMapsOriginRestriction: 'https://www.hiconnectgo.com/*',
  smsGatewayChannel: 'termii',
  fcmServerKey: '',
  maintenanceMode: false,
  hce: defaultHce,
};

export const Settings: React.FC = () => {
  const { isSuperAdmin } = usePermissions();
  const { addToast } = useUiStore();
  const [settings, setSettings] = useState<PlatformSettings>(defaultSettings);
  const [aiStatus, setAiStatus] = useState<HceAiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const [data, status] = await Promise.all([
          apiService.getSettings(),
          apiService.getAiStatus().catch(() => null),
        ]);
        setSettings(data);
        setAiStatus(status);
      } catch (err) {
        console.error('Failed to load platform settings:', err);
        addToast('Failed to load platform settings', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [addToast]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) {
      alert('Only super_admin users can modify global system settings.');
      return;
    }

    try {
      setSaving(true);
      const updated = await apiService.updateSettings(settings);
      setSettings(updated);
      const status = await apiService.getAiStatus().catch(() => null);
      setAiStatus(status);
      addToast('Global settings updated successfully', 'success');
    } catch (err) {
      console.error('Failed to save platform settings:', err);
      addToast('Failed to save platform settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-primaryGreen" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-darkNavy">Global Settings</h1>
        <p className="text-xs text-gray-500">Configure platform credentials, SMS dispatch gateways, and check admin system roles</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Settings Form */}
        <div className="lg:col-span-2 bg-white p-6 rounded-card border border-lightGrey shadow-custom">
          <div className="flex items-center gap-2 mb-6 border-b border-lightGrey pb-4">
            <SettingsIcon className="text-primaryGreen" size={24} />
            <h3 className="text-base font-semibold text-darkNavy">Platform Integrations</h3>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-darkNavy mb-1">
                  Google Maps Origin Restriction
                </label>
                <input
                  type="text"
                  value={settings.googleMapsOriginRestriction}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      googleMapsOriginRestriction: e.target.value,
                    }))
                  }
                  disabled={!isSuperAdmin}
                  className="w-full px-3 py-2 border border-lightGrey rounded-input text-xs focus:outline-none focus:border-primaryGreen disabled:bg-lightGrey disabled:text-gray-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-darkNavy mb-1">
                  Primary SMS Gateway Channel
                </label>
                <select
                  value={settings.smsGatewayChannel}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      smsGatewayChannel: e.target.value as PlatformSettings['smsGatewayChannel'],
                    }))
                  }
                  disabled={!isSuperAdmin}
                  className="w-full px-3 py-2 border border-lightGrey rounded-input text-xs focus:outline-none disabled:bg-lightGrey disabled:text-gray-400"
                >
                  <option value="termii">Termii SMS Gateway (Nigeria)</option>
                  <option value="africastalking">AfricasTalking (Secondary)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-darkNavy mb-1">
                FCM Server Key Credentials
              </label>
              <input
                type="password"
                value={settings.fcmServerKey}
                placeholder="Not configured"
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    fcmServerKey: e.target.value,
                  }))
                }
                disabled={!isSuperAdmin}
                className="w-full px-3 py-2 border border-lightGrey rounded-input text-xs focus:outline-none disabled:bg-lightGrey disabled:text-gray-400 font-mono"
              />
            </div>

            <div className="flex items-center gap-2 border-t border-lightGrey pt-4">
              <input
                type="checkbox"
                id="maintenanceMode"
                checked={settings.maintenanceMode}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    maintenanceMode: e.target.checked,
                  }))
                }
                disabled={!isSuperAdmin}
                className="rounded text-primaryGreen focus:ring-primaryGreen disabled:opacity-50"
              />
              <label htmlFor="maintenanceMode" className="text-xs font-semibold text-darkNavy">
                Enable Under-Maintenance Mode (Blocks passenger booking requests)
              </label>
            </div>

            <div className="border-t border-lightGrey pt-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-darkNavy flex items-center gap-2">
                    <Cpu size={16} className="text-primaryGreen" />
                    AI / HCE Routing
                  </h4>
                  <p className="text-[10px] text-gray-500">
                    Local first, cached second, free AI third. Provider keys remain environment-managed.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-darkNavy">
                  <input
                    type="checkbox"
                    checked={settings.hce.enabled}
                    disabled={!isSuperAdmin}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        hce: { ...prev.hce, enabled: e.target.checked },
                      }))
                    }
                  />
                  HCE enabled
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-darkNavy mb-1">Default Provider</label>
                  <select
                    value={settings.hce.defaultProvider}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        hce: { ...prev.hce, defaultProvider: e.target.value as HceProvider },
                      }))
                    }
                    disabled={!isSuperAdmin}
                    className="w-full px-3 py-2 border border-lightGrey rounded-input text-xs focus:outline-none disabled:bg-lightGrey disabled:text-gray-400"
                  >
                    {providerOptions.map((provider) => (
                      <option key={provider} value={provider}>
                        {provider}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-darkNavy mb-1">Default Model</label>
                  <input
                    value={settings.hce.defaultModel}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        hce: { ...prev.hce, defaultModel: e.target.value },
                      }))
                    }
                    disabled={!isSuperAdmin}
                    className="w-full px-3 py-2 border border-lightGrey rounded-input text-xs focus:outline-none disabled:bg-lightGrey disabled:text-gray-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  ['passenger', 'Passenger/day'],
                  ['driver', 'Driver/day'],
                  ['admin', 'Admin/day'],
                  ['globalOpenRouter', 'OpenRouter/day'],
                  ['azureTtsCharsMonthly', 'Azure TTS chars/mo'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className="block text-[10px] font-semibold text-darkNavy mb-1">{label}</label>
                    <input
                      type="number"
                      value={settings.hce.dailyLimits[key as keyof typeof settings.hce.dailyLimits]}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          hce: {
                            ...prev.hce,
                            dailyLimits: {
                              ...prev.hce.dailyLimits,
                              [key]: Number(e.target.value),
                            },
                          },
                        }))
                      }
                      disabled={!isSuperAdmin}
                      className="w-full px-2 py-2 border border-lightGrey rounded-input text-xs disabled:bg-lightGrey disabled:text-gray-400"
                    />
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto border border-lightGrey rounded-card">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-darkNavy">
                    <tr>
                      <th className="text-left p-2">Capability</th>
                      <th className="text-left p-2">Provider</th>
                      <th className="text-left p-2">Model</th>
                      <th className="text-left p-2">Fallback</th>
                      <th className="text-left p-2">Limit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hceCapabilities.map((capability) => {
                      const config = settings.hce.capabilities[capability];
                      return (
                        <tr key={capability} className="border-t border-lightGrey">
                          <td className="p-2 font-semibold text-darkNavy">{capability}</td>
                          <td className="p-2">
                            <select
                              value={config.provider}
                              onChange={(e) =>
                                setSettings((prev) => ({
                                  ...prev,
                                  hce: {
                                    ...prev.hce,
                                    capabilities: {
                                      ...prev.hce.capabilities,
                                      [capability]: {
                                        ...config,
                                        provider: e.target.value as HceProvider,
                                      },
                                    },
                                  },
                                }))
                              }
                              disabled={!isSuperAdmin}
                              className="w-full px-2 py-1 border border-lightGrey rounded-input disabled:bg-lightGrey disabled:text-gray-400"
                            >
                              {providerOptions.map((provider) => (
                                <option key={provider} value={provider}>
                                  {provider}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              value={config.model}
                              onChange={(e) =>
                                setSettings((prev) => ({
                                  ...prev,
                                  hce: {
                                    ...prev.hce,
                                    capabilities: {
                                      ...prev.hce.capabilities,
                                      [capability]: { ...config, model: e.target.value },
                                    },
                                  },
                                }))
                              }
                              disabled={!isSuperAdmin}
                              className="w-full min-w-[150px] px-2 py-1 border border-lightGrey rounded-input disabled:bg-lightGrey disabled:text-gray-400"
                            />
                          </td>
                          <td className="p-2 text-gray-500">
                            {config.fallbackProvider}:{config.fallbackModel}
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              value={config.dailyLimit}
                              onChange={(e) =>
                                setSettings((prev) => ({
                                  ...prev,
                                  hce: {
                                    ...prev.hce,
                                    capabilities: {
                                      ...prev.hce.capabilities,
                                      [capability]: { ...config, dailyLimit: Number(e.target.value) },
                                    },
                                  },
                                }))
                              }
                              disabled={!isSuperAdmin}
                              className="w-20 px-2 py-1 border border-lightGrey rounded-input disabled:bg-lightGrey disabled:text-gray-400"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {aiStatus && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-green-50 rounded-card">
                    <span className="block text-gray-500">OpenRouter today</span>
                    <strong>
                      {aiStatus.usage.openRouter.usedToday}/{aiStatus.usage.openRouter.dailyLimit}
                    </strong>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-card">
                    <span className="block text-gray-500">Cache hit rate</span>
                    <strong>{Math.round(aiStatus.usage.last30Days.cacheHitRate * 100)}%</strong>
                  </div>
                  <div className="p-3 bg-yellow-50 rounded-card">
                    <span className="block text-gray-500">Fallbacks</span>
                    <strong>{aiStatus.usage.last30Days.fallbacks}</strong>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-card">
                    <span className="block text-gray-500">Active model</span>
                    <strong className="break-all">{aiStatus.ai.model}</strong>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={!isSuperAdmin || saving}
                className={`px-6 py-2.5 bg-primaryGreen text-white font-semibold rounded-button text-sm transition-all hover:bg-opacity-95 shadow-sm flex items-center gap-2 ${
                  !isSuperAdmin || saving ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {saving && <Loader2 className="animate-spin" size={16} />}
                Save Settings
              </button>
            </div>
          </form>
        </div>

        {/* Security / RBAC Information */}
        <div className="bg-white p-6 rounded-card border border-lightGrey shadow-custom space-y-4">
          <h3 className="font-semibold text-sm text-darkNavy border-b border-lightGrey pb-2 flex items-center gap-1.5">
            <Key className="text-accentOrange" size={16} />
            <span>RBAC Permission Grid</span>
          </h3>

          <div className="space-y-3 text-xs leading-relaxed text-dark font-medium">
            <div className="flex items-start gap-2 p-3 bg-green-50 text-primaryGreen border-l-4 border-primaryGreen rounded-r-md">
              <ShieldCheck className="flex-shrink-0 mt-0.5" size={14} />
              <div>
                <strong className="text-darkNavy block mb-0.5">super_admin</strong>
                <p className="text-[10px] text-gray-500 leading-tight">
                  Full administrative permissions. Authorized to modify API integrations, configure maintenance mode, and delete geofenced zone boundaries.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 bg-yellow-50 text-warning border-l-4 border-warning rounded-r-md">
              <ShieldCheck className="text-warning flex-shrink-0 mt-0.5" size={14} />
              <div>
                <strong className="text-darkNavy block mb-0.5">admin</strong>
                <p className="text-[10px] text-gray-500 leading-tight">
                  Authorized to add and edit zones, adjust pricing configuration files, compose and send push broadcasts, and review driver documents. Cannot delete zones.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 bg-red-50 text-error border-l-4 border-error rounded-r-md">
              <ShieldAlert className="flex-shrink-0 mt-0.5" size={14} />
              <div>
                <strong className="text-darkNavy block mb-0.5">moderator</strong>
                <p className="text-[10px] text-gray-500 leading-tight">
                  Read-only view across map and tables. Authorized to perform dispute resolution actions and document checklists audits. No configuration write access.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
