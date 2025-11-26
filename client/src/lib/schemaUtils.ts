/**
 * Schema Parsing Utilities
 *
 * Utilities to extract human-readable information from JSON Schema
 * and format technical field names for non-technical users.
 */

export interface ParsedField {
  key: string;
  label: string;
  description: string;
  type: "string" | "number" | "boolean" | "array" | "object" | "unknown";
  required: boolean;
  children?: ParsedField[];
  itemType?: "string" | "number" | "boolean" | "object" | "unknown";
}

interface JSONSchemaProperty {
  type?: string | string[];
  title?: string;
  description?: string;
  properties?: Record<string, JSONSchemaProperty>;
  items?: JSONSchemaProperty;
  required?: string[];
  enum?: unknown[];
  format?: string;
  default?: unknown;
}

interface JSONSchema {
  type?: string;
  title?: string;
  description?: string;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
}

/**
 * Convert technical field names to human-readable labels.
 * Handles snake_case, camelCase, and kebab-case.
 *
 * @example
 * formatFieldName("patient_name") // "Patient Name"
 * formatFieldName("symptomsList") // "Symptoms List"
 * formatFieldName("diagnosis-details") // "Diagnosis Details"
 */
export function formatFieldName(key: string): string {
  return (
    key
      // Insert space before uppercase letters (camelCase)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      // Replace underscores and hyphens with spaces
      .replace(/[_-]/g, " ")
      // Split and capitalize each word
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ")
      .trim()
  );
}

/**
 * Normalize JSON Schema type to a simple type string.
 */
function normalizeType(
  schemaType: string | string[] | undefined
): ParsedField["type"] {
  if (!schemaType) return "unknown";

  const type = Array.isArray(schemaType) ? schemaType[0] : schemaType;

  switch (type) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      return "array";
    case "object":
      return "object";
    default:
      return "unknown";
  }
}

/**
 * Parse a JSON Schema into an array of ParsedField objects.
 * Extracts human-readable labels, descriptions, and type information.
 */
export function parseSchema(
  schema: JSONSchema | null | undefined
): ParsedField[] {
  if (!schema?.properties) return [];

  const requiredFields = schema.required ?? [];

  return Object.entries(schema.properties).map(([key, prop]) => {
    const type = normalizeType(prop.type);
    const field: ParsedField = {
      key,
      label: prop.title || formatFieldName(key),
      description: prop.description ?? "",
      type,
      required: requiredFields.includes(key),
    };

    // Handle nested objects
    if (type === "object" && prop.properties) {
      field.children = parseSchema({
        properties: prop.properties,
        required: prop.required,
      });
    }

    // Handle arrays
    if (type === "array" && prop.items) {
      const itemType = normalizeType(prop.items.type);
      field.itemType = itemType === "array" ? "unknown" : itemType;

      // If array contains objects, parse their schema
      if (itemType === "object" && prop.items.properties) {
        field.children = parseSchema({
          properties: prop.items.properties,
          required: prop.items.required,
        });
      }
    }

    return field;
  });
}

/**
 * Get a value from a nested object using a key path.
 */
export function getNestedValue(obj: unknown, key: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  if (typeof obj !== "object") return undefined;
  return (obj as Record<string, unknown>)[key];
}

/**
 * Check if a value is considered "empty" for display purposes.
 */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === "object" && Object.keys(value).length === 0) return true;
  return false;
}

/**
 * Get a human-friendly type label for display.
 */
export function getTypeLabel(type: ParsedField["type"]): string {
  const labels: Record<ParsedField["type"], string> = {
    string: "Text",
    number: "Number",
    boolean: "Yes/No",
    array: "List",
    object: "Section",
    unknown: "Data",
  };
  return labels[type];
}

/**
 * Get an emoji icon for a field type.
 */
export function getTypeIcon(type: ParsedField["type"]): string {
  const icons: Record<ParsedField["type"], string> = {
    string: "📝",
    number: "🔢",
    boolean: "✓",
    array: "📋",
    object: "📁",
    unknown: "📄",
  };
  return icons[type];
}
