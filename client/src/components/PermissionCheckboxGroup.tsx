import { useTranslation } from "react-i18next";
import { Check, Minus } from "lucide-react";

interface PermissionCheckboxGroupProps {
  categories: Record<string, string[]>;
  selectedPermissions: string[];
  onChange: (permissions: string[]) => void;
  disabled?: boolean;
}

export default function PermissionCheckboxGroup({
  categories,
  selectedPermissions,
  onChange,
  disabled = false,
}: PermissionCheckboxGroupProps) {
  const { t } = useTranslation("roles");

  const togglePermission = (permission: string) => {
    if (disabled) return;
    if (selectedPermissions.includes(permission)) {
      onChange(selectedPermissions.filter((p) => p !== permission));
    } else {
      onChange([...selectedPermissions, permission]);
    }
  };

  const toggleCategory = (categoryPermissions: string[]) => {
    if (disabled) return;
    const allSelected = categoryPermissions.every((p) =>
      selectedPermissions.includes(p)
    );
    if (allSelected) {
      // Deselect all in category
      onChange(
        selectedPermissions.filter((p) => !categoryPermissions.includes(p))
      );
    } else {
      // Select all in category
      const newPermissions = [...selectedPermissions];
      categoryPermissions.forEach((p) => {
        if (!newPermissions.includes(p)) {
          newPermissions.push(p);
        }
      });
      onChange(newPermissions);
    }
  };

  const getCategoryState = (
    categoryPermissions: string[]
  ): "none" | "partial" | "all" => {
    const selectedCount = categoryPermissions.filter((p) =>
      selectedPermissions.includes(p)
    ).length;
    if (selectedCount === 0) return "none";
    if (selectedCount === categoryPermissions.length) return "all";
    return "partial";
  };

  // Helper to format permission label (e.g., "users.read" -> "Read")
  const formatPermissionLabel = (permission: string) => {
    const action = permission.split(".")[1];
    return t(
      `permissionLabels.${action}`,
      action.charAt(0).toUpperCase() + action.slice(1)
    );
  };

  return (
    <div className="space-y-4">
      {Object.entries(categories).map(([category, permissions]) => {
        const state = getCategoryState(permissions);
        return (
          <div key={category} className="border rounded-lg p-4 bg-gray-50">
            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                onClick={() => toggleCategory(permissions)}
                disabled={disabled}
                className={`w-5 h-5 rounded border flex items-center justify-center transition-colors
                  ${
                    disabled
                      ? "cursor-not-allowed opacity-50"
                      : "cursor-pointer"
                  }
                  ${
                    state === "all"
                      ? "bg-blue-600 border-blue-600 text-white"
                      : ""
                  }
                  ${state === "partial" ? "bg-blue-200 border-blue-400" : ""}
                  ${state === "none" ? "bg-white border-gray-300" : ""}`}
              >
                {state === "all" && <Check size={14} />}
                {state === "partial" && (
                  <Minus size={14} className="text-blue-600" />
                )}
              </button>
              <span className="font-medium text-gray-700">
                {t(`categories.${category}`, category)}
              </span>
            </div>
            <div className="ml-7 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {permissions.map((permission) => (
                <label
                  key={permission}
                  className={`flex items-center gap-2 text-sm
                    ${
                      disabled
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-pointer"
                    }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedPermissions.includes(permission)}
                    onChange={() => togglePermission(permission)}
                    disabled={disabled}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 
                      focus:ring-blue-500 disabled:opacity-50"
                  />
                  <span className="text-gray-600">
                    {formatPermissionLabel(permission)}
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
