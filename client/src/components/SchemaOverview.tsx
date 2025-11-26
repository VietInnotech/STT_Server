/**
 * SchemaOverview Component
 *
 * Displays a user-friendly overview of a JSON Schema's structure,
 * showing what fields the template expects without actual values.
 */

import { useTranslation } from "react-i18next";
import {
  parseSchema,
  getTypeLabel,
  type ParsedField,
} from "../lib/schemaUtils";

interface SchemaOverviewProps {
  schema: Record<string, unknown> | null | undefined;
}

/**
 * Renders a single field row in the schema overview table.
 */
function FieldRow({
  field,
  depth = 0,
}: {
  field: ParsedField;
  depth?: number;
}) {
  const { t } = useTranslation(["templates", "common"]);
  const paddingLeft = depth * 16;

  return (
    <>
      <div
        className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors"
        style={{ paddingLeft: `${16 + paddingLeft}px` }}
      >
        {/* Field Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Field Label */}
            <span className="font-medium text-gray-900">{field.label}</span>

            {/* Type Badge */}
            <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
              {getTypeLabel(field.type)}
            </span>

            {/* Required Badge */}
            {field.required && (
              <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded text-xs font-medium">
                {t("common:required")}
              </span>
            )}
          </div>

          {/* Description */}
          {field.description && (
            <p className="text-sm text-gray-500 mt-1">{field.description}</p>
          )}

          {/* Nested Fields Preview */}
          {field.children && field.children.length > 0 && (
            <p className="text-sm text-gray-400 mt-1">
              {t("templates:schema.contains")}{" "}
              {field.children.map((c) => c.label).join(", ")}
            </p>
          )}
        </div>
      </div>

      {/* Render nested children for objects (inline, with indentation) */}
      {field.type === "object" &&
        field.children?.map((child) => (
          <FieldRow key={child.key} field={child} depth={depth + 1} />
        ))}
    </>
  );
}

/**
 * Main SchemaOverview component.
 * Displays a list of all fields in the schema with their types and descriptions.
 */
export default function SchemaOverview({ schema }: SchemaOverviewProps) {
  const { t } = useTranslation(["templates", "common"]);
  const fields = parseSchema(schema as Parameters<typeof parseSchema>[0]);

  if (fields.length === 0) {
    return (
      <div className="text-center text-gray-500 py-4">
        <p>{t("templates:schema.noStructure")}</p>
      </div>
    );
  }

  // Count total fields including nested
  const countFields = (fieldList: ParsedField[]): number => {
    return fieldList.reduce(
      (acc, f) => acc + 1 + (f.children ? countFields(f.children) : 0),
      0
    );
  };
  const totalFields = countFields(fields);
  const requiredCount = fields.filter((f) => f.required).length;

  return (
    <div>
      {/* Header */}
      <h3 className="text-base font-semibold text-gray-900 mb-1">
        {t("templates:schema.structure")}
      </h3>
      <p className="text-gray-600 mb-3 text-sm">
        {t("templates:schema.generatesWith")}
        <span className="font-medium">
          {t("templates:schema.fieldsCount", { count: totalFields })}
        </span>
        {requiredCount > 0 && (
          <span className="text-gray-500">
            {" "}
            ({t("templates:schema.requiredCount", { count: requiredCount })})
          </span>
        )}
      </p>

      {/* Fields Table */}
      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
        {fields.map((field) => (
          <FieldRow key={field.key} field={field} />
        ))}
      </div>
    </div>
  );
}
