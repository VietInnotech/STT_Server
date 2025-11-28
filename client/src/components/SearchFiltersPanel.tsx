import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Tag,
  Calendar,
  BarChart3,
  FileText,
  ChevronDown,
  Check,
  Search,
} from "lucide-react";

export interface SearchFilters {
  q: string;
  tags: string[];
  templateId: string;
  fromDate: string;
  toDate: string;
  minConfidence: number | null;
  maxConfidence: number | null;
  status: "pending" | "completed" | "failed" | "all";
  sortBy: "date" | "title" | "confidence" | "duration";
  order: "asc" | "desc";
}

interface TagOption {
  name: string;
  count: number;
}

interface TemplateOption {
  id: string;
  name: string;
}

interface SearchFiltersPanelProps {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
  availableTags: TagOption[];
  availableTemplates: TemplateOption[];
  onTagSearch?: (query: string) => void;
  isLoadingTags?: boolean;
}

export default function SearchFiltersPanel({
  filters,
  onChange,
  availableTags,
  availableTemplates,
  onTagSearch,
  isLoadingTags,
}: SearchFiltersPanelProps) {
  const { t } = useTranslation("files");
  const [tagSearchQuery, setTagSearchQuery] = useState("");
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close tag dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tagDropdownRef.current &&
        !tagDropdownRef.current.contains(event.target as Node) &&
        tagInputRef.current &&
        !tagInputRef.current.contains(event.target as Node)
      ) {
        setShowTagDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced tag search
  useEffect(() => {
    if (!onTagSearch) return;
    const timer = setTimeout(() => {
      onTagSearch(tagSearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [tagSearchQuery, onTagSearch]);

  const handleTagToggle = (tagName: string) => {
    const newTags = filters.tags.includes(tagName)
      ? filters.tags.filter((t) => t !== tagName)
      : [...filters.tags, tagName];
    onChange({ ...filters, tags: newTags });
  };

  const handleRemoveTag = (tagName: string) => {
    onChange({ ...filters, tags: filters.tags.filter((t) => t !== tagName) });
  };

  const handleConfidenceChange = (type: "min" | "max", value: string) => {
    const numValue = value === "" ? null : parseFloat(value) / 100;
    if (type === "min") {
      onChange({ ...filters, minConfidence: numValue });
    } else {
      onChange({ ...filters, maxConfidence: numValue });
    }
  };

  const clearAllFilters = () => {
    onChange({
      q: "",
      tags: [],
      templateId: "",
      fromDate: "",
      toDate: "",
      minConfidence: null,
      maxConfidence: null,
      status: "completed",
      sortBy: "date",
      order: "desc",
    });
  };

  const hasActiveFilters =
    filters.q ||
    filters.tags.length > 0 ||
    filters.templateId ||
    filters.fromDate ||
    filters.toDate ||
    filters.minConfidence !== null ||
    filters.maxConfidence !== null ||
    filters.status !== "completed";

  // Filter tags based on search query for display
  const filteredTags = availableTags.filter((tag) =>
    tag.name.toLowerCase().includes(tagSearchQuery.toLowerCase())
  );

  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-4 border border-gray-200">
      {/* Row 1: Tags and Template */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Multi-select Tags with autocomplete */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
            <Tag className="h-4 w-4" />
            {t("results.filterByTags")}
          </label>

          {/* Selected tags */}
          {filters.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {filters.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-1 hover:text-blue-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Tag search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              ref={tagInputRef}
              type="text"
              value={tagSearchQuery}
              onChange={(e) => setTagSearchQuery(e.target.value)}
              onFocus={() => setShowTagDropdown(true)}
              placeholder={t("results.searchTagsPlaceholder")}
              className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              type="button"
              onClick={() => setShowTagDropdown(!showTagDropdown)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${
                  showTagDropdown ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>

          {/* Tag dropdown */}
          {showTagDropdown && (
            <div
              ref={tagDropdownRef}
              className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-auto"
            >
              {isLoadingTags ? (
                <div className="px-3 py-2 text-sm text-gray-500">
                  {t("loading")}
                </div>
              ) : filteredTags.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500">
                  {t("results.noTagsFound")}
                </div>
              ) : (
                filteredTags.map((tag) => (
                  <button
                    key={tag.name}
                    type="button"
                    onClick={() => {
                      handleTagToggle(tag.name);
                      setTagSearchQuery("");
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 ${
                      filters.tags.includes(tag.name) ? "bg-blue-50" : ""
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {filters.tags.includes(tag.name) && (
                        <Check className="h-4 w-4 text-blue-600" />
                      )}
                      <span
                        className={
                          filters.tags.includes(tag.name)
                            ? "text-blue-700 font-medium"
                            : ""
                        }
                      >
                        {tag.name}
                      </span>
                    </span>
                    <span className="text-gray-400 text-xs">({tag.count})</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Template filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {t("results.filterByTemplate")}
          </label>
          <select
            value={filters.templateId}
            onChange={(e) =>
              onChange({ ...filters, templateId: e.target.value })
            }
            className="w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">{t("results.allTemplates")}</option>
            {availableTemplates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 2: Date range */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {t("results.fromDate")}
          </label>
          <input
            type="date"
            value={filters.fromDate}
            onChange={(e) => onChange({ ...filters, fromDate: e.target.value })}
            className="w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {t("results.toDate")}
          </label>
          <input
            type="date"
            value={filters.toDate}
            onChange={(e) => onChange({ ...filters, toDate: e.target.value })}
            className="w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Row 3: Confidence range and Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Min Confidence */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            {t("results.minConfidence")}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={
                filters.minConfidence !== null ? filters.minConfidence * 100 : 0
              }
              onChange={(e) => handleConfidenceChange("min", e.target.value)}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <span className="text-sm text-gray-600 w-12 text-right">
              {filters.minConfidence !== null
                ? `${Math.round(filters.minConfidence * 100)}%`
                : "0%"}
            </span>
          </div>
        </div>

        {/* Max Confidence */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            {t("results.maxConfidence")}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={
                filters.maxConfidence !== null
                  ? filters.maxConfidence * 100
                  : 100
              }
              onChange={(e) =>
                handleConfidenceChange(
                  "max",
                  e.target.value === "100" ? "" : e.target.value
                )
              }
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <span className="text-sm text-gray-600 w-12 text-right">
              {filters.maxConfidence !== null
                ? `${Math.round(filters.maxConfidence * 100)}%`
                : "100%"}
            </span>
          </div>
        </div>

        {/* Status filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("results.status")}
          </label>
          <select
            value={filters.status}
            onChange={(e) =>
              onChange({
                ...filters,
                status: e.target.value as SearchFilters["status"],
              })
            }
            className="w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">{t("results.statusAll")}</option>
            <option value="completed">{t("results.completed")}</option>
            <option value="pending">{t("results.pending")}</option>
            <option value="failed">{t("results.failed")}</option>
          </select>
        </div>
      </div>

      {/* Row 4: Sort options and clear filters */}
      <div className="flex items-center justify-between pt-4 mt-2 border-t border-gray-200">
        <div className="flex items-center gap-4">
          {/* Sort by */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700">
              {t("results.sortBy")}:
            </label>
            <select
              value={filters.sortBy}
              onChange={(e) =>
                onChange({
                  ...filters,
                  sortBy: e.target.value as SearchFilters["sortBy"],
                })
              }
              className="border border-gray-300 rounded-md shadow-sm px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="date">{t("results.sortDate")}</option>
              <option value="title">{t("results.sortTitle")}</option>
              <option value="confidence">{t("results.sortConfidence")}</option>
              <option value="duration">{t("results.sortDuration")}</option>
            </select>
          </div>

          {/* Order */}
          <div className="flex items-center gap-2">
            <select
              value={filters.order}
              onChange={(e) =>
                onChange({
                  ...filters,
                  order: e.target.value as "asc" | "desc",
                })
              }
              className="border border-gray-300 rounded-md shadow-sm px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="desc">{t("results.orderDesc")}</option>
              <option value="asc">{t("results.orderAsc")}</option>
            </select>
          </div>
        </div>

        {/* Clear filters button */}
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 px-3 py-1 rounded hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
            {t("results.clearFilters")}
          </button>
        )}
      </div>
    </div>
  );
}
