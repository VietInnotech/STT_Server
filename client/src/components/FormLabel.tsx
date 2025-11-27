import React from "react";
import { useTranslation } from "react-i18next";

interface FormLabelProps {
  children: React.ReactNode;
  required?: boolean;
  optional?: boolean;
  className?: string;
}

export default function FormLabel({
  children,
  required,
  optional,
  className,
}: FormLabelProps) {
  const { t } = useTranslation("common");
  return (
    <label
      className={`block text-sm font-medium text-gray-700 mb-1 ${
        className || ""
      }`}
    >
      <span className="inline-flex items-center gap-1">
        <span>{children}</span>
        {required && (
          <span aria-hidden className="text-red-500 font-medium">
            *
          </span>
        )}
        {optional && (
          <span className="text-gray-500 text-xs ml-1">
            ({t("optional", "Optional")})
          </span>
        )}
      </span>
    </label>
  );
}
