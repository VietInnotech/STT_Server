import React, { useState } from "react";
import { ChevronUp, ChevronDown, X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ArrayFieldEditorProps {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  addButtonText?: string;
}

export function ArrayFieldEditor({
  label,
  items,
  onChange,
  placeholder = "Enter item",
  addButtonText = "Add Item",
}: ArrayFieldEditorProps) {
  const { t } = useTranslation();
  const [newItem, setNewItem] = useState("");

  const handleAdd = () => {
    if (newItem.trim()) {
      onChange([...items, newItem.trim()]);
      setNewItem("");
    }
  };

  const handleRemove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newItems = [...items];
    [newItems[index - 1], newItems[index]] = [
      newItems[index],
      newItems[index - 1],
    ];
    onChange(newItems);
  };

  const handleMoveDown = (index: number) => {
    if (index === items.length - 1) return;
    const newItems = [...items];
    [newItems[index], newItems[index + 1]] = [
      newItems[index + 1],
      newItems[index],
    ];
    onChange(newItems);
  };

  const handleEdit = (index: number, value: string) => {
    const newItems = [...items];
    newItems[index] = value;
    onChange(newItems);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => handleMoveUp(index)}
                disabled={index === 0}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                title={t("results.moveUp", { defaultValue: "Move up" })}
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => handleMoveDown(index)}
                disabled={index === items.length - 1}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                title={t("results.moveDown", { defaultValue: "Move down" })}
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
            <input
              type="text"
              value={item}
              onChange={(e) => handleEdit(index, e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => handleRemove(index)}
              className="text-red-500 hover:text-red-700 dark:hover:text-red-400 p-2"
              title={t("results.removeItem", { defaultValue: "Remove" })}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-2">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <button
          type="button"
          onClick={handleAdd}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          {addButtonText}
        </button>
      </div>
    </div>
  );
}
