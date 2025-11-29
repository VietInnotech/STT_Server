import React, { useState } from "react";
import { Plus, X, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";

interface CustomFieldManagerProps {
  fields: Record<string, any>;
  onChange: (fields: Record<string, any>) => void;
}

type FieldType = "string" | "array" | "number" | "boolean" | "object";

export function CustomFieldManager({ fields, onChange }: CustomFieldManagerProps) {
  const { t } = useTranslation();
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<FieldType>("string");
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());

  const detectFieldType = (value: any): FieldType => {
    if (Array.isArray(value)) return "array";
    if (typeof value === "number") return "number";
    if (typeof value === "boolean") return "boolean";
    if (typeof value === "object" && value !== null) return "object";
    return "string";
  };

  const getDefaultValue = (type: FieldType): any => {
    switch (type) {
      case "string": return "";
      case "array": return [];
      case "number": return 0;
      case "boolean": return false;
      case "object": return {};
    }
  };

  const handleAddField = () => {
    if (!newFieldName.trim()) return;

    const fieldName = newFieldName.trim();
    if (fields.hasOwnProperty(fieldName)) {
      alert(t("results.fieldAlreadyExists", { defaultValue: "Field already exists" }));
      return;
    }

    onChange({
      ...fields,
      [fieldName]: getDefaultValue(newFieldType),
    });

    setNewFieldName("");
    setNewFieldType("string");
    setShowAddField(false);

    // Auto-expand the newly added field
    setExpandedFields(new Set([...expandedFields, fieldName]));
  };

  const handleRemoveField = (fieldName: string) => {
    const confirmed = confirm(
      t("results.confirmRemoveField", {
        defaultValue: `Remove field "${fieldName}"?`,
        fieldName,
      })
    );
    if (!confirmed) return;

    const newFields = { ...fields };
    delete newFields[fieldName];
    onChange(newFields);

    // Remove from expanded set
    const newExpanded = new Set(expandedFields);
    newExpanded.delete(fieldName);
    setExpandedFields(newExpanded);
  };

  const handleFieldValueChange = (fieldName: string, value: any) => {
    onChange({
      ...fields,
      [fieldName]: value,
    });
  };

  const toggleFieldExpansion = (fieldName: string) => {
    const newExpanded = new Set(expandedFields);
    if (newExpanded.has(fieldName)) {
      newExpanded.delete(fieldName);
    } else {
      newExpanded.add(fieldName);
    }
    setExpandedFields(newExpanded);
  };

  const renderFieldEditor = (fieldName: string, value: any, type: FieldType) => {
    const isExpanded = expandedFields.has(fieldName);

    return (
      <div key={fieldName} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 space-y-3">
        {/* Field Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <button
              type="button"
              onClick={() => toggleFieldExpansion(fieldName)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            <span className="font-medium text-gray-900 dark:text-gray-100">{fieldName}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">({type})</span>
          </div>
          <button
            type="button"
            onClick={() => handleRemoveField(fieldName)}
            className="text-red-500 hover:text-red-700 dark:hover:text-red-400"
            title={t("results.removeField", { defaultValue: "Remove field" })}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Field Value Editor (when expanded) */}
        {isExpanded && (
          <div className="pt-2">
            {type === "string" && (
              <input
                type="text"
                value={value || ""}
                onChange={(e) => handleFieldValueChange(fieldName, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              />
            )}

            {type === "number" && (
              <input
                type="number"
                value={value || 0}
                onChange={(e) => handleFieldValueChange(fieldName, parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              />
            )}

            {type === "boolean" && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={value || false}
                  onChange={(e) => handleFieldValueChange(fieldName, e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {value ? t("results.true", { defaultValue: "True" }) : t("results.false", { defaultValue: "False" })}
                </span>
              </label>
            )}

            {type === "array" && (
              <div className="space-y-2">
                {Array.isArray(value) && value.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => {
                        const newArray = [...value];
                        newArray[index] = e.target.value;
                        handleFieldValueChange(fieldName, newArray);
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newArray = value.filter((_: any, i: number) => i !== index);
                        handleFieldValueChange(fieldName, newArray);
                      }}
                      className="text-red-500 hover:text-red-700 dark:hover:text-red-400"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => handleFieldValueChange(fieldName, [...(value || []), ""])}
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  + {t("results.addArrayItem", { defaultValue: "Add item" })}
                </button>
              </div>
            )}

            {type === "object" && (
              <textarea
                value={JSON.stringify(value, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    handleFieldValueChange(fieldName, parsed);
                  } catch {
                    // Invalid JSON, ignore
                  }
                }}
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              />
            )}
          </div>
        )}
      </div>
    );
  };

  const fieldEntries = Object.entries(fields);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t("results.customFields", { defaultValue: "Custom Fields" })}
        </label>
        <button
          type="button"
          onClick={() => setShowAddField(!showAddField)}
          className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
        >
          <Plus className="h-4 w-4" />
          {t("results.addCustomField", { defaultValue: "Add Field" })}
        </button>
      </div>

      {/* Add Field Form */}
      {showAddField && (
        <div className="border border-blue-300 dark:border-blue-600 rounded-lg p-4 space-y-3 bg-blue-50 dark:bg-blue-900/20">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("results.fieldName", { defaultValue: "Field Name" })}
            </label>
            <input
              type="text"
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              placeholder={t("results.fieldNamePlaceholder", { defaultValue: "e.g., project_name" })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddField();
                }
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("results.fieldType", { defaultValue: "Field Type" })}
            </label>
            <select
              value={newFieldType}
              onChange={(e) => setNewFieldType(e.target.value as FieldType)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
            >
              <option value="string">{t("results.typeString", { defaultValue: "Text" })}</option>
              <option value="array">{t("results.typeArray", { defaultValue: "List" })}</option>
              <option value="number">{t("results.typeNumber", { defaultValue: "Number" })}</option>
              <option value="boolean">{t("results.typeBoolean", { defaultValue: "True/False" })}</option>
              <option value="object">{t("results.typeObject", { defaultValue: "JSON Object" })}</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAddField}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              {t("results.addField", { defaultValue: "Add" })}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddField(false);
                setNewFieldName("");
                setNewFieldType("string");
              }}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors"
            >
              {t("results.cancel", { defaultValue: "Cancel" })}
            </button>
          </div>
        </div>
      )}

      {/* Existing Fields */}
      {fieldEntries.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
          {t("results.noCustomFields", { defaultValue: "No custom fields. Click 'Add Field' to create one." })}
        </div>
      ) : (
        <div className="space-y-2">
          {fieldEntries.map(([fieldName, value]) =>
            renderFieldEditor(fieldName, value, detectFieldType(value))
          )}
        </div>
      )}
    </div>
  );
}
