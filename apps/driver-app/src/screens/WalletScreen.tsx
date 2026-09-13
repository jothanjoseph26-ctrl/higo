import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshCw, Alert } from 'react-native';
import { useWalletStore } from '../stores/walletStore';

const formatNaira = (kobo: number) =>
  `₦${(kobo / 100).toLocaleString()}`;

export const WalletScreen: React.FC = () => {
  const {
    balance,
    ledger,
    canAcceptCash,
    isLoading,
    error,
    fetchBalance,
    fetchLedger,
    checkCashEligibility,
    settleCommission,
  } = useWalletStore();

  const [showSettleModal, setShowSettleModal] = useState(false);

  useEffect(() => {
    fetchBalance();
    fetchLedger();
    checkCashEligibility();
  }, []);

  const onRefresh = async () => {
    await Promise.all([fetchBalance(), fetchLedger(), checkCashEligibility()]);
  };

  return (
    <ScrollView className="flex-1 bg-white">
      {/* Header */}
      <View className="bg-darkNavy px-6 pt-12 pb-6">
        <Text className="text-white text-2xl font-bold">My Money</Text>
        <Text className="text-gray-300 text-sm mt-1">Your financial control centre</Text>
      </View>

      {/* Settlement Warning */}
      {canAcceptCash && !canAcceptCash.allowed && (
        <View className="mx-4 mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
          <Text className="text-red-700 font-bold text-sm">Settlement Required</Text>
          <Text className="text-red-600 text-sm mt-1">{canAcceptCash.reason}</Text>
          <TouchableOpacity
            onPress={() => setShowSettleModal(true)}
            className="mt-3 bg-red-600 rounded-lg px-4 py-2 self-start"
          >
            <Text className="text-white font-medium text-sm">Pay HiGO</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Balance Cards */}
      <View className="px-4 mt-4 space-y-3">
        {/* Available Earnings */}
        <View className="bg-green-50 border border-green-200 rounded-xl p-4">
          <Text className="text-green-600 text-sm">Available Earnings</Text>
          <Text className="text-green-700 text-2xl font-bold mt-1">
            {formatNaira(balance?.availableBalance || 0)}
          </Text>
          <Text className="text-green-500 text-xs mt-1">From card/bank trips</Text>
        </View>

        {/* Cash Summary */}
        <View className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-gray-600 text-sm">Cash Collected</Text>
            <Text className="text-dark font-bold">{formatNaira(balance?.cashCollected || 0)}</Text>
          </View>
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-gray-600 text-sm">HiGO Commission Owed</Text>
            <Text className="text-red-600 font-bold">{formatNaira(balance?.commissionOwed || 0)}</Text>
          </View>
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-gray-600 text-sm">Already Settled</Text>
            <Text className="text-green-600 font-bold">{formatNaira(balance?.commissionSettled || 0)}</Text>
          </View>
          <View className="border-t border-gray-200 mt-2 pt-2">
            <View className="flex-row justify-between items-center">
              <Text className="text-dark font-semibold">Outstanding</Text>
              <Text className="text-red-600 font-bold text-lg">
                {formatNaira(balance?.outstanding || 0)}
              </Text>
            </View>
          </View>

          {(balance?.outstanding || 0) > 0 && (
            <TouchableOpacity
              onPress={() => setShowSettleModal(true)}
              className="mt-3 bg-primaryGreen rounded-lg py-3 items-center"
            >
              <Text className="text-white font-bold">Pay HiGO</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Ledger */}
      <View className="px-4 mt-6 mb-8">
        <Text className="text-dark font-bold text-lg mb-3">Recent Activity</Text>
        {ledger.length === 0 ? (
          <Text className="text-gray-400 text-center py-8">No transactions yet</Text>
        ) : (
          ledger.map((entry) => (
            <View
              key={entry.id}
              className="border-b border-gray-100 py-3 flex-row justify-between items-center"
            >
              <View className="flex-1">
                <Text className="text-dark text-sm font-medium">{entry.description}</Text>
                <Text className="text-gray-400 text-xs mt-1">
                  {new Date(entry.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <View className="items-end">
                <Text
                  className={`font-bold ${
                    entry.amount >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {entry.amount >= 0 ? '+' : ''}{formatNaira(entry.amount)}
                </Text>
                <Text className="text-gray-400 text-xs">
                  Bal: {formatNaira(entry.balanceAfter)}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Settlement Modal */}
      {showSettleModal && (
        <SettlementModal
          outstanding={balance?.outstanding || 0}
          onClose={() => setShowSettleModal(false)}
          onSettle={settleCommission}
        />
      )}

      {/* Loading indicator */}
      {isLoading && (
        <View className="absolute inset-0 bg-white bg-opacity-50 flex items-center justify-center">
          <RefreshCw size={32} color="#00A86B" />
        </View>
      )}
    </ScrollView>
  );
};

const SettlementModal: React.FC<{
  outstanding: number;
  onClose: () => void;
  onSettle: (amount: number, method: string) => Promise<any>;
}> = ({ outstanding, onClose, onSettle }) => {
  const [selectedMethod, setSelectedMethod] = useState<string>('bank_transfer');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSettle = async () => {
    setIsProcessing(true);
    try {
      await onSettle(outstanding, selectedMethod);
      Alert.alert('Success', 'Settlement initiated. Admin will confirm receipt.');
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Settlement failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <View className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <View className="bg-white rounded-2xl w-full max-w-sm p-6">
        <Text className="text-dark text-xl font-bold text-center">Pay HiGO Commission</Text>
        <Text className="text-gray-500 text-center mt-2">
          You owe: {formatNaira(outstanding)}
        </Text>

        <View className="mt-6 space-y-3">
          <Text className="text-dark font-medium">Select payment method:</Text>

          <TouchableOpacity
            onPress={() => setSelectedMethod('bank_transfer')}
            className={`border rounded-lg p-3 ${
              selectedMethod === 'bank_transfer'
                ? 'border-primaryGreen bg-green-50'
                : 'border-gray-200'
            }`}
          >
            <Text className="text-dark font-medium">Bank Transfer</Text>
            <Text className="text-gray-500 text-sm">Transfer to HiGO bank account</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setSelectedMethod('paystack')}
            className={`border rounded-lg p-3 ${
              selectedMethod === 'paystack'
                ? 'border-primaryGreen bg-green-50'
                : 'border-gray-200'
            }`}
          >
            <Text className="text-dark font-medium">Paystack</Text>
            <Text className="text-gray-500 text-sm">Pay via card or bank transfer</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setSelectedMethod('in_person')}
            className={`border rounded-lg p-3 ${
              selectedMethod === 'in_person'
                ? 'border-primaryGreen bg-green-50'
                : 'border-gray-200'
            }`}
          >
            <Text className="text-dark font-medium">In Person</Text>
            <Text className="text-gray-500 text-sm">Pay at HiGO office</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row mt-6 space-x-3">
          <TouchableOpacity
            onPress={onClose}
            className="flex-1 border border-gray-200 rounded-lg py-3 items-center"
          >
            <Text className="text-gray-600 font-medium">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSettle}
            disabled={isProcessing}
            className="flex-1 bg-primaryGreen rounded-lg py-3 items-center"
          >
            <Text className="text-white font-bold">
              {isProcessing ? 'Processing...' : `Pay ${formatNaira(outstanding)}`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default WalletScreen;
