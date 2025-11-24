import { useState } from 'react';
import Modal from './Modal';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

interface TwoFactorSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function TwoFactorSetupModal({ isOpen, onClose, onSuccess }: TwoFactorSetupModalProps) {
  const [step, setStep] = useState<'setup' | 'verify' | 'backup'>('setup');
  const [qrCode, setQRCode] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [token, setToken] = useState<string>('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const handleSetup = async () => {
    try {
      setLoading(true);
      setError('');
      
  const response = await api.post('/api/auth/2fa/setup');
      setQRCode(response.data.qrCode);
      setSecret(response.data.secret);
      setStep('verify');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to setup 2FA');
      toast.error(err.response?.data?.error || 'Failed to setup 2FA');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    try {
      setLoading(true);
      setError('');

      if (!token || token.length !== 6) {
        setError('Please enter a valid 6-digit code');
        return;
      }

  const response = await api.post('/api/auth/2fa/verify-setup', {
        token: token.trim(),
        secret,
      });

      setBackupCodes(response.data.backupCodes);
      setStep('backup');
      toast.success('2FA enabled successfully!');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid verification code');
      toast.error(err.response?.data?.error || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    onSuccess();
    handleClose();
  };

  const handleClose = () => {
    setStep('setup');
    setQRCode('');
    setSecret('');
    setToken('');
    setBackupCodes([]);
    setError('');
    onClose();
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    toast.success('Backup codes copied to clipboard');
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Enable Two-Factor Authentication">
      <div className="space-y-4">
        {step === 'setup' && (
          <>
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                Two-factor authentication adds an extra layer of security to your account.
                You'll need to enter a code from your authenticator app each time you log in from a new device.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="flex justify-end space-x-3">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSetup}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Setting up...' : 'Continue'}
              </button>
            </div>
          </>
        )}

        {step === 'verify' && (
          <>
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-medium mb-2">Scan QR Code</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                </p>
                {qrCode && (
                  <div className="flex justify-center mb-4">
                    <img src={qrCode} alt="QR Code" className="border rounded-lg p-2" />
                  </div>
                )}
                <div className="bg-gray-100 p-3 rounded-md">
                  <p className="text-xs text-gray-500 mb-1">Or enter this key manually:</p>
                  <code className="text-sm font-mono break-all">{secret}</code>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Verification Code
                </label>
                <input
                  type="text"
                  value={token}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                    setToken(value);
                    setError('');
                  }}
                  placeholder="Enter 6-digit code"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-2xl tracking-widest"
                  maxLength={6}
                  autoComplete="off"
                />
                <p className="text-xs text-gray-500">
                  Enter the 6-digit code from your authenticator app
                </p>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleVerify}
                disabled={loading || token.length !== 6}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Verifying...' : 'Verify & Enable'}
              </button>
            </div>
          </>
        )}

        {step === 'backup' && (
          <>
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-lg font-medium">Save Your Backup Codes</h3>
                <p className="text-sm text-gray-600">
                  These backup codes can be used to access your account if you lose your authenticator device.
                  Store them in a safe place.
                </p>
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                  <p className="text-sm text-yellow-800 font-medium">
                    ⚠️ You won't be able to see these codes again. Make sure to save them now!
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                <div className="grid grid-cols-2 gap-2">
                  {backupCodes.map((code, index) => (
                    <div
                      key={index}
                      className="bg-white px-3 py-2 rounded border border-gray-200 text-center font-mono text-sm"
                    >
                      {code}
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={copyBackupCodes}
                className="w-full px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100"
              >
                📋 Copy All Codes
              </button>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleComplete}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
              >
                I've Saved My Backup Codes
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
