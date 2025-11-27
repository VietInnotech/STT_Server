/**
 * FieldRenderer Component
 *
 * Renders a single schema field with its value in a user-friendly format.
 * Handles different data types: strings, numbers, booleans, arrays, and nested objects.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import FormLabel from "./FormLabel";
import type { ParsedField } from "../lib/schemaUtils";
import { isEmpty } from "../lib/schemaUtils";

interface FieldRendererProps {
  field: ParsedField;
  value: unknown;
  depth?: number;
}

/**
 * Renders a string value.
 */
function StringValue({ value }: { value: string }) {
  return <span className="text-gray-800">{value}</span>;
}

/**
 * Renders a number value.
 */
function NumberValue({ value }: { value: number }) {
  // Format numbers with locale-appropriate separators
  const formatted = Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return <span className="text-gray-800 font-medium">{formatted}</span>;
}

/**
 * Renders a boolean value as Yes/No with visual indicator.
 */
function BooleanValue({ value }: { value: boolean }) {
  const { t } = useTranslation("common");
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${
        value ? "text-green-700" : "text-gray-500"
      }`}
    >
      <span
        className={`w-4 h-4 rounded-full flex items-center justify-center text-xs ${
          value ? "bg-green-100" : "bg-gray-100"
        }`}
      >
        {value ? "✓" : "✗"}
      </span>
      {value ? t("yes") : t("no")}
    </span>
  );
}

/**
 * Renders an "empty" or "not specified" placeholder.
 */
function EmptyValue() {
  const { t } = useTranslation("common");
  return <span className="text-gray-400 italic">{t("notSpecified")}</span>;
}

/**
 * Renders an array of primitive values as a bullet list.
 */
function PrimitiveListValue({ items }: { items: unknown[] }) {
  return (
    <ul className="list-disc list-inside space-y-1 text-gray-800">
      {items.map((item, index) => (
        <li key={index}>{String(item)}</li>
      ))}
    </ul>
  );
}

/**
 * Renders an array of objects as numbered cards.
 */
function ObjectListValue({
  items,
  childFields,
}: {
  items: Record<string, unknown>[];
  childFields?: ParsedField[];
}) {
  const { t } = useTranslation("common");
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div
          key={index}
          className="border border-gray-200 rounded-lg overflow-hidden"
        >
          <button
            type="button"
            onClick={() =>
              setExpandedIndex(expandedIndex === index ? null : index)
            }
            className="w-full px-3 py-2 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-left transition-colors"
          >
            <span className="font-medium text-gray-700">
              {t("item")} {index + 1}
              {/* Show a preview of the first field value */}
              {childFields?.[0] && item[childFields[0].key] !== undefined && (
                <span className="ml-2 text-gray-500 font-normal">
                  — {String(item[childFields[0].key]).slice(0, 40)}
                  {String(item[childFields[0].key]).length > 40 ? "..." : ""}
                </span>
              )}
            </span>
            <span className="text-gray-400 text-sm">
              {expandedIndex === index ? "▼" : "▶"}
            </span>
          </button>
          {expandedIndex === index && childFields && (
            <div className="p-3 space-y-3 bg-white">
              {childFields.map((childField) => (
                <FieldRenderer
                  key={childField.key}
                  field={childField}
                  value={item[childField.key]}
                  depth={1}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Renders a nested object as a collapsible section.
 */
function NestedObjectValue({
  value,
  childFields,
  depth,
}: {
  value: Record<string, unknown>;
  childFields?: ParsedField[];
  depth: number;
}) {
  const { t } = useTranslation("common");
  const [isExpanded, setIsExpanded] = useState(depth < 2);

  if (!childFields || childFields.length === 0) {
    // Fallback: render as simple key-value pairs
    return (
      <div className="space-y-2 pl-3 border-l-2 border-gray-200">
        {Object.entries(value).map(([key, val]) => (
          <div key={key}>
            <span className="text-gray-600 text-sm">{key}: </span>
            <span className="text-gray-800">
              {typeof val === "object" ? JSON.stringify(val) : String(val)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-left transition-colors"
      >
        <span className="text-gray-600 text-sm">
          {childFields.length}{" "}
          {childFields.length !== 1 ? t("fields") : t("field")}
        </span>
        <span className="text-gray-400 text-sm">{isExpanded ? "▼" : "▶"}</span>
      </button>
      {isExpanded && (
        <div className="p-3 space-y-3 bg-white">
          {childFields.map((childField) => (
            <FieldRenderer
              key={childField.key}
              field={childField}
              value={value[childField.key]}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Renders the appropriate value component based on type.
 */
function ValueDisplay({
  field,
  value,
  depth,
}: {
  field: ParsedField;
  value: unknown;
  depth: number;
}) {
  if (isEmpty(value)) {
    return <EmptyValue />;
  }

  switch (field.type) {
    case "string":
      return <StringValue value={String(value)} />;

    case "number":
      return <NumberValue value={Number(value)} />;

    case "boolean":
      return <BooleanValue value={Boolean(value)} />;

    case "array": {
      const items = Array.isArray(value) ? value : [];
      if (items.length === 0) return <EmptyValue />;

      // Check if array contains objects
      const hasObjects = items.some(
        (item) =>
          typeof item === "object" && item !== null && !Array.isArray(item)
      );

      if (hasObjects && field.children) {
        return (
          <ObjectListValue
            items={items as Record<string, unknown>[]}
            childFields={field.children}
          />
        );
      }

      return <PrimitiveListValue items={items} />;
    }

    case "object": {
      if (typeof value !== "object" || value === null) {
        return <EmptyValue />;
      }
      return (
        <NestedObjectValue
          value={value as Record<string, unknown>}
          childFields={field.children}
          depth={depth}
        />
      );
    }

    default:
      // Fallback for unknown types
      return <span className="text-gray-700">{String(value)}</span>;
  }
}

/**
 * Main FieldRenderer component.
 * Renders a complete field with label, description, and value.
 */
export default function FieldRenderer({
  field,
  value,
  depth = 0,
}: FieldRendererProps) {
  return (
    <div className={`${depth > 0 ? "pl-2" : ""}`}>
      {/* Field Label */}
      <div className="mb-1">
        <FormLabel required={!!field.required}>
          <span className="font-medium text-gray-900">{field.label}</span>
        </FormLabel>
      </div>

      {/* Field Description */}
      {field.description && (
        <p className="text-sm text-gray-500 mb-2">{field.description}</p>
      )}

      {/* Field Value */}
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <ValueDisplay field={field} value={value} depth={depth} />
      </div>
    </div>
  );
}
