import React, { useCallback, useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import { apiService } from '../services/api';
import { PromoCode, PromoDiscountType } from '@higo/shared-types';
import { ColumnDef } from '@tanstack/react-table';
import { Gift, Loader2, Plus, Tag } from 'lucide-react';

const formatNaira = (kobo: number) =>
  `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDiscount = (promo: PromoCode) => {
  if (promo.discountType === 'percent') {
    return `${promo.discountValue / 100}%`;
  }
  return formatNaira(promo.discountValue);
};

export const Promotions: React.FC = () => {
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '',
    discountType: 'percent' as PromoDiscountType,
    discountValue: '10',
    maxUses: '1000',
    expiresAt: '',
  });

  const loadPromos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.getPromos({ limit: 50 });
      setPromos(response.items);
    } catch (err: any) {
      setError(err?.message || 'Failed to load promotions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPromos();
  }, [loadPromos]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const discountValue =
        form.discountType === 'percent'
          ? Math.round(Number.parseFloat(form.discountValue) * 100)
          : Math.round(Number.parseFloat(form.discountValue) * 100);

      await apiService.createPromo({
        code: form.code.trim().toUpperCase(),
        discountType: form.discountType,
        discountValue,
        maxUses: form.maxUses ? Number.parseInt(form.maxUses, 10) : undefined,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
        isActive: true,
      });

      setForm({
        code: '',
        discountType: 'percent',
        discountValue: '10',
        maxUses: '1000',
        expiresAt: '',
      });
      await loadPromos();
    } catch (err: any) {
      setError(err?.message || 'Failed to create promotion');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (promo: PromoCode) => {
    if (!window.confirm(`Deactivate promo code ${promo.code}?`)) return;

    try {
      await apiService.updatePromo(promo.id, { isActive: false });
      await loadPromos();
    } catch (err: any) {
      setError(err?.message || 'Failed to deactivate promotion');
    }
  };

  const handleActivate = async (promo: PromoCode) => {
    try {
      await apiService.updatePromo(promo.id, { isActive: true });
      await loadPromos();
    } catch (err: any) {
      setError(err?.message || 'Failed to activate promotion');
    }
  };

  const handleDelete = async (promo: PromoCode) => {
    if (!window.confirm(`Delete promo code ${promo.code}? This cannot be undone.`)) return;

    try {
      await apiService.deletePromo(promo.id);
      await loadPromos();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete promotion');
    }
  };

  const columns: ColumnDef<PromoCode>[] = [
    {
      accessorKey: 'code',
      header: 'Code',
      cell: (info) => (
        <span className="font-mono font-bold text-darkNavy">{info.row.original.code}</span>
      ),
    },
    {
      accessorKey: 'discountType',
      header: 'Discount',
      cell: (info) => (
        <span className="text-xs font-semibold">
          {formatDiscount(info.row.original)} ({info.row.original.discountType})
        </span>
      ),
    },
    {
      accessorKey: 'usedCount',
      header: 'Usage',
      cell: (info) => {
        const promo = info.row.original;
        const limit = promo.maxUses ?? '∞';
        return (
          <span className="text-xs text-gray-600">
            {promo.usedCount} / {limit}
          </span>
        );
      },
    },
    {
      accessorKey: 'expiresAt',
      header: 'Expires',
      cell: (info) => (
        <span className="text-xs text-gray-500">
          {info.row.original.expiresAt
            ? new Date(info.row.original.expiresAt).toLocaleDateString()
            : 'Never'}
        </span>
      ),
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: (info) => (
        <span
          className={`text-[10px] px-2 py-0.5 rounded-button font-bold uppercase ${
            info.row.original.isActive
              ? 'bg-green-100 text-primaryGreen'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          {info.row.original.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (info) => {
        const promo = info.row.original;
        return (
          <div className="flex items-center gap-2">
            {promo.isActive ? (
              <button
                type="button"
                onClick={() => void handleDeactivate(promo)}
                className="text-xs font-semibold text-warning hover:underline"
              >
                Deactivate
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleActivate(promo)}
                className="text-xs font-semibold text-primaryGreen hover:underline"
              >
                Activate
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleDelete(promo)}
              className="text-xs font-semibold text-error hover:underline"
            >
              Delete
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-darkNavy">Promotions</h1>
        <p className="text-xs text-gray-500">
          Create and manage promo codes applied at trip request (e.g. WELCOME10 = 10% off)
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 bg-white p-6 rounded-card shadow-custom border border-lightGrey">
          <h3 className="font-semibold text-sm text-darkNavy border-b border-lightGrey pb-2 mb-4 flex items-center gap-1.5">
            <Plus className="text-primaryGreen" size={16} />
            <span>Create Promo Code</span>
          </h3>

          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-darkNavy mb-1">Code</label>
              <input
                required
                value={form.code}
                onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                placeholder="WELCOME10"
                className="w-full px-3 py-2 border border-lightGrey rounded-input text-sm font-mono uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-darkNavy mb-1">Discount Type</label>
              <select
                value={form.discountType}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    discountType: e.target.value as PromoDiscountType,
                  }))
                }
                className="w-full px-3 py-2 border border-lightGrey rounded-input text-sm"
              >
                <option value="percent">Percent (%)</option>
                <option value="fixed">Fixed (₦)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-darkNavy mb-1">
                {form.discountType === 'percent' ? 'Discount (%)' : 'Discount (₦)'}
              </label>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={form.discountValue}
                onChange={(e) => setForm((prev) => ({ ...prev, discountValue: e.target.value }))}
                className="w-full px-3 py-2 border border-lightGrey rounded-input text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-darkNavy mb-1">Max Uses</label>
              <input
                type="number"
                min="1"
                value={form.maxUses}
                onChange={(e) => setForm((prev) => ({ ...prev, maxUses: e.target.value }))}
                className="w-full px-3 py-2 border border-lightGrey rounded-input text-sm"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-darkNavy mb-1">Expires At (optional)</label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm((prev) => ({ ...prev, expiresAt: e.target.value }))}
                className="w-full px-3 py-2 border border-lightGrey rounded-input text-sm"
              />
            </div>

            {error && (
              <div className="md:col-span-2 text-xs text-error font-medium">{error}</div>
            )}

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primaryGreen text-white rounded-button text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="animate-spin" size={16} /> : <Tag size={16} />}
                Create Promo
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white p-6 rounded-card shadow-custom border border-lightGrey space-y-4">
          <h3 className="font-semibold text-sm text-darkNavy border-b border-lightGrey pb-2 flex items-center gap-1.5">
            <Gift className="text-accentOrange" size={16} />
            <span>Promo Guidelines</span>
          </h3>
          <div className="space-y-3 text-xs text-dark font-medium leading-relaxed">
            <p>
              <strong className="text-darkNavy">Percent discounts</strong> use basis points internally
              (10% = 1000). Fixed discounts are stored in kobo.
            </p>
            <p>
              <strong className="text-darkNavy">Trip request:</strong> Passengers pass{' '}
              <code className="bg-lightGrey px-1 rounded">promoCode</code> in the request body.
              Usage is decremented when the trip is created.
            </p>
            <p className="p-3 bg-lightGrey rounded-input text-gray-500">
              Seeded test code: <strong className="text-darkNavy">WELCOME10</strong> — 10% off, 10,000 max uses.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-darkNavy">Active & Historical Promos</h3>
        <DataTable columns={columns} data={promos} loading={loading} />
      </div>
    </div>
  );
};

export default Promotions;