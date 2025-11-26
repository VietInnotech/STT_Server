import axios from "axios";
import type { AxiosError, AxiosInstance } from "axios";
import logger from "../lib/logger";

const MAIE_API_URL = process.env.MAIE_API_URL || "http://localhost:8000";
const MAIE_API_KEY = process.env.MAIE_API_KEY;

if (!MAIE_API_KEY) {
  logger.warn("MAIE_API_KEY not set - template mutations will fail");
}

const maieClient: AxiosInstance = axios.create({
  baseURL: MAIE_API_URL,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

const withApiKey = () => ({ headers: { "X-API-Key": MAIE_API_KEY } });

// ============================================
// DTOs
// ============================================

// For creating templates (POST) - MAIE API accepts all fields
export interface CreateTemplateDTO {
  name: string;
  description: string;
  schema_data: Record<string, any>;
  prompt_template?: string;
  example?: Record<string, any>;
}

// For updating templates (PUT) - MAIE API only accepts these fields
// name/description are derived from schema_data.title and schema_data.description
export interface UpdateTemplateDTO {
  schema_data?: Record<string, any>;
  prompt_template?: string;
  example?: Record<string, any>;
}

// ============================================
// Response Types
// ============================================

export interface MAIETemplate {
  id: string;
  name: string;
  description: string;
  schema_url: string;
  parameters: Record<string, any>;
  example?: Record<string, any>;
  prompt_template?: string; // detail only
  schema_data?: Record<string, any>; // detail only
}

// ============================================
// API Response Types
// ============================================

export interface MAIETemplatesListResponse {
  templates: MAIETemplate[];
}

// ============================================
// API Methods
// ============================================

export const maieApi = {
  listTemplates: () =>
    maieClient.get<MAIETemplatesListResponse>("/v1/templates"),
  getTemplate: (id: string) =>
    maieClient.get<MAIETemplate>(`/v1/templates/${id}`),
  getTemplateSchema: (id: string) =>
    maieClient.get(`/v1/templates/${id}/schema`),
  createTemplate: (data: CreateTemplateDTO) =>
    maieClient.post<MAIETemplate>("/v1/templates", data, withApiKey()),
  updateTemplate: (id: string, data: UpdateTemplateDTO) =>
    maieClient.put<MAIETemplate>(`/v1/templates/${id}`, data, withApiKey()),
  deleteTemplate: (id: string) =>
    maieClient.delete(`/v1/templates/${id}`, withApiKey()),
};

// ============================================
// Error Handling
// ============================================

export const handleMaieError = (err: unknown, defaultMsg: string) => {
  const axiosErr = err as AxiosError<{ detail?: string }>;
  logger.error(defaultMsg, {
    status: axiosErr.response?.status,
    data: axiosErr.response?.data,
  });
  return {
    status: axiosErr.response?.status || 500,
    error: axiosErr.response?.data?.detail || defaultMsg,
  };
};
