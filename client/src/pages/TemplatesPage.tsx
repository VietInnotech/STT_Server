import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../components/Modal";
import toast from "react-hot-toast";
import { useAuthStore } from "../stores/auth";
import {
  templatesApi,
  type MAIETemplate,
  type CreateTemplateDTO,
  type UpdateTemplateDTO,
} from "../lib/api";
import TemplatePreview from "../components/TemplatePreview";
import SchemaOverview from "../components/SchemaOverview";
import { formatFieldName, getTypeLabel, getTypeIcon } from "../lib/schemaUtils";
import FormLabel from "../components/FormLabel";

export default function TemplatesPage() {
  const { t } = useTranslation("templates");
  const { t: tCommon } = useTranslation("common");
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";
  const [templates, setTemplates] = useState<MAIETemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "card">("card");
  const [search, setSearch] = useState("");

  // Modal states
  const [detailModal, setDetailModal] = useState<MAIETemplate | null>(null);
  const [editModal, setEditModal] = useState<MAIETemplate | null>(null);
  const [createModal, setCreateModal] = useState(false);

  // Load templates from API
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await templatesApi.list();
        if (!mounted) return;
        setTemplates(res.data.templates);
      } catch (err: any) {
        console.error("Failed to load templates", err);
        if (!mounted) return;
        const status = err.response?.status;
        if (status === 502 || status === 503 || status === 504) {
          setError(t("serviceUnavailable"));
        } else if (err.code === "ECONNREFUSED" || err.code === "ERR_NETWORK") {
          setError(t("cannotConnect"));
        } else {
          setError(err.response?.data?.error || t("failedToLoad"));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const handleCreate = async (data: CreateTemplateDTO) => {
    try {
      const res = await templatesApi.create(data);
      setTemplates((prev) => [res.data.template, ...prev]);
      toast.success(t("templateCreated"));
      setCreateModal(false);
    } catch (err: any) {
      console.error("Failed to create template", err);
      toast.error(err.response?.data?.error || t("failedToCreate"));
    }
  };

  const handleUpdate = async (id: string, data: UpdateTemplateDTO) => {
    try {
      const res = await templatesApi.update(id, data);
      setTemplates((prev) =>
        prev.map((tpl) => (tpl.id === id ? res.data.template : tpl))
      );
      toast.success(t("templateUpdated"));
      setEditModal(null);
    } catch (err: any) {
      console.error("Failed to update template", err);
      toast.error(err.response?.data?.error || t("failedToUpdate"));
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(t("confirmDelete", { name }))) return;
    try {
      await templatesApi.delete(id);
      setTemplates((prev) => prev.filter((tpl) => tpl.id !== id));
      toast.success(t("templateDeleted"));
    } catch (err: any) {
      console.error("Failed to delete template", err);
      toast.error(err.response?.data?.error || t("failedToDelete"));
    }
  };

  const openDetail = async (template: MAIETemplate) => {
    try {
      // Fetch full detail with prompt_template and schema_data
      const res = await templatesApi.get(template.id);
      setDetailModal(res.data.template);
    } catch (err) {
      console.error("Failed to fetch template detail", err);
      toast.error(t("failedToFetchDetails"));
    }
  };

  const openEdit = async (template: MAIETemplate) => {
    try {
      // Fetch full detail with prompt_template and schema_data for editing
      const res = await templatesApi.get(template.id);
      setEditModal(res.data.template);
    } catch (err) {
      console.error("Failed to fetch template for editing", err);
      toast.error(t("failedToFetchForEdit"));
    }
  };

  const filtered = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t("title")}</h2>
          <p className="text-sm text-gray-500 mt-1">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchTemplates")}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          />
          <div className="flex items-center gap-2 bg-gray-100 rounded-md p-1">
            <button
              onClick={() => setViewMode("card")}
              className={
                viewMode === "card"
                  ? "px-3 py-1 bg-white rounded shadow-sm"
                  : "px-3 py-1 text-gray-600"
              }
            >
              {t("cards")}
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={
                viewMode === "list"
                  ? "px-3 py-1 bg-white rounded shadow-sm"
                  : "px-3 py-1 text-gray-600"
              }
            >
              {t("list")}
            </button>
          </div>
          {isAdmin && (
            <button
              onClick={() => setCreateModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {t("newTemplate")}
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="text-center py-12 text-gray-500">
          {t("loadingTemplates")}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <div className="text-red-600 mb-2">
            <svg
              className="w-12 h-12 mx-auto mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className="font-medium">{error}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            {t("retry")}
          </button>
        </div>
      )}

      {/* List View */}
      {!loading && !error && viewMode === "list" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t("form.name")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t("form.description")}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {tCommon("actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map((template) => (
                <tr key={template.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {template.name}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-md truncate">
                    {template.description}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openDetail(template)}
                        className="px-3 py-1.5 text-sm bg-gray-100 rounded hover:bg-gray-200"
                      >
                        {tCommon("view")}
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            onClick={() => openEdit(template)}
                            className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                          >
                            {tCommon("edit")}
                          </button>
                          <button
                            onClick={() =>
                              handleDelete(template.id, template.name)
                            }
                            className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100"
                          >
                            {tCommon("delete")}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center py-8 text-gray-500">
                    {search ? t("noTemplatesMatch") : t("noTemplates")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Card View */}
      {!loading && !error && viewMode === "card" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((template) => (
            <div
              key={template.id}
              className="bg-white p-5 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow flex flex-col"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-gray-900 text-lg">
                  {template.name}
                </h3>
              </div>
              <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                {template.description}
              </p>

              {/* Parameters preview */}
              {template.parameters &&
                Object.keys(template.parameters).length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-gray-500 mb-1">
                      {t("parameters")}:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {Object.keys(template.parameters)
                        .slice(0, 4)
                        .map((key) => (
                          <span
                            key={key}
                            className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded"
                          >
                            {key}
                          </span>
                        ))}
                      {Object.keys(template.parameters).length > 4 && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">
                          {t("moreParams", {
                            count: Object.keys(template.parameters).length - 4,
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100 mt-auto">
                <button
                  onClick={() => openDetail(template)}
                  className="px-3 py-1.5 text-sm bg-gray-100 rounded hover:bg-gray-200"
                >
                  {t("viewDetails")}
                </button>
                {isAdmin && (
                  <>
                    <button
                      onClick={() => openEdit(template)}
                      className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                    >
                      {tCommon("edit")}
                    </button>
                    <button
                      onClick={() => handleDelete(template.id, template.name)}
                      className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100"
                    >
                      {tCommon("delete")}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500">
              {search ? t("noTemplatesMatch") : t("noTemplates")}
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {detailModal && (
        <Modal
          open={!!detailModal}
          onClose={() => setDetailModal(null)}
          title={detailModal.name}
          maxWidth="2xl"
        >
          <TemplateDetailView template={detailModal} />
        </Modal>
      )}

      {/* Create Modal */}
      {createModal && (
        <Modal
          open={createModal}
          onClose={() => setCreateModal(false)}
          title={t("form.createTitle")}
          maxWidth="xl"
          footer={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateModal(false)}
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200"
              >
                {tCommon("cancel")}
              </button>
              <button
                type="submit"
                form="create-template-form"
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                {tCommon("create")}
              </button>
            </div>
          }
        >
          <TemplateForm
            formId="create-template-form"
            onSave={(data) => handleCreate(data as CreateTemplateDTO)}
            onCancel={() => setCreateModal(false)}
          />
        </Modal>
      )}

      {/* Edit Modal */}
      {editModal && (
        <Modal
          open={!!editModal}
          onClose={() => setEditModal(null)}
          title={t("form.editTitle", { name: editModal.name })}
          maxWidth="xl"
          footer={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditModal(null)}
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200"
              >
                {tCommon("cancel")}
              </button>
              <button
                type="submit"
                form="edit-template-form"
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                {tCommon("update")}
              </button>
            </div>
          }
        >
          <TemplateForm
            formId="edit-template-form"
            initial={editModal}
            mode="edit"
            onSave={(data) =>
              handleUpdate(editModal.id, data as UpdateTemplateDTO)
            }
            onCancel={() => setEditModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}

// Template Detail View Component
function TemplateDetailView({ template }: { template: MAIETemplate }) {
  const { t } = useTranslation("templates");
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";
  const [activeTab, setActiveTab] = useState<"overview" | "schema" | "example">(
    "overview"
  );
  const [showRawJson, setShowRawJson] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Tabs - Fixed at top */}
      <div className="flex-shrink-0 flex gap-2 border-b border-gray-200 pb-2 mb-4">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-3 py-1.5 rounded-t ${
            activeTab === "overview"
              ? "bg-blue-50 text-blue-600 font-medium"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          {t("detail.overview")}
        </button>
        {template.schema_data && (
          <button
            onClick={() => setActiveTab("schema")}
            className={`px-3 py-1.5 rounded-t ${
              activeTab === "schema"
                ? "bg-blue-50 text-blue-600 font-medium"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t("detail.schema")}
          </button>
        )}
        {template.example && (
          <button
            onClick={() => setActiveTab("example")}
            className={`px-3 py-1.5 rounded-t ${
              activeTab === "example"
                ? "bg-blue-50 text-blue-600 font-medium"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t("detail.example")}
          </button>
        )}
        {/* Admin Raw JSON Toggle - moved to tabs row */}
        {isAdmin && (activeTab === "schema" || activeTab === "example") && (
          <button
            onClick={() => setShowRawJson(!showRawJson)}
            className="ml-auto px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2"
          >
            <span>{showRawJson ? "📊" : "{ }"}</span>
            {showRawJson ? t("detail.showFormatted") : t("detail.showRawJson")}
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0">
        {activeTab === "overview" && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-1">
                {t("detail.description")}
              </h4>
              <p className="text-gray-700">{template.description}</p>
            </div>
            {template.schema_url && (
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-1">
                  {t("detail.schemaUrl")}
                </h4>
                <a
                  href={template.schema_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm break-all"
                >
                  {template.schema_url}
                </a>
              </div>
            )}
            {template.parameters &&
              Object.keys(template.parameters).length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-2">
                    {t("parameters")}
                  </h4>
                  <ParametersList parameters={template.parameters} />
                </div>
              )}
          </div>
        )}

        {activeTab === "schema" &&
          template.schema_data &&
          (showRawJson ? (
            <div className="bg-gray-50 rounded-lg p-4 h-full overflow-auto">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap">
                {JSON.stringify(template.schema_data, null, 2)}
              </pre>
            </div>
          ) : (
            <SchemaOverview schema={template.schema_data} />
          ))}

        {activeTab === "example" &&
          template.example &&
          (showRawJson ? (
            <div className="bg-gray-50 rounded-lg p-4 h-full overflow-auto">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap">
                {JSON.stringify(template.example, null, 2)}
              </pre>
            </div>
          ) : (
            <TemplatePreview
              schema={template.schema_data}
              example={template.example}
              title={t("detail.exampleOutput")}
            />
          ))}
      </div>
    </div>
  );
}

// Parameters List Component - Displays parameters in a user-friendly format
function ParametersList({ parameters }: { parameters: Record<string, any> }) {
  const { t } = useTranslation("templates");
  const entries = Object.entries(parameters);

  if (entries.length === 0) {
    return (
      <p className="text-gray-500 text-sm">{t("parametersList.noParams")}</p>
    );
  }

  return (
    <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-200">
      {entries.map(([key, value]) => (
        <div key={key} className="p-3 flex items-start gap-3">
          <span className="text-base flex-shrink-0">
            {getTypeIcon(
              typeof value === "object"
                ? Array.isArray(value)
                  ? "array"
                  : "object"
                : (typeof value as any)
            )}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">
                {formatFieldName(key)}
              </span>
              <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                {getTypeLabel(
                  typeof value === "object"
                    ? Array.isArray(value)
                      ? "array"
                      : "object"
                    : (typeof value as any)
                )}
              </span>
            </div>
            <div className="text-sm text-gray-600 mt-1">
              {typeof value === "object" ? (
                Array.isArray(value) ? (
                  <span>
                    {t("parametersList.items", { count: value.length })}
                  </span>
                ) : (
                  <span>
                    {t("parametersList.fields", {
                      count: Object.keys(value).length,
                    })}
                  </span>
                )
              ) : (
                <span>{String(value)}</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Template Form Component
function TemplateForm({
  initial,
  onSave,
  onCancel: _onCancel,
  formId,
  mode = "create",
}: {
  initial?: MAIETemplate | null;
  onSave: (data: CreateTemplateDTO | UpdateTemplateDTO) => void;
  onCancel: () => void;
  formId?: string;
  mode?: "create" | "edit";
}) {
  const { t } = useTranslation("templates");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [schema, setSchema] = useState(
    initial?.schema_data ? JSON.stringify(initial.schema_data, null, 2) : "{}"
  );
  const [promptTemplate, setPromptTemplate] = useState(
    initial?.prompt_template ?? ""
  );
  const [example, setExample] = useState(
    initial?.example ? JSON.stringify(initial.example, null, 2) : ""
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when initial data changes (e.g., when editing a different template)
  useEffect(() => {
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setSchema(
      initial?.schema_data ? JSON.stringify(initial.schema_data, null, 2) : "{}"
    );
    setPromptTemplate(initial?.prompt_template ?? "");
    setExample(
      initial?.example ? JSON.stringify(initial.example, null, 2) : ""
    );
    setErrors({});
  }, [initial]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) newErrors.name = t("form.nameRequired");
    if (!description.trim())
      newErrors.description = t("form.descriptionRequired");

    try {
      JSON.parse(schema);
    } catch {
      newErrors.schema = t("form.schemaInvalid");
    }

    if (example.trim()) {
      try {
        JSON.parse(example);
      } catch {
        newErrors.example = t("form.exampleInvalid");
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const parsedSchema = JSON.parse(schema);

    if (mode === "edit") {
      // For updates, MAIE API only accepts schema_data, prompt_template, example
      // name/description are derived from schema_data.title and schema_data.description
      const schemaWithMeta = {
        ...parsedSchema,
        title: name.trim(),
        description: description.trim(),
      };

      const data: UpdateTemplateDTO = {
        schema_data: schemaWithMeta,
      };

      if (promptTemplate.trim()) {
        data.prompt_template = promptTemplate.trim();
      }

      if (example.trim()) {
        data.example = JSON.parse(example);
      }

      onSave(data);
    } else {
      // For create, send all fields at top level
      const data: CreateTemplateDTO = {
        name: name.trim(),
        description: description.trim(),
        schema_data: parsedSchema,
      };

      if (promptTemplate.trim()) {
        data.prompt_template = promptTemplate.trim();
      }

      if (example.trim()) {
        data.example = JSON.parse(example);
      }

      onSave(data);
    }
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4">
      <div>
        <FormLabel required>{t("form.name")}</FormLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`w-full px-3 py-2 border rounded-lg ${
            errors.name ? "border-red-500" : "border-gray-300"
          }`}
          placeholder={t("form.namePlaceholder")}
        />
        {errors.name && (
          <p className="text-red-500 text-xs mt-1">{errors.name}</p>
        )}
      </div>

      <div>
        <FormLabel required>{t("form.description")}</FormLabel>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className={`w-full px-3 py-2 border rounded-lg ${
            errors.description ? "border-red-500" : "border-gray-300"
          }`}
          placeholder={t("form.descriptionPlaceholder")}
        />
        {errors.description && (
          <p className="text-red-500 text-xs mt-1">{errors.description}</p>
        )}
      </div>

      <div>
        <FormLabel required>{t("form.jsonSchema")}</FormLabel>
        <textarea
          value={schema}
          onChange={(e) => setSchema(e.target.value)}
          rows={6}
          className={`w-full px-3 py-2 border rounded-lg font-mono text-sm ${
            errors.schema ? "border-red-500" : "border-gray-300"
          }`}
          placeholder="{}"
        />
        {errors.schema && (
          <p className="text-red-500 text-xs mt-1">{errors.schema}</p>
        )}
      </div>

      <div>
        <FormLabel>{t("form.promptTemplate")}</FormLabel>
        <textarea
          value={promptTemplate}
          onChange={(e) => setPromptTemplate(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
          placeholder={t("form.promptPlaceholder")}
        />
      </div>

      <div>
        <FormLabel>{t("form.exampleJson")}</FormLabel>
        <textarea
          value={example}
          onChange={(e) => setExample(e.target.value)}
          rows={4}
          className={`w-full px-3 py-2 border rounded-lg font-mono text-sm ${
            errors.example ? "border-red-500" : "border-gray-300"
          }`}
          placeholder="{}"
        />
        {errors.example && (
          <p className="text-red-500 text-xs mt-1">{errors.example}</p>
        )}
      </div>
    </form>
  );
}
