import React, { useState, useEffect } from "react";
import { X, Save, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ArrayFieldEditor } from "./ArrayFieldEditor";
import { CustomFieldManager } from "./CustomFieldManager";
import type { ProcessingResultItem } from "../lib/api";

interface EditResultModalProps {
  result: ProcessingResultItem & {
    summary?: string;
    summaryData?: any;
    transcript?: string;
  };
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: EditableResultData) => Promise<void>;
}

export interface EditableResultData {
  title?: string;
  summary?: string;
  transcript?: string;
  summaryData?: any;
  tags?: string[];
}

export function EditResultModal({
  result,
  isOpen,
  onClose,
  onSave,
}: EditResultModalProps) {
  const { t } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Editable fields
  const [title, setTitle] = useState(result.title || "");
  const [summary, setSummary] = useState(result.summary || "");
  const [transcript, setTranscript] = useState(result.transcript || "");
  const [keyTopics, setKeyTopics] = useState<string[]>([]);
  const [actionItems, setActionItems] = useState<string[]>([]);
  const [attendees, setAttendees] = useState<string[]>([]);
  const [decisions, setDecisions] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>(result.tags || []);
  const [customFields, setCustomFields] = useState<any>({});

  // Track which standard fields exist in the result
  const [hasKeyTopics, setHasKeyTopics] = useState(false);
  const [hasActionItems, setHasActionItems] = useState(false);
  const [hasAttendees, setHasAttendees] = useState(false);
  const [hasDecisions, setHasDecisions] = useState(false);

  // Initialize fields from result
  useEffect(() => {
    setTitle(result.title || "");
    setSummary(result.summary || "");
    setTranscript(result.transcript || "");
    setTags(result.tags || []);

    if (result.summaryData) {
      // Only load fields that actually exist in this result
      const hasKT = result.summaryData.hasOwnProperty("key_topics");
      const hasAI = result.summaryData.hasOwnProperty("action_items");
      const hasAtt = result.summaryData.hasOwnProperty("attendees");
      const hasDec = result.summaryData.hasOwnProperty("decisions");

      setHasKeyTopics(hasKT);
      setHasActionItems(hasAI);
      setHasAttendees(hasAtt);
      setHasDecisions(hasDec);

      setKeyTopics(hasKT ? (result.summaryData.key_topics || []) : []);
      setActionItems(hasAI ? (result.summaryData.action_items || []) : []);
      setAttendees(hasAtt ? (result.summaryData.attendees || []) : []);
      setDecisions(hasDec ? (result.summaryData.decisions || []) : []);

      // Extract all other fields (custom fields)
      // Exclude standard fields AND top-level fields that shouldn't be in summaryData
      const knownFields = [
        "key_topics",
        "action_items",
        "attendees",
        "decisions",
        "tags",
        "title",      // Top-level field, not in summaryData
        "summary",    // Top-level field, not in summaryData
        "transcript", // Top-level field, not in summaryData
      ];
      const custom: any = {};
      Object.keys(result.summaryData).forEach((key) => {
        if (!knownFields.includes(key)) {
          custom[key] = result.summaryData[key];
        }
      });
      setCustomFields(custom);
    } else {
      // No summaryData - reset all
      setHasKeyTopics(false);
      setHasActionItems(false);
      setHasAttendees(false);
      setHasDecisions(false);
      setKeyTopics([]);
      setActionItems([]);
      setAttendees([]);
      setDecisions([]);
      setCustomFields({});
    }

    setHasChanges(false);
  }, [result]);

  // Mark changes when any field is modified
  useEffect(() => {
    setHasChanges(true);
  }, [title, summary, transcript, keyTopics, actionItems, attendees, decisions, tags, customFields]);

  const handleClose = () => {
    if (hasChanges) {
      const message = t("results.unsavedChangesWarning", {
        defaultValue: "You have unsaved changes. Are you sure you want to close?",
      });
      if (!confirm(message)) {
        return;
      }
    }
    onClose();
  };

  const handleSave = async () => {
    setIsSaving(true);

    // Build summaryData with all fields including title, summary, transcript
    const summaryData: any = { ...customFields };

    // Add title, summary, transcript to summaryData
    summaryData.title = title;
    summaryData.summary = summary;
    summaryData.transcript = transcript;

    if (hasKeyTopics) {
      summaryData.key_topics = keyTopics;
    }
    if (hasActionItems) {
      summaryData.action_items = actionItems;
    }
    if (hasAttendees) {
      summaryData.attendees = attendees;
    }
    if (hasDecisions) {
      summaryData.decisions = decisions;
    }

    const data: EditableResultData = {
      title,
      summary,
      transcript,
      summaryData,
      tags,
    };

    try {
      await onSave(data);
      setHasChanges(false);
      onClose();
    } catch (error) {
      // Error handled by parent
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {t("results.editResult", { defaultValue: "Edit Result" })}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            disabled={isSaving}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t("results.title", { defaultValue: "Title" })}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
            />
          </div>

          {/* Summary */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t("results.summary", { defaultValue: "Summary" })}
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
            />
          </div>

          {/* Key Topics - only show if exists in result */}
          {hasKeyTopics && (
            <ArrayFieldEditor
              label={t("results.keyTopics", { defaultValue: "Key Topics" })}
              items={keyTopics}
              onChange={setKeyTopics}
              placeholder={t("results.addTopicPlaceholder", {
                defaultValue: "Enter a topic",
              })}
              addButtonText={t("results.addItem", { defaultValue: "Add Item" })}
            />
          )}

          {/* Action Items - only show if exists in result */}
          {hasActionItems && (
            <ArrayFieldEditor
              label={t("results.actionItems", { defaultValue: "Action Items" })}
              items={actionItems}
              onChange={setActionItems}
              placeholder={t("results.addActionPlaceholder", {
                defaultValue: "Enter an action item",
              })}
              addButtonText={t("results.addItem", { defaultValue: "Add Item" })}
            />
          )}

          {/* Attendees - only show if exists in result */}
          {hasAttendees && (
            <ArrayFieldEditor
              label={t("results.attendees", { defaultValue: "Attendees" })}
              items={attendees}
              onChange={setAttendees}
              placeholder={t("results.addAttendeePlaceholder", {
                defaultValue: "Enter attendee name",
              })}
              addButtonText={t("results.addItem", { defaultValue: "Add Item" })}
            />
          )}

          {/* Decisions - only show if exists in result */}
          {hasDecisions && (
            <ArrayFieldEditor
              label={t("results.decisions", { defaultValue: "Decisions" })}
              items={decisions}
              onChange={setDecisions}
              placeholder={t("results.addDecisionPlaceholder", {
                defaultValue: "Enter a decision",
              })}
              addButtonText={t("results.addItem", { defaultValue: "Add Item" })}
            />
          )}

          {/* Tags */}
          <ArrayFieldEditor
            label={t("results.tags", { defaultValue: "Tags" })}
            items={tags}
            onChange={setTags}
            placeholder={t("results.addTagPlaceholder", {
              defaultValue: "Enter a tag",
            })}
            addButtonText={t("results.addTag", { defaultValue: "Add Tag" })}
          />

          {/* Transcript */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t("results.transcript", { defaultValue: "Transcript" })}
            </label>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
            />
          </div>

          {/* Custom Fields Manager */}
          <CustomFieldManager
            fields={customFields}
            onChange={setCustomFields}
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3">
          <button
            onClick={handleClose}
            disabled={isSaving}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("results.cancel", { defaultValue: "Cancel" })}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("results.saving", { defaultValue: "Saving..." })}
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                {t("results.saveChanges", { defaultValue: "Save Changes" })}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
