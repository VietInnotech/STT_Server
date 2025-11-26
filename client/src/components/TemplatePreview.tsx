/**
 * TemplatePreview Component
 *
 * Displays template example data in a human-readable format
 * by combining JSON Schema metadata with actual values.
 */

import { useTranslation } from "react-i18next";
import { parseSchema } from "../lib/schemaUtils";
import FieldRenderer from "./FieldRenderer";

interface TemplatePreviewProps {
  schema: Record<string, unknown> | null | undefined;
  example: Record<string, unknown> | null | undefined;
  title?: string;
}

/**
 * Main component that renders a full preview of template example data.
 * Uses the schema to extract field metadata and renders each field
 * with its corresponding value from the example.
 */
export default function TemplatePreview({
  schema,
  example,
  title,
}: TemplatePreviewProps) {
  const { t } = useTranslation("templates");
  // Parse schema to get field metadata
  const fields = parseSchema(schema as Parameters<typeof parseSchema>[0]);

  // If no schema, try to render example keys directly
  const exampleKeys = example ? Object.keys(example) : [];
  const hasSchema = fields.length > 0;

  if (!hasSchema && exampleKeys.length === 0) {
    return (
      <div className="text-center text-gray-500 py-4">
        <p>{t("detail.noExample")}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      {title && (
        <h3 className="text-base font-semibold text-gray-900 mb-3">{title}</h3>
      )}

      {/* Fields */}
      <div className="space-y-4">
        {hasSchema
          ? // Render using schema metadata
            fields.map((field) => (
              <FieldRenderer
                key={field.key}
                field={field}
                value={example?.[field.key]}
              />
            ))
          : // Fallback: render example keys without schema metadata
            exampleKeys.map((key) => (
              <FieldRenderer
                key={key}
                field={{
                  key,
                  label: key
                    .replace(/([a-z])([A-Z])/g, "$1 $2")
                    .replace(/[_-]/g, " ")
                    .split(" ")
                    .map(
                      (w) =>
                        w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
                    )
                    .join(" "),
                  description: "",
                  type: inferType(example?.[key]),
                  required: false,
                }}
                value={example?.[key]}
              />
            ))}
      </div>
    </div>
  );
}

/**
 * Infer the type of a value for fallback rendering when no schema is available.
 */
function inferType(
  value: unknown
): "string" | "number" | "boolean" | "array" | "object" | "unknown" {
  if (value === null || value === undefined) return "unknown";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return "unknown";
}
