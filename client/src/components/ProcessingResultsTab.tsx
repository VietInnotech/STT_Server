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
} from "lucide-react";
import { filesApi, type ProcessingResultItem, templatesApi } from "../lib/api";
import { useSettingsStore } from "../stores/settings";
import { formatDate } from "../lib/formatters";
import { Pagination } from "./Pagination";
import Modal from "./Modal";
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
      setResultContent({
        summary: res.data.result?.summary || null,
        summaryData: res.data.result?.summaryData || null,
        transcript: res.data.result?.transcript || null,
        liveTranscript: res.data.result?.liveTranscript || null,
        liveTranscriptPairId: res.data.result?.liveTranscriptPairId || null,
        sourceAudioId: res.data.result?.sourceAudioId || null,
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

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          placeholder={t("results.searchPlaceholder")}
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
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

      {/* Results Table */}
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
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("results.result")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("results.template")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("results.tags")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("results.confidence")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("results.duration")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("results.status")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("results.processedAt")}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {results.map((result) => (
                  <tr
                    key={result.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onDoubleClick={() => handleViewResult(result)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-3">
                        <FileText className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                            {result.title || "-"}
                          </div>
                          {result.summaryPreview && (
                            <div className="text-xs text-gray-500 truncate max-w-xs mt-1">
                              {result.summaryPreview}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {result.templateName || result.templateId || "-"}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {result.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                          >
                            {tag}
                          </span>
                        ))}
                        {result.tags.length > 3 && (
                          <span className="text-xs text-gray-500">
                            +{result.tags.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <BarChart3 className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-700">
                          {formatConfidence(result.confidence)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-700">
                          {formatDuration(result.audioDuration)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(
                          result.status
                        )}`}
                      >
                        {getStatusIcon(result.status)}
                        {t(`results.${result.status}`)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        {result.processedAt
                          ? formatDate(result.processedAt)
                          : "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleViewResult(result)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title={t("results.viewResult")}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => handleDeleteResult(result)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title={t("results.deleteResult")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
          setViewingResult(null);
          setResultContent(null);
        }}
        maxWidth="2xl"
        fullHeight
      >
        {viewingResult && (
          <div className="space-y-6 h-full flex flex-col">
            {/* Status Badge */}
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(
                  viewingResult.status
                )}`}
              >
                {getStatusIcon(viewingResult.status)}
                {t(`results.${viewingResult.status}`)}
              </span>
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

                {/* Source Audio Link */}
                {resultContent?.sourceAudioId && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <FileAudio className="h-4 w-4" />
                      <span>{t("results.sourceAudio")}:</span>
                      <code className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                        {resultContent.sourceAudioId}
                      </code>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
