import { useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "./Modal";
import FormLabel from "./FormLabel";
import { api } from "../lib/api";
import toast from "react-hot-toast";
import { getDeviceFingerprint } from "../lib/utils";

interface TwoFactorVerifyModalProps {
  isOpen: boolean;
  userId: string;
  onClose: () => void;
  onSuccess: (data: { user: any; token: string }) => void;
}

export default function TwoFactorVerifyModal({
  isOpen,
  userId,
  onClose,
  onSuccess,
}: TwoFactorVerifyModalProps) {
  const { t } = useTranslation("auth");
  const { t: tCommon } = useTranslation("common");
  const [token, setToken] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [useBackupCode, setUseBackupCode] = useState(false);

  const handleVerify = async () => {
    try {
      setLoading(true);
      setError("");

      if (!token || (useBackupCode ? token.length < 8 : token.length !== 6)) {
        setError(
          useBackupCode
            ? t("twoFactor.enterBackupCode")
            : t("twoFactor.enter6Digit")
        );
        return;
      }

      // Get device fingerprint (same method as login)
      const deviceFingerprint = getDeviceFingerprint();

      const response = await api.post("/api/auth/2fa/verify", {
        userId,
        token: token.trim(),
        deviceFingerprint,
      });

      toast.success(t("twoFactor.verified"));
      onSuccess(response.data);
      handleClose();
    } catch (err: any) {
      const msg = err.response?.data?.error || t("twoFactor.invalidCode");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setToken("");
    setError("");
    setUseBackupCode(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t("twoFactor.title")}
      maxWidth="md"
      footer={
        <div className="flex justify-end space-x-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            {tCommon("cancel")}
          </button>
          <button
            onClick={handleVerify}
            disabled={
              loading ||
              (!useBackupCode && token.length !== 6) ||
              (useBackupCode && token.length < 8)
            }
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t("twoFactor.verifying") : t("twoFactor.verify")}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            {useBackupCode
              ? t("twoFactor.backupDescription")
              : t("twoFactor.description")}
          </p>
        </div>

        <div className="space-y-2">
          <FormLabel required>
            {useBackupCode
              ? t("twoFactor.backupCode")
              : t("twoFactor.verificationCode")}
          </FormLabel>
          <input
            type="text"
            value={token}
            onChange={(e) => {
              let value = e.target.value;
              if (!useBackupCode) {
                value = value.replace(/[^0-9]/g, "").slice(0, 6);
              } else {
                value = value
                  .toUpperCase()
                  .replace(/[^A-Z0-9-]/g, "")
                  .slice(0, 9);
              }
              setToken(value);
              setError("");
            }}
            placeholder={useBackupCode ? "XXXX-XXXX" : t("twoFactor.enterCode")}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-2xl tracking-widest"
            maxLength={useBackupCode ? 9 : 6}
            autoComplete="off"
            autoFocus
          />
          <p className="text-xs text-gray-500">
            {useBackupCode
              ? t("twoFactor.enterBackupCode")
              : t("twoFactor.description")}
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-center">
          <button
            onClick={() => {
              setUseBackupCode(!useBackupCode);
              setToken("");
              setError("");
            }}
            className="text-sm text-blue-600 hover:text-blue-700 underline"
          >
            {useBackupCode
              ? t("twoFactor.useAuthenticator")
              : t("twoFactor.useBackupCode")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
