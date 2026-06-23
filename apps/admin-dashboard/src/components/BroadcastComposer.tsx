import React, { useState, useEffect } from 'react';
import { usePermissions } from '../hooks/usePermissions';
import { apiService } from '../services/api';
import { ZoneResponse } from '@higo/shared-types';
import { Send, AlertCircle, CheckCircle2, Megaphone } from 'lucide-react';

export const BroadcastComposer: React.FC = () => {
  const { canSendBroadcast } = usePermissions();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('system_announcement');
  const [audience, setAudience] = useState<'all_passengers' | 'all_drivers' | 'online_drivers' | 'zone'>('all_passengers');
  const [zoneId, setZoneId] = useState('');
  const [zones, setZones] = useState<ZoneResponse[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [recipientCount, setRecipientCount] = useState<number | null>(null);

  useEffect(() => {
    const fetchZones = async () => {
      try {
        const data = await apiService.getZones();
        setZones(data);
      } catch (err) {
        console.error('Failed to fetch zones for broadcast composer:', err);
      }
    };
    fetchZones();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canSendBroadcast) {
      alert('You do not have permission to send broadcasts.');
      return;
    }

    if (!title.trim() || !body.trim()) {
      setErrorMsg('Title and body are required.');
      return;
    }

    if (audience === 'zone' && !zoneId) {
      setErrorMsg('Please select a target zone.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg('');
      setSuccessMsg('');
      setRecipientCount(null);

      const payload = {
        audience,
        zoneId: audience === 'zone' ? zoneId : undefined,
        title,
        body,
        type,
      };

      const result = await apiService.broadcastNotification(payload);
      setSuccessMsg('Broadcast queued successfully!');
      setRecipientCount(result.recipients);

      setTitle('');
      setBody('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to dispatch broadcast.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-card shadow-custom w-full max-w-2xl">
      <div className="flex items-center gap-2 mb-6 border-b border-lightGrey pb-4">
        <Megaphone className="text-primaryGreen" size={24} />
        <div>
          <h3 className="text-base font-semibold text-darkNavy">Global Broadcast Composer</h3>
          <p className="text-xs text-gray-500">Dispatch Push Notifications to drivers and passengers</p>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-red-50 border-l-4 border-error text-error text-sm rounded-r-md flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3 bg-green-50 border-l-4 border-success text-success text-sm rounded-r-md flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span className="font-semibold">{successMsg}</span>
          </div>
          {recipientCount !== null && (
            <span className="text-xs pl-6">Successfully targeted {recipientCount} recipients.</span>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-darkNavy mb-1">Audience Target</label>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as any)}
              className="w-full px-3 py-2 border border-lightGrey rounded-input text-sm focus:outline-none focus:border-primaryGreen"
            >
              <option value="all_passengers">All Passengers</option>
              <option value="all_drivers">All Registered Drivers</option>
              <option value="online_drivers">Online Drivers Only</option>
              <option value="zone">Geofenced Zone Segment</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-darkNavy mb-1">Notification Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 border border-lightGrey rounded-input text-sm focus:outline-none focus:border-primaryGreen"
            >
              <option value="system_announcement">System Announcement</option>
              <option value="traffic_surge">Surge / Weather Alert</option>
              <option value="safety_update">Security & Safety Update</option>
              <option value="marketing">Promo & Marketing</option>
            </select>
          </div>
        </div>

        {audience === 'zone' && (
          <div>
            <label className="block text-xs font-semibold text-darkNavy mb-1">Target Zone</label>
            <select
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              className="w-full px-3 py-2 border border-lightGrey rounded-input text-sm focus:outline-none focus:border-primaryGreen"
              required
            >
              <option value="">-- Select a Zone --</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name} ({zone.zoneType})
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-darkNavy mb-1">Broadcast Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-lightGrey rounded-input text-sm focus:outline-none focus:border-primaryGreen"
            placeholder="e.g. Traffic surge in Wuse area"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-darkNavy mb-1">Broadcast Message Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-lightGrey rounded-input text-sm focus:outline-none focus:border-primaryGreen"
            placeholder="Write clear, friendly message. Conventions permit Pidgin where appropriate."
            required
          />
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading || !canSendBroadcast}
            className={`px-6 py-2.5 bg-primaryGreen text-white font-semibold rounded-button text-sm transition-all hover:bg-opacity-95 shadow-sm flex items-center gap-2 ${
              loading || !canSendBroadcast ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <Send size={16} />
            <span>{loading ? 'Sending...' : 'Send Broadcast'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

export default BroadcastComposer;
