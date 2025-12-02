import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  Loader2,
  RefreshCw,
  Trash2,
  Eye,
  Tag,
  Calendar,
  FileText,
  Clock,
  BarChart3,
  Filter,
  CheckCircle,
  XCircle,
  AlertCircle,
  X,
  Mic,
  FileAudio,
  Edit,
  Download,
  ChevronDown,
  List,
  LayoutGrid,
} from "lucide-react";
import { filesApi, type ProcessingResultItem, type SourceAudioInfo, templatesApi } from "../lib/api";
import { useSettingsStore } from "../stores/settings";
import { formatDate } from "../lib/formatters";
import { Pagination } from "./Pagination";
import Modal from "./Modal";
import { EditResultModal, type EditableResultData } from "./EditResultModal";
import toast from "react-hot-toast";
import { usePermission } from "../hooks/usePermission";
import { PERMISSIONS } from "../lib/permissions";
import SearchFiltersPanel, { type SearchFilters } from "./SearchFiltersPanel";

// Fields to skip when dynamically rendering summaryData (already shown elsewhere or internal)
const SKIP_FIELDS = new Set(["title", "content"]);

// Format field name for display: "key_topics" -> "Key Topics"
function formatFieldName(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Render a single value (handles strings, arrays, objects)
function renderValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    return <span>{value}</span>;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return <span>{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return null;

    // Check if all items are strings (render as list)
    const allStrings = value.every((v) => typeof v === "string");
    if (allStrings) {
      return (
        <ul className="list-disc list-inside space-y-1 text-gray-600">
          {value.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      );
    }

    // Mixed or object array - render each item
    return (
      <ul className="space-y-2">
        {value.map((item, idx) => (
          <li key={idx} className="flex items-start gap-2 text-gray-600">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0"></span>
            <span>
              {typeof item === "string" ? item : JSON.stringify(item, null, 2)}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === "object") {
    // Render nested object as formatted JSON
    return (
      <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  return <span>{String(value)}</span>;
}

// Dynamic component to render all fields from summaryData
function SummaryDataSection({
  data,
  t,
}: {
  data: Record<string, unknown>;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  // Get all keys except the ones we skip
  const fields = Object.entries(data).filter(
    ([key, value]) =>
      !SKIP_FIELDS.has(key) && value !== null && value !== undefined
  );

  if (fields.length === 0) return null;

  return (
    <>
      {fields.map(([key, value]) => {
        // Skip empty arrays
        if (Array.isArray(value) && value.length === 0) return null;

        // Try to get translated label, fallback to formatted key name
        const translationKey = `results.${key.replace(/_([a-z])/g, (_, c) =>
          c.toUpperCase()
        )}`;
        const label =
          t(translationKey, { defaultValue: "" }) || formatFieldName(key);

        return (
          <div key={key} className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-semibold text-gray-800 mb-2">
              {label}
            </h4>
            {renderValue(value)}
          </div>
        );
      })}
    </>
  );
}

export default function ProcessingResultsTab() {
  const { t } = useTranslation("files");
  const itemsPerPage = useSettingsStore((s) => s.itemsPerPage);
  const resultsViewMode = useSettingsStore((s) => s.resultsViewMode);
  const setResultsViewMode = useSettingsStore((s) => s.setResultsViewMode);
  const { can } = usePermission();
  const canDelete = can(PERMISSIONS.FILES_DELETE);

  const [currentPage, setCurrentPage] = useState(1);
  const [results, setResults] = useState<ProcessingResultItem[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [loading, setLoading] = useState(false);
  const [viewingResult, setViewingResult] =
    useState<ProcessingResultItem | null>(null);
  const [resultContent, setResultContent] = useState<{
    summary: string | null;
    summaryData: {
      title?: string;
      summary?: string;
      content?: string;
      attendees?: string[];
      decisions?: string[];
      action_items?: string[];
      key_topics?: string[];
      tags?: string[];
      [key: string]: unknown;
    } | null;
    transcript: string | null;
    liveTranscript: string | null;
    liveTranscriptPairId: string | null;
    sourceAudioId: string | null;
    sourceAudio: SourceAudioInfo | null;
    sourceAudioUrl: string | null;
  } | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "summary" | "transcript" | "liveTranscript"
  >("summary");

  // Filter state with enhanced filters
  const [filters, setFilters] = useState<SearchFilters>({
    q: "",
    tags: [],
    templateId: "",
    fromDate: "",
    toDate: "",
    minConfidence: null,
    maxConfidence: null,
    status: "all",
    sortBy: "date",
    order: "desc",
  });
  const [showFilters, setShowFilters] = useState(false);
  const [loadingTags, setLoadingTags] = useState(false);

  // Edit and Export state
  const [editingResult, setEditingResult] = useState<
    | (ProcessingResultItem & {
        summary?: string;
        summaryData?: any;
        transcript?: string;
      })
    | null
  >(null);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Tags and templates for filters
  const [availableTags, setAvailableTags] = useState<
    Array<{ name: string; count: number }>
  >([]);
  const [availableTemplates, setAvailableTemplates] = useState<
    Array<{ id: string; name: string }>
  >([]);

  // Reset to page 1 when itemsPerPage or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [itemsPerPage, filters]);

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showExportMenu) {
        setShowExportMenu(false);
      }
    };

    if (showExportMenu) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [showExportMenu]);

  // Fetch available tags for filter dropdown with optional search query
  const fetchTags = useCallback(async (query?: string) => {
    setLoadingTags(true);
    try {
      const res = await filesApi.getTags({ limit: 50, q: query });
      setAvailableTags(res.data.tags || []);
    } catch (err) {
      console.error("Failed to fetch tags", err);
    } finally {
      setLoadingTags(false);
    }
  }, []);

  // Fetch available templates for filter dropdown
  const fetchTemplates = useCallback(async () => {
    try {
      const res = await templatesApi.list();
      setAvailableTemplates(
        (res.data.templates || []).map((t) => ({ id: t.id, name: t.name }))
      );
    } catch (err) {
      console.error("Failed to fetch templates", err);
    }
  }, []);

  // Fetch results with enhanced filters
  const fetchResults = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (currentPage - 1) * itemsPerPage;
      const params: Record<string, string | number | undefined> = {
        limit: itemsPerPage,
        offset,
        sortBy: filters.sortBy,
        order: filters.order,
        status: filters.status,
      };
      if (filters.q.trim()) params.q = filters.q.trim();
      if (filters.tags.length > 0) params.tags = filters.tags.join(",");
      if (filters.templateId) params.templateId = filters.templateId;
      if (filters.fromDate) params.fromDate = filters.fromDate;
      if (filters.toDate) params.toDate = filters.toDate;
      if (filters.minConfidence !== null)
        params.minConfidence = filters.minConfidence;
      if (filters.maxConfidence !== null)
        params.maxConfidence = filters.maxConfidence;

      const res = await filesApi.searchResults(params);
      setResults(res.data.results || []);
      setTotalResults(res.data.pagination?.total || 0);
    } catch (err) {
      toast.error(t("results.failedToFetchResults"));
      console.error("Failed to fetch results", err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, filters, t]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  useEffect(() => {
    fetchTags();
    fetchTemplates();
  }, [fetchTags, fetchTemplates]);

  // View result details
  const handleViewResult = async (result: ProcessingResultItem) => {
    setViewingResult(result);
    setLoadingContent(true);
    setResultContent(null);
    setActiveTab("summary"); // Reset to summary tab
    try {
      const res = await filesApi.getResult(result.id);
      
      // Fetch source audio blob if available
      let sourceAudioUrl: string | null = null;
      if (res.data.result?.sourceAudioId) {
        try {
          const audioResp = await filesApi.getAudio(res.data.result.sourceAudioId);
          let blob = audioResp.data as Blob;
          try {
            const contentType = (audioResp as any).headers?.["content-type"] || "";
            if (contentType && blob.type !== contentType) {
              blob = new Blob([blob], { type: contentType });
            }
          } catch {
            // Ignore and use blob as-is
          }
          sourceAudioUrl = URL.createObjectURL(blob);
        } catch (err) {
          logger.error("Failed to load source audio", err);
        }
      }
      
      setResultContent({
        summary: res.data.result?.summary || null,
        summaryData: res.data.result?.summaryData || null,
        transcript: res.data.result?.transcript || null,
        liveTranscript: res.data.result?.liveTranscript || null,
        liveTranscriptPairId: res.data.result?.liveTranscriptPairId || null,
        sourceAudioId: res.data.result?.sourceAudioId || null,
        sourceAudio: res.data.result?.sourceAudio || null,
        sourceAudioUrl,
      });
    } catch (err) {
      console.error("Failed to fetch result content", err);
      toast.error(t("results.failedToFetchResults"));
    } finally {
      setLoadingContent(false);
    }
  };

  // Delete result
  const handleDeleteResult = async (result: ProcessingResultItem) => {
    if (!confirm(t("results.confirmDeleteResult"))) return;
    try {
      await filesApi.deleteResult(result.id);
      toast.success(t("results.resultDeleted"));
      fetchResults();
    } catch (err) {
      toast.error(t("results.failedToDeleteResult"));
      console.error("Failed to delete result", err);
    }
  };

  // Edit result
  const handleEditClick = () => {
    if (!viewingResult || !resultContent) return;

    // Combine viewingResult with loaded content
    const editableResult = {
      ...viewingResult,
      summary: resultContent.summary || "",
      summaryData: resultContent.summaryData || {},
      transcript: resultContent.transcript || "",
    };

    setEditingResult(editableResult);
  };

  const handleSaveEdit = async (data: EditableResultData) => {
    if (!editingResult) return;

    try {
      await filesApi.updateResult(editingResult.id, data);
      toast.success(
        t("results.updateSuccess", {
          defaultValue: "Result updated successfully",
        })
      );

      // Refresh the result list and close edit modal
      await fetchResults();
      setEditingResult(null);

      // If the detail modal is still open, refresh its content
      if (viewingResult?.id === editingResult.id) {
        await handleViewClick(viewingResult);
      }
    } catch (err) {
      toast.error(
        t("results.updateFailed", { defaultValue: "Failed to update result" })
      );
      console.error("Failed to update result", err);
      throw err;
    }
  };

  // Export result
  const handleExport = async (format: "markdown" | "word" | "pdf") => {
    if (!viewingResult) return;

    try {
      setIsExporting(format);
      setShowExportMenu(false);

      const exportFn = {
        markdown: filesApi.exportResultMarkdown,
        word: filesApi.exportResultWord,
        pdf: filesApi.exportResultPdf,
      }[format];

      const res = await exportFn(viewingResult.id);

      // Create download link
      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${viewingResult.title || "result"}.${
        { markdown: "md", word: "docx", pdf: "pdf" }[format]
      }`;
      link.click();

      setTimeout(() => URL.revokeObjectURL(url), 100);

      const successMsg = t(
        `results.export${
          format.charAt(0).toUpperCase() + format.slice(1)
        }Success`,
        {
          defaultValue: `${format.toUpperCase()} file exported successfully`,
        }
      );
      toast.success(successMsg);
    } catch (err) {
      toast.error(
        t("results.exportFailed", { defaultValue: "Failed to export file" })
      );
      console.error("Failed to export result", err);
    } finally {
      setIsExporting(null);
    }
  };

  const hasActiveFilters =
    filters.q ||
    filters.tags.length > 0 ||
    filters.templateId ||
    filters.fromDate ||
    filters.toDate ||
    filters.minConfidence !== null ||
    filters.maxConfidence !== null ||
    filters.status !== "all";

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "pending":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return null;
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds === null || seconds === undefined) return "-";
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const formatConfidence = (confidence: number | null) => {
    if (confidence === null || confidence === undefined) return "-";
    return `${(confidence * 100).toFixed(0)}%`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {t("results.title")}
          </h3>
          <p className="text-sm text-gray-500">{t("results.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              showFilters || hasActiveFilters
                ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <Filter className="h-4 w-4" />
            {t("results.advancedFilters")}
            {hasActiveFilters && (
              <span className="ml-1 w-2 h-2 bg-blue-500 rounded-full"></span>
            )}
          </button>
          <button
            onClick={() => fetchResults()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
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

      {/* Search bar with view toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder={t("results.searchPlaceholder")}
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {/* View toggle button */}
        <button
          onClick={() =>
            setResultsViewMode(resultsViewMode === "list" ? "card" : "list")
          }
          className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          title={resultsViewMode === "list" ? t("viewCards") : t("viewList")}
        >
          {resultsViewMode === "list" ? (
            <LayoutGrid className="h-5 w-5" />
          ) : (
            <List className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Active filter badges (when filters panel is closed) */}
      {!showFilters && hasActiveFilters && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-gray-500">
            {t("results.activeFilters")}:
          </span>
          {filters.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
            >
              <Tag className="h-3 w-3 mr-1" />
              {tag}
              <button
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    tags: f.tags.filter((t) => t !== tag),
                  }))
                }
                className="ml-1 hover:text-blue-600"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {filters.templateId && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
              <FileText className="h-3 w-3 mr-1" />
              {availableTemplates.find((t) => t.id === filters.templateId)
                ?.name || filters.templateId}
              <button
                onClick={() => setFilters((f) => ({ ...f, templateId: "" }))}
                className="ml-1 hover:text-purple-600"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {(filters.fromDate || filters.toDate) && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
              <Calendar className="h-3 w-3 mr-1" />
              {filters.fromDate || "..."} - {filters.toDate || "..."}
              <button
                onClick={() =>
                  setFilters((f) => ({ ...f, fromDate: "", toDate: "" }))
                }
                className="ml-1 hover:text-green-600"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {(filters.minConfidence !== null ||
            filters.maxConfidence !== null) && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
              <BarChart3 className="h-3 w-3 mr-1" />
              {filters.minConfidence !== null
                ? `${Math.round(filters.minConfidence * 100)}%`
                : "0%"}
              {" - "}
              {filters.maxConfidence !== null
                ? `${Math.round(filters.maxConfidence * 100)}%`
                : "100%"}
              <button
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    minConfidence: null,
                    maxConfidence: null,
                  }))
                }
                className="ml-1 hover:text-orange-600"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {filters.status !== "all" && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              {t(`results.${filters.status}`)}
              <button
                onClick={() => setFilters((f) => ({ ...f, status: "all" }))}
                className="ml-1 hover:text-gray-600"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Filter panel */}
      {showFilters && (
        <SearchFiltersPanel
          filters={filters}
          onChange={setFilters}
          availableTags={availableTags}
          availableTemplates={availableTemplates}
          onTagSearch={fetchTags}
          isLoadingTags={loadingTags}
        />
      )}

      {/* Results Display */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>{t("results.noResults")}</p>
            <p className="text-sm mt-2">{t("results.noResultsHint")}</p>
          </div>
        ) : resultsViewMode === "list" ? (
          /* ===== LIST VIEW ===== */
          <div className="divide-y divide-gray-100">
            {results.map((result) => (
              <div
                key={result.id}
                className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer group"
                onDoubleClick={() => handleViewResult(result)}
              >
                {/* Icon and Title - main content */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {result.title || "-"}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                      <span className="truncate max-w-[200px]">
                        {result.templateName || result.templateId || "-"}
                      </span>
                      {result.tags.length > 0 && (
                        <span className="hidden sm:inline-flex items-center gap-1">
                          <Tag className="h-3 w-3" />
                          {result.tags.length}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Badge */}
                <span
                  className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(
                    result.status
                  )}`}
                >
                  {getStatusIcon(result.status)}
                  <span className="hidden md:inline">
                    {t(`results.${result.status}`)}
                  </span>
                </span>

                {/* Confidence */}
                <div className="hidden md:flex items-center gap-1 text-xs text-gray-500 w-16">
                  <BarChart3 className="h-3.5 w-3.5" />
                  {formatConfidence(result.confidence)}
                </div>

                {/* Duration */}
                <div className="hidden lg:flex items-center gap-1 text-xs text-gray-500 w-16">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDuration(result.audioDuration)}
                </div>

                {/* Date */}
                <div className="hidden lg:block text-xs text-gray-500 w-24">
                  {result.processedAt ? formatDate(result.processedAt) : "-"}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewResult(result);
                    }}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                    title={t("results.viewResult")}
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  {canDelete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteResult(result);
                      }}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title={t("results.deleteResult")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ===== CARD VIEW ===== */
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {results.map((result) => (
              <div
                key={result.id}
                className="bg-white border border-gray-200 rounded-xl hover:shadow-md hover:border-gray-300 transition-all cursor-pointer group"
                onDoubleClick={() => handleViewResult(result)}
              >
                {/* Card Header */}
                <div className="p-4 border-b border-gray-100">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">
                        {result.title || "-"}
                      </h3>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {result.templateName || result.templateId || "-"}
                      </p>
                    </div>
                    <span
                      className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(
                        result.status
                      )}`}
                    >
                      {getStatusIcon(result.status)}
                    </span>
                  </div>

                  {/* Summary Preview */}
                  {result.summaryPreview && (
                    <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                      {result.summaryPreview}
                    </p>
                  )}
                </div>

                {/* Card Body - Metadata */}
                <div className="px-4 py-3 space-y-2">
                  {/* Tags */}
                  {result.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {result.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700"
                        >
                          {tag}
                        </span>
                      ))}
                      {result.tags.length > 3 && (
                        <span className="text-xs text-gray-400">
                          +{result.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Stats Row */}
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <BarChart3 className="h-3.5 w-3.5" />
                        {formatConfidence(result.confidence)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDuration(result.audioDuration)}
                      </span>
                    </div>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {result.processedAt
                        ? formatDate(result.processedAt)
                        : "-"}
                    </span>
                  </div>
                </div>

                {/* Card Footer - Actions */}
                <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewResult(result);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {t("results.viewResult")}
                  </button>
                  {canDelete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteResult(result);
                      }}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title={t("results.deleteResult")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && results.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalItems={totalResults}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
          />
        )}
      </div>

      {/* Result Detail Modal */}
      <Modal
        title={viewingResult?.title || t("results.viewResult")}
        open={!!viewingResult}
        onClose={() => {
          // Cleanup Object URL to prevent memory leaks
          if (resultContent?.sourceAudioUrl) {
            URL.revokeObjectURL(resultContent.sourceAudioUrl);
          }
          setViewingResult(null);
          setResultContent(null);
        }}
        maxWidth="2xl"
        fullHeight
      >
        {viewingResult && (
          <div className="space-y-6 h-full flex flex-col">
            {/* Status Badge & Actions */}
            <div className="flex items-center justify-between gap-2">
              <span
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(
                  viewingResult.status
                )}`}
              >
                {getStatusIcon(viewingResult.status)}
                {t(`results.${viewingResult.status}`)}
              </span>

              {/* Edit and Export Buttons */}
              <div className="flex items-center gap-2">
                {/* Edit Button */}
                {!loadingContent && resultContent && (
                  <button
                    onClick={handleEditClick}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Edit className="h-4 w-4" />
                    {t("results.edit", { defaultValue: "Edit" })}
                  </button>
                )}

                {/* Export Dropdown */}
                {!loadingContent && resultContent && (
                  <div className="relative">
                    <button
                      onClick={() => setShowExportMenu(!showExportMenu)}
                      disabled={!!isExporting}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isExporting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t("results.exporting", {
                            defaultValue: "Exporting...",
                          })}
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4" />
                          {t("results.export", { defaultValue: "Export" })}
                          <ChevronDown className="h-4 w-4" />
                        </>
                      )}
                    </button>

                    {/* Export Dropdown Menu */}
                    {showExportMenu && (
                      <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                        <button
                          onClick={() => handleExport("markdown")}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 first:rounded-t-lg"
                        >
                          {t("results.exportMarkdown", {
                            defaultValue: "Download as Markdown",
                          })}
                        </button>
                        <button
                          onClick={() => handleExport("word")}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                        >
                          {t("results.exportWord", {
                            defaultValue: "Download as Word",
                          })}
                        </button>
                        <button
                          onClick={() => handleExport("pdf")}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 last:rounded-b-lg"
                        >
                          {t("results.exportPdf", {
                            defaultValue: "Download as PDF",
                          })}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-500">{t("results.template")}:</span>
                <span className="ml-2 font-medium">
                  {viewingResult.templateName ||
                    viewingResult.templateId ||
                    "-"}
                </span>
              </div>
              <div>
                <span className="text-gray-500">
                  {t("results.confidence")}:
                </span>
                <span className="ml-2 font-medium">
                  {formatConfidence(viewingResult.confidence)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">
                  {t("results.audioDuration")}:
                </span>
                <span className="ml-2 font-medium">
                  {formatDuration(viewingResult.audioDuration)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">
                  {t("results.processingTime")}:
                </span>
                <span className="ml-2 font-medium">
                  {formatDuration(viewingResult.processingTime)}
                </span>
              </div>
            </div>

            {/* Tags */}
            {viewingResult.tags.length > 0 && (
              <div>
                <span className="text-sm text-gray-500">
                  {t("results.tags")}:
                </span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {viewingResult.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Content */}
            {loadingContent ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              </div>
            ) : (
              <div className="flex flex-col flex-1 min-h-0">
                {/* Tabs */}
                <div className="flex border-b border-gray-200 mb-4">
                  <button
                    onClick={() => setActiveTab("summary")}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === "summary"
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {t("summary")}
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab("transcript")}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === "transcript"
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <FileAudio className="h-4 w-4" />
                      {t("results.transcript")}
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab("liveTranscript")}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === "liveTranscript"
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    } ${!resultContent?.liveTranscript ? "opacity-50" : ""}`}
                    disabled={!resultContent?.liveTranscript}
                    title={
                      !resultContent?.liveTranscript
                        ? t("results.noLiveTranscript")
                        : ""
                    }
                  >
                    <div className="flex items-center gap-2">
                      <Mic className="h-4 w-4" />
                      {t("results.liveTranscript")}
                      {resultContent?.liveTranscript && (
                        <span className="ml-1 w-2 h-2 bg-green-500 rounded-full"></span>
                      )}
                    </div>
                  </button>
                </div>

                {/* Tab Content */}
                <div className="flex-1 bg-gray-50 rounded-lg p-4 overflow-auto text-sm text-gray-700">
                  {activeTab === "summary" && (
                    <div className="space-y-6">
                      {/* Dynamic fields from summaryData (includes summary as first field) */}
                      {resultContent?.summaryData ? (
                        <SummaryDataSection
                          data={resultContent.summaryData}
                          t={t}
                        />
                      ) : (
                        <div className="whitespace-pre-wrap">
                          {t("noContent")}
                        </div>
                      )}
                    </div>
                  )}
                  {activeTab === "transcript" && (
                    <div className="whitespace-pre-wrap">
                      {resultContent?.transcript || t("results.noTranscript")}
                    </div>
                  )}
                  {activeTab === "liveTranscript" && (
                    <div className="whitespace-pre-wrap">
                      {resultContent?.liveTranscript ||
                        t("results.noLiveTranscript")}
                    </div>
                  )}
                </div>

                {/* Source Audio Player */}
                {resultContent?.sourceAudioId && resultContent?.sourceAudio && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">
                      {t("results.sourceAudio")}
                    </h4>
                    <audio
                      controls
                      className="w-full mb-2"
                      preload="metadata"
                    >
                      <source
                        src={resultContent.sourceAudioUrl || undefined}
                        type={resultContent.sourceAudio.mimeType || "audio/wav"}
                      />
                      {t("audioNotSupported")}
                    </audio>
                    <div className="text-xs text-gray-500 space-y-1">
                      <p>{t("filename")}: {resultContent.sourceAudio.filename}</p>
                      <p>{t("size")}: {(resultContent.sourceAudio.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Edit Result Modal */}
      {editingResult && (
        <EditResultModal
          result={editingResult}
          isOpen={!!editingResult}
          onClose={() => setEditingResult(null)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
}
