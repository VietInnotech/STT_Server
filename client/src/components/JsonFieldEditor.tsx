import React, { useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";

interface JsonFieldEditorProps {
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
}

export function JsonFieldEditor({ label, value, onChange }: JsonFieldEditorProps) {
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setJsonText(JSON.stringify(value, null, 2));
      setError(null);
    } catch (err) {
      setError("Invalid JSON value");
    }
  }, [value]);

  const handleChange = (text: string) => {
    setJsonText(text);
    setError(null);

    // Try to parse immediately
    try {
      const parsed = JSON.parse(text);
      onChange(parsed);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleBlur = () => {
    // Pretty-print on blur if valid
    if (!error) {
      try {
        const parsed = JSON.parse(jsonText);
        setJsonText(JSON.stringify(parsed, null, 2));
      } catch {
        // Ignore, error already set
      }
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <textarea
        value={jsonText}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent ${
          error
            ? "border-red-500 dark:border-red-400"
            : "border-gray-300 dark:border-gray-600"
        }`}
        rows={8}
      />
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
