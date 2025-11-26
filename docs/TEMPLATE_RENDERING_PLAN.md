# Template Rendering Improvement Plan

This document outlines a plan to improve how templates are rendered in the frontend, specifically the `example` and `schema_data` fields which are currently displayed as raw JSON.

**Target Users**: Non-technical users who are not familiar with JSON, programming, or data structures.

---

## Current State Analysis

### What We Have Now

The `TemplatesPage.tsx` currently renders template data as follows:

1. **Overview Tab**: Shows description, schema URL, and parameters as raw JSON
2. **Schema Tab**: Displays `schema_data` as raw `JSON.stringify(data, null, 2)`
3. **Prompt Tab**: Shows `prompt_template` as plain preformatted text
4. **Example Tab**: Displays `example` as raw `JSON.stringify(data, null, 2)`

```tsx
// Current example rendering (TemplatesPage.tsx:328-333)
{
  activeTab === "example" && template.example && (
    <div className="bg-gray-50 rounded-lg p-4">
      <pre className="text-sm text-gray-700 overflow-auto max-h-96">
        {JSON.stringify(template.example, null, 2)}
      </pre>
    </div>
  );
}
```

### Problems

1. **Raw JSON is confusing** – Non-technical users don't understand brackets, quotes, colons
2. **No human-readable labels** – Field names are technical identifiers, not friendly labels
3. **No context or descriptions** – Users don't know what each field means
4. **Lists are hard to parse** – Arrays look like code, not readable lists
5. **No visual hierarchy** – Nested data all looks the same
6. **Intimidating for non-programmers** – Looks like "code" rather than "information"

---

## Chosen Solution: Schema-Aware Human-Readable Display (Option C)

Since our users are **non-technical** and unfamiliar with JSON/programming, we will implement a **form-like, human-readable display** that:

- Shows **friendly labels** instead of technical field names
- Displays **descriptions** explaining what each field means
- Renders **lists as bullet points** instead of JSON arrays
- Groups **related fields** in visual sections
- Uses **icons and colors** to indicate field types
- Hides all JSON syntax (no brackets, quotes, colons)

---

## Implementation Plan

### Phase 1: Create Human-Readable Field Renderer

Create `client/src/components/FieldRenderer.tsx`:

A component that renders a single field with its value in a user-friendly way.

```tsx
interface FieldRendererProps {
  label: string; // Human-readable label (from schema title or formatted key)
  description?: string; // Help text explaining the field
  value: unknown; // The actual value to display
  type?: string; // Schema type hint
  icon?: React.ReactNode; // Optional icon for the field type
}
```

**Rendering Rules by Type:**

- **String**: Display as plain text in a styled box
- **Number**: Display with appropriate formatting (decimals, units if known)
- **Boolean**: Show as "Yes" / "No" with checkmark/cross icon
- **Array of strings**: Render as a bullet list
- **Array of objects**: Render as numbered cards
- **Nested object**: Render as a collapsible section with child fields
- **Null/undefined**: Show "Not specified" in gray italic

### Phase 2: Create Schema Parser Utility

Create `client/src/lib/schemaUtils.ts`:

Utilities to extract human-readable information from JSON Schema.

```tsx
interface ParsedField {
  key: string; // Original field name
  label: string; // title or formatted key (e.g., "user_name" → "User Name")
  description: string; // From schema description
  type: string; // string, number, array, object, boolean
  required: boolean; // Is this field required?
  children?: ParsedField[]; // For nested objects
  items?: ParsedField; // For arrays of objects
}

// Convert "snake_case" or "camelCase" to "Title Case"
function formatFieldName(key: string): string;

// Parse a JSON Schema into ParsedField[]
function parseSchema(schema: JSONSchema): ParsedField[];

// Get the value at a path from the example object
function getValueAtPath(example: any, path: string[]): unknown;
```

### Phase 3: Create Template Preview Component

Create `client/src/components/TemplatePreview.tsx`:

The main component that combines schema + example into a beautiful, readable display.

```tsx
interface TemplatePreviewProps {
  schema: Record<string, any>; // JSON Schema
  example: Record<string, any>; // Example data
  title?: string; // Optional section title
}
```

**Layout Structure:**

```
┌─────────────────────────────────────────────────────────┐
│  📋 Example Output                                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Patient Name                                           │
│  ─────────────────────────────────────────────────────  │
│  The name of the patient                                │
│  ┌─────────────────────────────────────────────────┐   │
│  │  John Doe                                        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Age                                                    │
│  ─────────────────────────────────────────────────────  │
│  Patient's age in years                                 │
│  ┌─────────────────────────────────────────────────┐   │
│  │  45                                              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Symptoms                                               │
│  ─────────────────────────────────────────────────────  │
│  List of reported symptoms                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │  • Headache                                      │   │
│  │  • Fever                                         │   │
│  │  • Fatigue                                       │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ▼ Diagnosis Details                                    │
│  ─────────────────────────────────────────────────────  │
│  │                                                      │
│  │  Condition                                           │
│  │  ┌─────────────────────────────────────────────┐    │
│  │  │  Influenza                                   │    │
│  │  └─────────────────────────────────────────────┘    │
│  │                                                      │
│  │  Severity                                            │
│  │  ┌─────────────────────────────────────────────┐    │
│  │  │  Moderate                                    │    │
│  │  └─────────────────────────────────────────────┘    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Phase 4: Create Schema Overview Component

Create `client/src/components/SchemaOverview.tsx`:

For the Schema tab, show a simplified view of what fields the template expects.

```tsx
interface SchemaOverviewProps {
  schema: Record<string, any>;
}
```

**Layout:**

```
┌─────────────────────────────────────────────────────────┐
│  📝 Template Structure                                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  This template generates reports with the following:    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 📝  Patient Name         Text      Required     │   │
│  │     The name of the patient                      │   │
│  ├─────────────────────────────────────────────────┤   │
│  │ 🔢  Age                  Number    Required     │   │
│  │     Patient's age in years                       │   │
│  ├─────────────────────────────────────────────────┤   │
│  │ 📋  Symptoms             List      Required     │   │
│  │     List of reported symptoms                    │   │
│  ├─────────────────────────────────────────────────┤   │
│  │ 📁  Diagnosis Details    Section   Optional     │   │
│  │     Contains: Condition, Severity                │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Phase 5: Update TemplatesPage.tsx

Replace the current raw JSON displays with the new components:

```tsx
// Schema tab - show structure overview
{
  activeTab === "schema" && template.schema_data && (
    <SchemaOverview schema={template.schema_data} />
  );
}

// Example tab - show human-readable preview
{
  activeTab === "example" && template.example && (
    <TemplatePreview
      schema={template.schema_data}
      example={template.example}
      title="Example Output"
    />
  );
}

// Parameters in overview - simplified key-value display
{
  template.parameters && Object.keys(template.parameters).length > 0 && (
    <ParametersList parameters={template.parameters} />
  );
}
```

### Phase 6: Add "View Raw JSON" Toggle (For Admins)

For admin users who need to see the raw data, add a toggle:

```tsx
const [showRawJson, setShowRawJson] = useState(false);

// In the UI
{
  isAdmin && (
    <button onClick={() => setShowRawJson(!showRawJson)}>
      {showRawJson ? "Show Formatted" : "Show Raw JSON"}
    </button>
  );
}

{
  showRawJson ? (
    <pre>{JSON.stringify(data, null, 2)}</pre>
  ) : (
    <TemplatePreview schema={schema} example={example} />
  );
}
```

---

## Component Specifications

### FieldRenderer.tsx

```tsx
// Icons for different field types
const TYPE_ICONS = {
  string: "📝",
  number: "🔢",
  boolean: "✓",
  array: "📋",
  object: "📁",
};

// Human-friendly type names
const TYPE_LABELS = {
  string: "Text",
  number: "Number",
  boolean: "Yes/No",
  array: "List",
  object: "Section",
};

// Render arrays as bullet lists
const ArrayDisplay = ({ items, itemType }) => (
  <ul className="list-disc list-inside space-y-1">
    {items.map((item, i) => (
      <li key={i} className="text-gray-700">
        {typeof item === "object" ? <ObjectCard data={item} /> : String(item)}
      </li>
    ))}
  </ul>
);

// Render booleans as Yes/No with icons
const BooleanDisplay = ({ value }) => (
  <span className={value ? "text-green-600" : "text-gray-500"}>
    {value ? "✓ Yes" : "✗ No"}
  </span>
);

// Main field renderer
const FieldRenderer = ({ label, description, value, type }) => (
  <div className="mb-4">
    <div className="font-medium text-gray-900 mb-1">{label}</div>
    {description && <p className="text-sm text-gray-500 mb-2">{description}</p>}
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <ValueDisplay value={value} type={type} />
    </div>
  </div>
);
```

### schemaUtils.ts

```tsx
// Convert technical field names to human-readable labels
export function formatFieldName(key: string): string {
  return (
    key
      // Split on underscores, hyphens, or camelCase
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]/g, " ")
      // Capitalize each word
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ")
  );
}

// Examples:
// "patient_name" → "Patient Name"
// "symptomsList" → "Symptoms List"
// "diagnosis-details" → "Diagnosis Details"

// Parse schema to extract field metadata
export function parseSchema(schema: any): ParsedField[] {
  if (!schema?.properties) return [];

  const required = schema.required || [];

  return Object.entries(schema.properties).map(
    ([key, prop]: [string, any]) => ({
      key,
      label: prop.title || formatFieldName(key),
      description: prop.description || "",
      type: prop.type || "string",
      required: required.includes(key),
      children: prop.type === "object" ? parseSchema(prop) : undefined,
      items:
        prop.type === "array" && prop.items?.type === "object"
          ? parseSchema(prop.items)
          : undefined,
    })
  );
}
```

### TemplatePreview.tsx

```tsx
const TemplatePreview = ({ schema, example, title }) => {
  const fields = parseSchema(schema);

  return (
    <div className="bg-gray-50 rounded-xl p-6">
      {title && (
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span>📋</span> {title}
        </h3>
      )}

      <div className="space-y-4">
        {fields.map((field) => (
          <FieldRenderer
            key={field.key}
            label={field.label}
            description={field.description}
            value={example?.[field.key]}
            type={field.type}
          />
        ))}
      </div>
    </div>
  );
};
```

### SchemaOverview.tsx

```tsx
const SchemaOverview = ({ schema }) => {
  const fields = parseSchema(schema);

  return (
    <div className="bg-gray-50 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        📝 Template Structure
      </h3>
      <p className="text-gray-600 mb-4">
        This template generates reports with the following fields:
      </p>

      <div className="bg-white rounded-lg border border-gray-200 divide-y">
        {fields.map((field) => (
          <div key={field.key} className="p-4 flex items-start gap-4">
            <span className="text-xl">{TYPE_ICONS[field.type]}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{field.label}</span>
                <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                  {TYPE_LABELS[field.type]}
                </span>
                {field.required && (
                  <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded text-xs">
                    Required
                  </span>
                )}
              </div>
              {field.description && (
                <p className="text-sm text-gray-500 mt-1">
                  {field.description}
                </p>
              )}
              {field.children && (
                <p className="text-sm text-gray-400 mt-1">
                  Contains: {field.children.map((c) => c.label).join(", ")}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

---

## UI/UX Design Principles

### User-Friendly Display Rules

1. **No JSON Syntax Visible**

   - ❌ `{ "name": "John" }`
   - ✅ `Name: John`

2. **Human-Readable Labels**

   - ❌ `patient_symptoms_list`
   - ✅ `Patient Symptoms`

3. **Lists as Bullet Points**

   - ❌ `["Headache", "Fever", "Fatigue"]`
   - ✅
     - Headache
     - Fever
     - Fatigue

4. **Booleans as Yes/No**

   - ❌ `true` / `false`
   - ✅ `✓ Yes` / `✗ No`

5. **Empty Values**

   - ❌ `null` / `undefined`
   - ✅ `Not specified` (in gray italic)

6. **Nested Objects as Sections**
   - ❌ `{ "diagnosis": { "condition": "..." } }`
   - ✅ Collapsible "Diagnosis" section with child fields

### Visual Hierarchy

- **Field Labels**: Bold, dark gray
- **Descriptions**: Small, light gray, below label
- **Values**: Normal weight, in bordered boxes
- **Required Fields**: Red "Required" badge
- **Sections**: Indented with left border, collapsible

### Icons for Field Types

| Type    | Icon | Display Label |
| ------- | ---- | ------------- |
| string  | 📝   | Text          |
| number  | 🔢   | Number        |
| boolean | ✓    | Yes/No        |
| array   | 📋   | List          |
| object  | 📁   | Section       |

### Accessibility

- All interactive elements keyboard accessible
- Proper heading hierarchy
- Sufficient color contrast
- Screen reader friendly labels

---

## File Changes Summary

| File                                        | Action | Description                                        |
| ------------------------------------------- | ------ | -------------------------------------------------- |
| `client/src/components/FieldRenderer.tsx`   | Create | Renders individual fields in human-readable format |
| `client/src/components/TemplatePreview.tsx` | Create | Combines schema + example for full preview         |
| `client/src/components/SchemaOverview.tsx`  | Create | Shows template structure in friendly format        |
| `client/src/lib/schemaUtils.ts`             | Create | Utilities for parsing schema and formatting        |
| `client/src/pages/TemplatesPage.tsx`        | Modify | Integrate new components, add admin raw toggle     |

---

## Estimated Effort

| Task                           | Effort         |
| ------------------------------ | -------------- |
| schemaUtils.ts utilities       | 1-2 hours      |
| FieldRenderer component        | 2-3 hours      |
| TemplatePreview component      | 2-3 hours      |
| SchemaOverview component       | 1-2 hours      |
| Integration into TemplatesPage | 1 hour         |
| Admin "View Raw JSON" toggle   | 30 minutes     |
| Testing & edge cases           | 1-2 hours      |
| **Total**                      | **9-14 hours** |

---

## Example: Before vs After

### Before (Raw JSON)

```json
{
  "patient_name": "John Doe",
  "age": 45,
  "is_critical": false,
  "symptoms": ["Headache", "Fever", "Fatigue"],
  "diagnosis": {
    "condition": "Influenza",
    "severity": "Moderate"
  }
}
```

### After (Human-Readable)

```
┌─────────────────────────────────────────────────────────┐
│  📋 Example Output                                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Patient Name                                           │
│  The full name of the patient                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  John Doe                                        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Age                                                    │
│  Patient's age in years                                 │
│  ┌─────────────────────────────────────────────────┐   │
│  │  45                                              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Is Critical                                            │
│  Whether the patient requires immediate attention       │
│  ┌─────────────────────────────────────────────────┐   │
│  │  ✗ No                                            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Symptoms                                               │
│  List of reported symptoms                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │  • Headache                                      │   │
│  │  • Fever                                         │   │
│  │  • Fatigue                                       │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  📁 Diagnosis                                           │
│  ─────────────────────────────────────────────────────  │
│  │  Condition                                           │
│  │  ┌─────────────────────────────────────────────┐    │
│  │  │  Influenza                                   │    │
│  │  └─────────────────────────────────────────────┘    │
│  │                                                      │
│  │  Severity                                            │
│  │  ┌─────────────────────────────────────────────┐    │
│  │  │  Moderate                                    │    │
│  │  └─────────────────────────────────────────────┘    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Next Steps

1. [ ] Review and approve this plan
2. [ ] Create schemaUtils.ts with parsing utilities
3. [ ] Create FieldRenderer component
4. [ ] Create TemplatePreview component
5. [ ] Create SchemaOverview component
6. [ ] Update TemplatesPage.tsx with new components
7. [ ] Add admin "View Raw JSON" toggle
8. [ ] Test with real template data from MAIE
9. [ ] Gather user feedback

---

## References

- [JSON Schema](https://json-schema.org/) - Schema specification
- [Tailwind CSS](https://tailwindcss.com/) - Styling framework used in project
- MAIE API Documentation - Template structure and examples
