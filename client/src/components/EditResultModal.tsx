import { useState, useEffect } from "react";
import { Save, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ArrayFieldEditor } from "./ArrayFieldEditor";
import { CustomFieldManager } from "./CustomFieldManager";
import Modal from "./Modal";
import FormLabel from "./FormLabel";
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
  const { t } = useTranslation("files");
  const { t: tCommon } = useTranslation("common");
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

      setKeyTopics(hasKT ? result.summaryData.key_topics || [] : []);
      setActionItems(hasAI ? result.summaryData.action_items || [] : []);
      setAttendees(hasAtt ? result.summaryData.attendees || [] : []);
      setDecisions(hasDec ? result.summaryData.decisions || [] : []);

      // Extract all other fields (custom fields)
      // Exclude standard fields AND top-level fields that shouldn't be in summaryData
      const knownFields = [
        "key_topics",
        "action_items",
        "attendees",
        "decisions",
        "tags",
        "title", // Top-level field, not in summaryData
        "summary", // Top-level field, not in summaryData
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
  }, [
    title,
    summary,
    transcript,
    keyTopics,
    actionItems,
    attendees,
    decisions,
    tags,
    customFields,
  ]);

  const handleClose = () => {
    if (hasChanges) {
      const message = t("results.unsavedChangesWarning");
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

  return (
    <Modal
      title={t("results.editResult")}
      open={isOpen}
      onClose={handleClose}
      maxWidth="2xl"
      footer={
        <div className="flex gap-3">
          <button
            onClick={handleClose}
            disabled={isSaving}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {tCommon("cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("results.saving")}
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                {t("results.saveChanges")}
              </>
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Title */}
        <div>
          <FormLabel>{t("results.titleLabel")}</FormLabel>
          <div className="border border-gray-300 rounded-lg overflow-hidden">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
              placeholder={t("results.titleLabel")}
            />
          </div>
        </div>

        {/* Summary */}
        <div>
          <FormLabel>{t("summary")}</FormLabel>
          <div className="border border-gray-300 rounded-lg overflow-hidden">
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset resize-none"
            />
          </div>
        </div>

        {/* Key Topics - only show if exists in result */}
        {hasKeyTopics && (
          <ArrayFieldEditor
            label={t("results.keyTopics")}
            items={keyTopics}
            onChange={setKeyTopics}
            placeholder={t("results.addTopicPlaceholder")}
            addButtonText={t("results.addItem")}
          />
        )}

        {/* Action Items - only show if exists in result */}
        {hasActionItems && (
          <ArrayFieldEditor
            label={t("results.actionItems")}
            items={actionItems}
            onChange={setActionItems}
            placeholder={t("results.addActionPlaceholder")}
            addButtonText={t("results.addItem")}
          />
        )}

        {/* Attendees - only show if exists in result */}
        {hasAttendees && (
          <ArrayFieldEditor
            label={t("results.attendees")}
            items={attendees}
            onChange={setAttendees}
            placeholder={t("results.addAttendeePlaceholder")}
            addButtonText={t("results.addItem")}
          />
        )}

        {/* Decisions - only show if exists in result */}
        {hasDecisions && (
          <ArrayFieldEditor
            label={t("results.decisions")}
            items={decisions}
            onChange={setDecisions}
            placeholder={t("results.addDecisionPlaceholder")}
            addButtonText={t("results.addItem")}
          />
        )}

        {/* Tags */}
        <ArrayFieldEditor
          label={t("results.tags")}
          items={tags}
          onChange={setTags}
          placeholder={t("results.addTagPlaceholder")}
          addButtonText={t("results.addTag")}
        />

        {/* Transcript */}
        <div>
          <FormLabel>{t("results.transcript")}</FormLabel>
          <div className="border border-gray-300 rounded-lg overflow-hidden">
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset font-mono text-sm resize-none"
            />
          </div>
        </div>

        {/* Custom Fields Manager */}
        <CustomFieldManager fields={customFields} onChange={setCustomFields} />
      </div>
    </Modal>
  );
}
