import { useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "./Modal";
import { api } from "../lib/api";
import toast from "react-hot-toast";

interface TwoFactorSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function TwoFactorSetupModal({
  isOpen,
  onClose,
  onSuccess,
}: TwoFactorSetupModalProps) {
  const { t } = useTranslation("auth");
  const { t: tCommon } = useTranslation("common");
  const [step, setStep] = useState<"setup" | "verify" | "backup">("setup");
  const [qrCode, setQRCode] = useState<string>("");
  const [secret, setSecret] = useState<string>("");
  const [token, setToken] = useState<string>("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const handleSetup = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.post("/api/auth/2fa/setup");
      setQRCode(response.data.qrCode);
      setSecret(response.data.secret);
      setStep("verify");
    } catch (err: any) {
      const msg =
        err.response?.data?.error ||
        t("twoFactor.setupFailed", "Failed to setup 2FA");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    try {
      setLoading(true);
      setError("");

      if (!token || token.length !== 6) {
        setError(t("twoFactor.enter6Digit"));
        return;
      }

      const response = await api.post("/api/auth/2fa/verify-setup", {
        token: token.trim(),
        secret,
      });

      setBackupCodes(response.data.backupCodes);
      setStep("backup");
      toast.success(t("twoFactor.verified"));
    } catch (err: any) {
      const msg = err.response?.data?.error || t("twoFactor.invalidCode");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    onSuccess();
    handleClose();
  };

  const handleClose = () => {
    setStep("setup");
    setQRCode("");
    setSecret("");
    setToken("");
    setBackupCodes([]);
    setError("");
    onClose();
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    toast.success(t("twoFactorSetup.backupCodes.copied"));
  };

  const getFooterButtons = () => {
    if (step === "setup") {
      return (
        <div className="flex justify-end space-x-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            {tCommon("cancel")}
          </button>
          <button
            onClick={handleSetup}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? t("twoFactorSetup.settingUp")
              : t("twoFactorSetup.continue")}
          </button>
        </div>
      );
    }
    if (step === "verify") {
      return (
        <div className="flex justify-end space-x-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            {tCommon("cancel")}
          </button>
          <button
            onClick={handleVerify}
            disabled={loading || token.length !== 6}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? t("twoFactor.verifying")
              : t("twoFactorSetup.verifyAndEnable")}
          </button>
        </div>
      );
    }
    if (step === "backup") {
      return (
        <div className="flex justify-end">
          <button
            onClick={handleComplete}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
          >
            {t("twoFactorSetup.backupCodes.saved")}
          </button>
        </div>
      );
    }
    return null;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t("twoFactorSetup.title")}
      footer={getFooterButtons()}
    >
      <div className="space-y-4">
        {step === "setup" && (
          <>
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                {t("twoFactorSetup.description")}
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
          </>
        )}

        {step === "verify" && (
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-medium mb-2">
                {t("twoFactorSetup.scanQRCode")}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {t("twoFactorSetup.scanDescription")}
              </p>
              {qrCode && (
                <div className="flex justify-center mb-4">
                  <img
                    src={qrCode}
                    alt="QR Code"
                    className="border rounded-lg p-2"
                  />
                </div>
              )}
              <div className="bg-gray-100 p-3 rounded-md">
                <p className="text-xs text-gray-500 mb-1">
                  {t("twoFactorSetup.manualEntry")}
                </p>
                <code className="text-sm font-mono break-all">{secret}</code>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                {t("twoFactor.verificationCode")}
              </label>
              <input
                type="text"
                value={token}
                onChange={(e) => {
                  const value = e.target.value
                    .replace(/[^0-9]/g, "")
                    .slice(0, 6);
                  setToken(value);
                  setError("");
                }}
                placeholder={t("twoFactor.enterCode")}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-2xl tracking-widest"
                maxLength={6}
                autoComplete="off"
              />
              <p className="text-xs text-gray-500">
                {t("twoFactor.description")}
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
          </div>
        )}

        {step === "backup" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-medium">
                {t("twoFactorSetup.backupCodes.title")}
              </h3>
              <p className="text-sm text-gray-600">
                {t("twoFactorSetup.backupCodes.description")}
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                <p className="text-sm text-yellow-800 font-medium">
                  ⚠️ {t("twoFactorSetup.backupCodes.warning")}
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
              📋 {t("twoFactorSetup.backupCodes.copyAll")}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
