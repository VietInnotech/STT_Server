import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  FileAudio,
  FileText,
  Download,
  Trash2,
  Search,
  Upload,
  Loader2,
  RefreshCw,
  Share2,
} from "lucide-react";
import { filesApi, type FileItem } from "../lib/api";
import { useSettingsStore } from "../stores/settings";
import { formatDate } from "../lib/formatters";
import { Pagination } from "../components/Pagination";
import toast from "react-hot-toast";
import ShareFilesModal from "../components/ShareFilesModal";
import Modal from "../components/Modal";
import FormLabel from "../components/FormLabel";
import { usePermission } from "../hooks/usePermission";
import { PERMISSIONS } from "../lib/permissions";

interface CombinedFile extends FileItem {
  type: "audio" | "text";
  // If this is a synthetic pair row representing a pair, isPair is true
  isPair?: boolean;
  pairId?: string;
  summaryFileId?: string;
  realtimeFileId?: string;
}

export default function FilesPage() {
  const { t } = useTranslation("files");
  const itemsPerPage = useSettingsStore((s) => s.itemsPerPage);
  const { can } = usePermission();
  const canWrite = can(PERMISSIONS.FILES_WRITE);
  const canDelete = can(PERMISSIONS.FILES_DELETE);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [files, setFiles] = useState<CombinedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingType, setPendingType] = useState<"audio" | "text" | null>(null);
  const [pendingDeleteAfterDays, setPendingDeleteAfterDays] = useState<
    number | "" | null
  >(null);
  const [showShareModal, setShowShareModal] = useState(false);

  const [ownerSharesModalFile, setOwnerSharesModalFile] =
    useState<CombinedFile | null>(null);
  const [compareFile, setCompareFile] = useState<CombinedFile | null>(null);
  const [compareTextContent, setCompareTextContent] = useState<string | null>(
    null
  );
  const [compareLoading, setCompareLoading] = useState(false);
  const [pairViewer, setPairViewer] = useState<CombinedFile | null>(null);
  const [pairViewerLoading, setPairViewerLoading] = useState(false);
  const [pairViewerContent, setPairViewerContent] = useState<{
    summary?: string;
    realtime?: string;
  } | null>(null);
  const [fileViewer, setFileViewer] = useState<CombinedFile | null>(null);
  const [fileViewerContent, setFileViewerContent] = useState<{
    text?: string;
    audioUrl?: string;
  } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // When audio URL changes, force the audio element to reload metadata so duration is detected.
    if (audioRef.current) {
      try {
        if (fileViewerContent?.audioUrl) {
          audioRef.current.src = fileViewerContent.audioUrl;
        } else {
          audioRef.current.removeAttribute("src");
        }
        audioRef.current.load();
      } catch {}
    }
  }, [fileViewerContent?.audioUrl]);

  // Reset to page 1 when itemsPerPage changes
  useEffect(() => {
    setCurrentPage(1);
  }, [itemsPerPage]);

  const [usersMap, setUsersMap] = useState<Record<string, string>>({});
  const [settingsAutoDeleteDays, setSettingsAutoDeleteDays] = useState<
    number | null | undefined
  >(undefined);
  const [selectedRecipients, setSelectedRecipients] = useState<
    Record<string, boolean>
  >({});
  const audioInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // Fetch files from API
  const fetchFiles = async () => {
    setLoading(true);
    try {
      const [resAll, resPairs] = await Promise.all([
        filesApi.listAll(),
        (filesApi as any).listPairs(),
      ]);

      const audioFiles: CombinedFile[] = (resAll.data.audio || []).map((f) => ({
        ...f,
        type: "audio" as const,
      }));

      const textFiles: CombinedFile[] = (resAll.data.text || []).map((f) => ({
        ...f,
        type: "text" as const,
      }));
      const pairsData = resPairs?.data?.pairs || [];

      // build map of fileIds that are part of an android-origin pair only (we dedupe only android pairs)
      const pairFileIds = new Set<string>();
      const androidPairs = (pairsData || []).filter(
        (p: any) =>
          p.summaryFile?.origin === "android" &&
          p.realtimeFile?.origin === "android"
      );
      for (const p of androidPairs) {
        if (p.summaryFileId) pairFileIds.add(p.summaryFileId);
        if (p.realtimeFileId) pairFileIds.add(p.realtimeFileId);
      }

      // filter out text files that are in pairs
      const singleTextFiles = textFiles.filter((t) => !pairFileIds.has(t.id));

      // build synthetic combined file rows for android pairs only (others will be shown as single files)
      const pairRows: CombinedFile[] = (androidPairs || []).map((p: any) => ({
        id: `pair:${p.id}`,
        filename:
          p.name ||
          `${p.summaryFile?.originalName || "summary"} / ${
            p.realtimeFile?.originalName || "realtime"
          }`,
        originalName: p.name || undefined,
        fileSize:
          (p.summaryFile?.fileSize || 0) + (p.realtimeFile?.fileSize || 0),
        mimeType: "text/pair",
        deviceId:
          p.summaryFile?.deviceId || p.realtimeFile?.deviceId || undefined,
        uploadedById: p.uploadedById || undefined,
        uploadedBy: p.uploadedBy || null,
        uploadedAt:
          p.createdAt ||
          p.summaryFile?.uploadedAt ||
          p.realtimeFile?.uploadedAt ||
          new Date().toISOString(),
        updatedAt: p.updatedAt || undefined,
        type: "text",
        isPair: true,
        pairId: p.id,
        summaryFileId: p.summaryFileId,
        realtimeFileId: p.realtimeFileId,
      }));

      const all = [...audioFiles, ...pairRows, ...singleTextFiles].sort(
        (a, b) =>
          new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      );
      setFiles(all);
      return all;
    } catch (error) {
      toast.error(t("failedToFetch"));
      console.error("Error fetching files:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  useEffect(() => {
    // fetch all users mapping for display in owner shares
    import("../lib/api").then(({ usersApi }) => {
      usersApi
        .list()
        .then((res) => {
          const map: Record<string, string> = {};
          res.data.users.forEach((u: any) => {
            map[u.id] = u.fullName || u.username;
          });
          setUsersMap(map);
        })
        .catch(() => {});
    });
    // fetch merged settings (this includes system fallback) to display auto-delete default
    import("../lib/api").then(({ settingsApi }) => {
      settingsApi
        .get()
        .then((res) => {
          const auto =
            (res.data?.settings && res.data.settings.autoDeleteDays) ??
            undefined;
          setSettingsAutoDeleteDays(auto);
        })
        .catch(() => {
          setSettingsAutoDeleteDays(undefined);
        });
    });
  }, []);

  useEffect(() => {
    const handler = (e: any) => {
      const payload = e?.detail;
      // Refresh file list when notified
      fetchFiles()
        .then((all) => {
          // If modal open and this file matches, update modal content
          if (
            ownerSharesModalFile &&
            payload &&
            payload.fileId &&
            ownerSharesModalFile.id === payload.fileId
          ) {
            const refreshed = (all || []).find(
              (f: any) => f.id === payload.fileId
            );
            setOwnerSharesModalFile(refreshed || null);
          }
        })
        .catch(() => {});
    };
    window.addEventListener("files:shared", handler as EventListener);
    window.addEventListener("files:revoked", handler as EventListener);
    return () => {
      window.removeEventListener("files:shared", handler as EventListener);
      window.removeEventListener("files:revoked", handler as EventListener);
    };
  }, [ownerSharesModalFile]);

  // Handle file upload
  // Prepare upload: open modal to ask for per-file auto-delete days
  const handleFileUpload = async (file: File, type: "audio" | "text") => {
    // store pending file and show modal for per-file options
    setPendingFile(file);
    setPendingType(type);
    // default the modal input to user's settings if available, otherwise empty
    setPendingDeleteAfterDays(settingsAutoDeleteDays ?? "");
  };

  const confirmUpload = async () => {
    if (!pendingFile || !pendingType) return;
    setUploading(true);
    try {
      const deleteAfterDays =
        typeof pendingDeleteAfterDays === "number"
          ? pendingDeleteAfterDays
          : null;
      if (pendingType === "audio") {
        await filesApi.uploadAudio(pendingFile, "web-upload", deleteAfterDays);
      } else {
        await filesApi.uploadText({
          file: pendingFile,
          deviceId: "web-upload",
          deleteAfterDays,
        });
      }
      toast.success(
        pendingType === "audio"
          ? t("audioUploadSuccess")
          : t("textUploadSuccess")
      );
      fetchFiles();
    } catch (error) {
      toast.error(t("failedToUpload"));
      console.error("Error uploading file:", error);
    } finally {
      setUploading(false);
      setPendingFile(null);
      setPendingType(null);
      setPendingDeleteAfterDays(null);
      // clear file inputs to allow re-selection of same file
      if (audioInputRef.current) audioInputRef.current.value = "";
      if (textInputRef.current) textInputRef.current.value = "";
    }
  };

  const cancelPendingUpload = () => {
    setPendingFile(null);
    setPendingType(null);
    setPendingDeleteAfterDays(null);
    if (audioInputRef.current) audioInputRef.current.value = "";
    if (textInputRef.current) textInputRef.current.value = "";
  };

  // Handle file download
  const handleDownload = async (file: CombinedFile) => {
    try {
      if ((file as any).isPair) {
        const p = file as any;
        const summaryResp = await filesApi.getText(p.summaryFileId);
        const realtimeResp = await filesApi.getText(p.realtimeFileId);
        const url1 = window.URL.createObjectURL(summaryResp.data as Blob);
        const link1 = document.createElement("a");
        link1.href = url1;
        link1.setAttribute("download", `${file.filename}_summary.txt`);
        document.body.appendChild(link1);
        link1.click();
        link1.remove();
        window.URL.revokeObjectURL(url1);
        const url2 = window.URL.createObjectURL(realtimeResp.data as Blob);
        const link2 = document.createElement("a");
        link2.href = url2;
        link2.setAttribute("download", `${file.filename}_realtime.txt`);
        document.body.appendChild(link2);
        link2.click();
        link2.remove();
        window.URL.revokeObjectURL(url2);
        toast.success(t("pairDownloaded"));
        return;
      }
      const response =
        file.type === "audio"
          ? await filesApi.getAudio(file.id)
          : await filesApi.getText(file.id);

      const url = window.URL.createObjectURL(response.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", file.filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success(t("fileDownloaded"));
    } catch (error) {
      toast.error(t("failedToDownload"));
      console.error("Error downloading file:", error);
    }
  };

  // Handle file delete
  const handleDelete = async (file: CombinedFile) => {
    if (!confirm(t("confirmDelete", { filename: file.filename }))) return;

    try {
      if ((file as any).isPair) {
        await (filesApi as any).deletePair((file as any).pairId);
      } else if (file.type === "audio") {
        await filesApi.deleteAudio(file.id);
      } else {
        await filesApi.deleteText(file.id);
      }
      toast.success(t("fileDeleted"));
      fetchFiles();
    } catch (error) {
      toast.error(t("failedToDelete"));
      console.error("Error deleting file:", error);
    }
  };

  const handleRevoke = async (fileId: string, sharedWithId: string) => {
    if (!confirm(t("revokeShareConfirm"))) return;
    try {
      await filesApi.revokeShare({ fileId, sharedWithId });
      toast.success(t("shareRevoked"));
      // Refresh files and update modal; close modal if no shares remain
      const all = await fetchFiles();
      if (all) {
        const refreshed = all.find((f) => f.id === fileId) as any;
        if (!refreshed || !((refreshed as any)._ownerShares || []).length) {
          setOwnerSharesModalFile(null);
        } else if (ownerSharesModalFile && ownerSharesModalFile.id === fileId) {
          setOwnerSharesModalFile(refreshed);
        }
      }
    } catch (err) {
      console.error("Failed to revoke", err);
      toast.error(t("failedToRevoke"));
    }
  };

  const revokeSelected = async () => {
    if (!ownerSharesModalFile) return;
    const toRevoke = Object.keys(selectedRecipients).filter(
      (k) => selectedRecipients[k]
    );
    if (toRevoke.length === 0) {
      toast.error(t("noRecipientsSelected"));
      return;
    }
    if (!confirm(t("revokeSelectedConfirm", { count: toRevoke.length })))
      return;
    try {
      for (const sharedWithId of toRevoke) {
        await filesApi.revokeShare({
          fileId: ownerSharesModalFile.id,
          sharedWithId,
        });
      }
      toast.success(t("revokedSelected"));
      // Refresh files and modal content
      const all = await fetchFiles();
      if (all) {
        const refreshed = all.find(
          (f) => f.id === ownerSharesModalFile.id
        ) as any;
        if (!refreshed || !((refreshed as any)._ownerShares || []).length) {
          setOwnerSharesModalFile(null);
        } else {
          setOwnerSharesModalFile(refreshed);
        }
      }
      setSelectedRecipients({});
    } catch (err) {
      console.error("Batch revoke failed", err);
      toast.error(t("failedToRevokeSelected"));
    }
  };

  const filteredFiles = files.filter((file) =>
    file.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  // Apply pagination to filtered files
  const totalItems = filteredFiles.length;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedFiles = filteredFiles.slice(startIndex, endIndex);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t("title")}</h2>
          <p className="text-sm text-gray-500 mt-1">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          {canWrite && (
            <button
              onClick={() => setShowShareModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Share2 className="h-4 w-4" />
              {t("share")}
            </button>
          )}
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*,.wav,.mp3,.ogg,.webm,.m4a,.aac,.flac"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const allowedExts = [
                ".wav",
                ".mp3",
                ".ogg",
                ".webm",
                ".m4a",
                ".aac",
                ".flac",
              ];
              const ext = file.name.split(".").pop()?.toLowerCase() || "";
              if (
                !file.type.startsWith("audio") &&
                !allowedExts.includes("." + ext)
              ) {
                toast.error(t("invalidAudioFile"));
                e.currentTarget.value = "";
                return;
              }
              handleFileUpload(file, "audio");
            }}
          />
          <input
            ref={textInputRef}
            type="file"
            accept=".txt,.log,.json,.csv,.xml,text/*,application/json,application/xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const allowedExts = [".txt", ".log", ".json", ".csv", ".xml"];
              const ext = file.name.split(".").pop()?.toLowerCase() || "";
              if (
                !file.type.startsWith("text") &&
                !allowedExts.includes("." + ext) &&
                file.type !== "application/json" &&
                file.type !== "application/xml"
              ) {
                toast.error(t("invalidTextFile"));
                e.currentTarget.value = "";
                return;
              }
              handleFileUpload(file, "text");
            }}
          />
          {canWrite && (
            <button
              onClick={() => audioInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {t("uploadAudio")}
            </button>
          )}
          {canWrite && (
            <button
              onClick={() => textInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {t("uploadText")}
            </button>
          )}
          <button
            onClick={fetchFiles}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
            title={t("refresh")}
            aria-label={t("refresh")}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {t("refresh")}
          </button>
        </div>
      </div>

      <ShareFilesModal
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        files={files.filter((f) => !(f as any).isPair)}
        onShared={() => fetchFiles()}
      />

      {/* Per-file upload options modal */}
      <Modal
        title={
          pendingFile
            ? `${t("upload")} ${
                pendingType === "audio" ? t("audio") : t("text")
              }: ${pendingFile.name}`
            : t("uploadFile")
        }
        open={!!pendingFile}
        onClose={cancelPendingUpload}
        maxWidth="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={cancelPendingUpload}
              className="px-3 py-2 rounded bg-gray-100"
            >
              {t("cancel")}
            </button>
            <button
              onClick={confirmUpload}
              disabled={uploading}
              className="px-3 py-2 rounded bg-blue-600 text-white"
            >
              {uploading ? t("uploading") : t("upload")}
            </button>
          </div>
        }
      >
        <div>
          <FormLabel>{t("autoDeleteAfter")}</FormLabel>
          <input
            type="number"
            min={1}
            placeholder={t("autoDeletePlaceholder")}
            value={
              pendingDeleteAfterDays === null
                ? ""
                : pendingDeleteAfterDays === undefined
                ? ""
                : pendingDeleteAfterDays
            }
            onChange={(e) => {
              const val = e.target.value;
              if (val === "") setPendingDeleteAfterDays("");
              else {
                const n = Number(val);
                setPendingDeleteAfterDays(Number.isNaN(n) ? "" : n);
              }
            }}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">{t("autoDeleteHint")}</p>
        </div>
      </Modal>

      <Modal
        title={
          ownerSharesModalFile
            ? `${t("sharedRecipients")} ${ownerSharesModalFile.filename}`
            : t("sharedRecipients")
        }
        open={!!ownerSharesModalFile}
        onClose={() => setOwnerSharesModalFile(null)}
        maxWidth="md"
        footer={
          ownerSharesModalFile &&
          ((ownerSharesModalFile as any)._ownerShares || []).length > 0 ? (
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSelectedRecipients({})}
                className="px-3 py-2 rounded bg-gray-100"
              >
                {t("clear")}
              </button>
              <button
                onClick={revokeSelected}
                className="px-3 py-2 rounded bg-red-600 text-white"
              >
                {t("revokeSelected")}
              </button>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-4">
          {ownerSharesModalFile ? (
            <div>
              <ul className="space-y-2">
                {((ownerSharesModalFile as any)._ownerShares || []).map(
                  (s: any) => (
                    <li
                      key={s.sharedWithId}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={!!selectedRecipients[s.sharedWithId]}
                          onChange={() =>
                            setSelectedRecipients((p) => ({
                              ...p,
                              [s.sharedWithId]: !p[s.sharedWithId],
                            }))
                          }
                        />
                        <div>
                          <div className="font-medium">
                            {usersMap[s.sharedWithId] || s.sharedWithId}
                          </div>
                          {s.expiresAt ? (
                            <div className="text-xs text-gray-500">
                              {t("expires")}:{" "}
                              {new Date(s.expiresAt).toLocaleString()}
                            </div>
                          ) : (
                            <div className="text-xs text-gray-500">
                              {t("noExpiry")}
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <button
                          onClick={() => {
                            handleRevoke(
                              ownerSharesModalFile.id,
                              s.sharedWithId
                            );
                          }}
                          className="text-sm text-red-600"
                        >
                          {t("revoke")}
                        </button>
                      </div>
                    </li>
                  )
                )}
              </ul>
            </div>
          ) : (
            <div>{t("noShares")}</div>
          )}
        </div>
      </Modal>

      {/* Compare modal for android text vs uploaded text */}
      {/* Compare modal for android text vs uploaded text */}
      <Modal
        title={
          compareFile
            ? `${t("compare")}: ${compareFile.filename}`
            : t("compare")
        }
        open={!!compareFile}
        onClose={() => {
          setCompareFile(null);
          setCompareTextContent(null);
        }}
        maxWidth="full"
        fullHeight={true}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
          <div className="flex flex-col h-full">
            <h4 className="text-sm font-semibold">{t("androidPayload")}</h4>
            <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap overflow-auto bg-gray-50 p-3 rounded flex-1 min-h-0">
              <pre className="text-xs">
                {(compareFile as any)?.androidSummary ??
                  (compareFile as any)?.androidRealtime ??
                  t("noAndroidPayload")}
              </pre>
            </div>
          </div>
          <div className="flex flex-col h-full">
            <h4 className="text-sm font-semibold">{t("uploadedText")}</h4>
            <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap overflow-auto bg-white p-3 rounded flex-1 min-h-0">
              {compareLoading ? (
                <div>{t("loading")}</div>
              ) : (
                <pre className="text-xs">
                  {compareTextContent ?? t("noDecryptedContent")}
                </pre>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* Pair viewer modal - split view for both summary and realtime */}
      <Modal
        title={
          pairViewer ? `${t("pair")}: ${pairViewer.filename}` : t("pairView")
        }
        open={!!pairViewer}
        onClose={() => {
          setPairViewer(null);
          setPairViewerContent(null);
          setPairViewerLoading(false);
        }}
        maxWidth="2xl"
        fullHeight={true}
      >
        {pairViewerLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
            <div className="flex flex-col h-full">
              <h4 className="text-sm font-semibold">{t("summary")}</h4>
              <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap overflow-auto bg-gray-100 p-3 rounded flex-1 min-h-0">
                <pre className="text-xs">
                  {pairViewerContent?.summary ?? t("noContent")}
                </pre>
              </div>
            </div>
            <div className="flex flex-col h-full">
              <h4 className="text-sm font-semibold">{t("realtime")}</h4>
              <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap overflow-auto bg-gray-100 p-3 rounded flex-1 min-h-0">
                <pre className="text-xs">
                  {pairViewerContent?.realtime ?? t("noContent")}
                </pre>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* File viewer modal - single file text or audio view */}
      <Modal
        title={fileViewer ? fileViewer.filename : t("viewFile")}
        open={!!fileViewer}
        onClose={() => {
          setFileViewer(null);
          if (fileViewerContent?.audioUrl)
            URL.revokeObjectURL(fileViewerContent.audioUrl);
          setFileViewerContent(null);
        }}
        maxWidth={fileViewer?.type === "audio" ? "sm" : "2xl"}
        fullHeight={fileViewer?.type === "audio" ? false : true}
      >
        {fileViewer ? (
          fileViewer.type === "audio" ? (
            <div className="space-y-4 h-full">
              <audio
                controls
                className="w-full"
                preload="metadata"
                ref={audioRef}
              >
                <source
                  src={fileViewerContent?.audioUrl}
                  type={fileViewer?.mimeType || "audio/wav"}
                />
                {t("audioNotSupported")}
              </audio>

              <div className="text-sm text-gray-500">
                {t("filename")}: {fileViewer.filename}
              </div>
              <div className="text-sm text-gray-500">
                {t("uploaded")}: {formatDate(fileViewer.uploadedAt)}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col">
              <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap overflow-auto bg-gray-100 p-3 rounded flex-1 min-h-0">
                <pre className="text-xs">
                  {fileViewerContent?.text ?? t("noTextContent")}
                </pre>
              </div>
            </div>
          )
        ) : null}
      </Modal>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          placeholder={t("searchFiles")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Files Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {t("noFilesFound")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("file")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("size")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("uploadedBy")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("deleteAfter")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("uploaded")}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedFiles.map((file: CombinedFile) => (
                  <tr
                    key={file.id}
                    className="hover:bg-gray-50"
                    onDoubleClick={async () => {
                      try {
                        if ((file as any).isPair) {
                          // Fetch both files and open split view
                          setPairViewer(file);
                          setPairViewerLoading(true);
                          setPairViewerContent(null);
                          const summaryId = (file as any).summaryFileId;
                          const realtimeId = (file as any).realtimeFileId;
                          const [summaryResp, realtimeResp] = await Promise.all(
                            [
                              filesApi.getText(summaryId),
                              filesApi.getText(realtimeId),
                            ]
                          );
                          let sumText = "";
                          let realText = "";
                          try {
                            sumText = await summaryResp.data.text();
                          } catch {
                            const url = URL.createObjectURL(
                              summaryResp.data as Blob
                            );
                            sumText = await fetch(url)
                              .then((r) => r.text())
                              .finally(() => URL.revokeObjectURL(url));
                          }
                          try {
                            realText = await realtimeResp.data.text();
                          } catch {
                            const url2 = URL.createObjectURL(
                              realtimeResp.data as Blob
                            );
                            realText = await fetch(url2)
                              .then((r) => r.text())
                              .finally(() => URL.revokeObjectURL(url2));
                          }
                          setPairViewerContent({
                            summary: sumText,
                            realtime: realText,
                          });
                          setPairViewerLoading(false);
                        } else {
                          // Single file view (text or audio)
                          setFileViewer(file);
                          setFileViewerContent(null);
                          if (file.type === "audio") {
                            const resp = await filesApi.getAudio(file.id);
                            // resp.data is a Blob. Ensure it has the right MIME type from headers.
                            let blob = resp.data as Blob;
                            try {
                              const contentType =
                                (resp as any).headers?.["content-type"] || "";
                              if (contentType && blob.type !== contentType) {
                                // Wrap blob in new Blob with explicit content type preserved
                                blob = new Blob([blob], { type: contentType });
                              }
                            } catch (err) {
                              // ignore and fallback to blob as-is
                            }
                            const url = URL.createObjectURL(blob);
                            setFileViewerContent({ audioUrl: url });
                          } else {
                            const resp = await filesApi.getText(file.id);
                            let text = "";
                            try {
                              text = await resp.data.text();
                            } catch {
                              const url = URL.createObjectURL(
                                resp.data as Blob
                              );
                              text = await fetch(url)
                                .then((r) => r.text())
                                .finally(() => URL.revokeObjectURL(url));
                            }
                            setFileViewerContent({ text });
                          }
                        }
                      } catch (err: any) {
                        console.error("Failed to open viewer", err);
                        const status = err?.response?.status;
                        if (status === 429) {
                          toast.error(t("tooManyRequests"));
                        } else {
                          toast.error(t("failedToOpenViewer"));
                        }
                        setPairViewer(null);
                        setPairViewerLoading(false);
                        setFileViewer(null);
                      }
                    }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        {file.type === "audio" ? (
                          <FileAudio className="h-5 w-5 text-blue-500" />
                        ) : (
                          <FileText className="h-5 w-5 text-gray-500" />
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">
                            {file.filename}
                          </span>
                          {/* Owner share indicator moved here */}
                          {(file as any)._ownerShares &&
                            (file as any)._ownerShares.length > 0 && (
                              <div>
                                <button
                                  onClick={() => setOwnerSharesModalFile(file)}
                                  className="text-xs text-white bg-indigo-600 px-2 py-1 rounded"
                                  title={t("sharedWith", {
                                    count: (file as any)._ownerShares.length,
                                  })}
                                >
                                  {t("sharedWith", {
                                    count: (file as any)._ownerShares.length,
                                  })}
                                </button>
                              </div>
                            )}
                          {/* Recipient shared indicator: if this file is shared with the current user */}
                          {(file as any)._share && (
                            <span
                              title={`Shared by ${
                                (file as any)._share.sharedByName ||
                                usersMap[(file as any)._share.sharedById] ||
                                (file as any)._share.sharedById ||
                                t("unknown")
                              }`}
                              className="ml-2 text-xs text-white bg-green-600 px-2 py-1 rounded"
                            >
                              {t("shared")}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatBytes(file.fileSize)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {file.uploadedBy ? (
                        <span className="text-gray-900 font-medium">
                          {file.uploadedBy.fullName || file.uploadedBy.username}
                        </span>
                      ) : (
                        t("na")
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {/* Show auto-delete days or share expiry if present */}
                      {(() => {
                        const auto = (file as any).deleteAfterDays;
                        const share = (file as any)._share;
                        if (share && share.expiresAt) {
                          const expires = new Date(share.expiresAt);
                          const diffDays = Math.ceil(
                            (expires.getTime() - Date.now()) /
                              (24 * 60 * 60 * 1000)
                          );
                          return (
                            <span className="text-sm text-gray-700">
                              {t("days", { count: diffDays })}
                            </span>
                          );
                        }
                        if (auto) {
                          return (
                            <span className="text-sm text-gray-700">
                              {t("days", { count: auto })}
                            </span>
                          );
                        }
                        // If file has no per-file delete setting, show user's/settings auto-delete if available
                        if (
                          settingsAutoDeleteDays !== undefined &&
                          settingsAutoDeleteDays !== null
                        ) {
                          return (
                            <span className="text-sm text-gray-700">
                              {t("days", { count: settingsAutoDeleteDays })}
                            </span>
                          );
                        }
                        return (
                          <span className="text-sm text-gray-400">
                            {t("none")}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(file.uploadedAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleDownload(file)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(file)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        {/* If pair row or text file from android, show Compare action */}
                        {(file as any).isPair ||
                          (file.type === "text" &&
                            (file as any).origin === "android" &&
                            ((file as any).androidSummary ||
                              (file as any).androidRealtime) && (
                              <button
                                onClick={async () => {
                                  try {
                                    // If it's a pair, open split view
                                    if ((file as any).isPair) {
                                      setPairViewer(file);
                                      setPairViewerLoading(true);
                                      setPairViewerContent(null);
                                      const summaryId = (file as any)
                                        .summaryFileId;
                                      const realtimeId = (file as any)
                                        .realtimeFileId;
                                      const [summaryResp, realtimeResp] =
                                        await Promise.all([
                                          filesApi.getText(summaryId),
                                          filesApi.getText(realtimeId),
                                        ]);
                                      let sumText = "";
                                      let realText = "";
                                      try {
                                        sumText = await summaryResp.data.text();
                                      } catch {
                                        const url = URL.createObjectURL(
                                          summaryResp.data as Blob
                                        );
                                        sumText = await fetch(url)
                                          .then((r) => r.text())
                                          .finally(() =>
                                            URL.revokeObjectURL(url)
                                          );
                                      }
                                      try {
                                        realText =
                                          await realtimeResp.data.text();
                                      } catch {
                                        const url2 = URL.createObjectURL(
                                          realtimeResp.data as Blob
                                        );
                                        realText = await fetch(url2)
                                          .then((r) => r.text())
                                          .finally(() =>
                                            URL.revokeObjectURL(url2)
                                          );
                                      }
                                      setPairViewerContent({
                                        summary: sumText,
                                        realtime: realText,
                                      });
                                      setPairViewerLoading(false);
                                      return;
                                    }
                                    setCompareLoading(true);
                                    setCompareFile(file);
                                    setCompareTextContent(null);
                                    // fetch decrypted text content
                                    const resp = await filesApi.getText(
                                      file.id
                                    );
                                    // resp.data is a Blob
                                    let text = "";
                                    try {
                                      text = await resp.data.text();
                                    } catch (err) {
                                      // fallback: create object URL and fetch
                                      const url = window.URL.createObjectURL(
                                        new Blob([resp.data])
                                      );
                                      text = await fetch(url)
                                        .then((r) => r.text())
                                        .finally(() =>
                                          window.URL.revokeObjectURL(url)
                                        );
                                    }
                                    setCompareTextContent(text);
                                    setCompareLoading(false);
                                    // open modal
                                    setCompareFile(file);
                                  } catch (err: any) {
                                    console.error(
                                      "Failed to fetch text for compare",
                                      err
                                    );
                                    if (err?.response?.status === 429) {
                                      toast.error(t("tooManyRequests"));
                                    } else {
                                      toast.error(
                                        t("failedToFetchTextForCompare")
                                      );
                                    }
                                    setCompareLoading(false);
                                    setCompareFile(null);
                                  }
                                }}
                                className="px-3 py-2 text-sm bg-yellow-50 text-yellow-700 rounded"
                              >
                                {t("compare")}
                              </button>
                            ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filteredFiles.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
          />
        )}
      </div>
    </div>
  );
}
