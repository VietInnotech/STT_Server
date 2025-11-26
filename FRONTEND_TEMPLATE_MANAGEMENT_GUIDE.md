# Frontend Template Management Guide

This guide provides an overview for integrating a frontend application with the MAIE template management API.

---

## API Overview

The MAIE backend offers RESTful endpoints at `/v1/templates` for managing processing templates. Each template includes:
- **Schema** – JSON Schema defining the structured output format.
- **Prompt** – Jinja2 template used to generate prompts for the LLM. All templates should extend `base/structured_output_v1.jinja` to inherit standard instructions and language rules.
- **Example** – Optional example JSON output.

**Base URL**: `http://localhost:8000` (or your deployed API URL).

---

## Authentication

Protected endpoints (POST, PUT, DELETE) require an API key.

**Header**:
```http
X-API-Key: your_secret_api_key_here
Content-Type: application/json
```

The key is defined in the backend `.env` as `APP_API__SECRET_KEY`.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/templates` | List all templates. |
| GET | `/v1/templates/{template_id}` | Retrieve full details (schema, prompt, example). |
| GET | `/v1/templates/{template_id}/schema` | Return raw JSON schema. |
| POST | `/v1/templates` | Create a new template (requires API key). |
| PUT | `/v1/templates/{template_id}` | Update an existing template (requires API key). |
| DELETE | `/v1/templates/{template_id}` | Delete a template (requires API key). |

---

## Data Models

```typescript
interface Template {
  id: string;
  name: string;
  description: string;
  schema_url: string;
  parameters: Record<string, any>;
  example?: Record<string, any>;
  prompt_template?: string; // only in detail view
  schema_data?: JSONSchema; // only in detail view
}

interface JSONSchema {
  title: string;
  description: string;
  type: string;
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
}

interface JSONSchemaProperty {
  type: string;
  description?: string;
  items?: JSONSchema;
  maxItems?: number;
}
```

---

## Frontend Architecture

### Recommended Tech Stack
- **Framework**: React, Vue, or Angular.
- **State Management**: Redux/Zustand (React), Vuex/Pinia (Vue), NgRx (Angular).
- **HTTP Client**: Axios or native Fetch API.
- **UI Library**: Material‑UI, Ant Design, or Chakra UI.
- **Routing**: React Router, Vue Router, or Angular Router.

### Component Layout (example for React)
```
src/
├── components/
│   ├── TemplateList.tsx          # List all templates
│   ├── TemplateCard.tsx          # Preview card
│   ├── TemplateDetail.tsx        # View details
│   ├── TemplateForm.tsx          # Create / edit form
│   ├── SchemaEditor.tsx          # JSON Schema editor (optional)
│   ├── PromptEditor.tsx          # Jinja2 editor (optional)
│   └── ExampleEditor.tsx         # Example JSON editor (optional)
├── services/
│   └── templateApi.ts            # API wrapper
├── hooks/
│   └── useTemplates.ts           # Data fetching hooks
├── types/
│   └── template.ts               # TypeScript types
└── pages/
    ├── TemplatesPage.tsx         # Main page
    ├── CreateTemplatePage.tsx    # Creation page
    └── EditTemplatePage.tsx      # Editing page
```

---

## Deployment Considerations

- **Environment Variables**: Provide `REACT_APP_API_URL` and `REACT_APP_API_KEY` (or equivalents) in a `.env` file.
- **CORS**: The backend allows all origins (`*`) by default; restrict this in production as needed.
- **Build**: Run `npm run build` (or `yarn build`) and deploy the static assets to Netlify, Vercel, S3, etc.

---

## Troubleshooting

- **CORS Errors** – Verify the backend CORS settings include your frontend domain.
- **Authentication Failures** – Ensure the correct API key is set and sent in the `X‑API‑Key` header.
- **JSON Validation Errors** – Validate JSON schema and example payloads before sending.
- **Network Issues** – Confirm the API URL is reachable; check browser dev tools for failed requests.

---

## Resources

- MAIE API Docs: `http://localhost:8000/schema`
- JSON Schema: https://json-schema.org/
- Jinja2: https://jinja.palletsprojects.com/
- React: https://react.dev/
- Axios: https://axios-http.com/

---

## Support

For assistance:
1. Check backend logs: `docker-compose logs -f api`.
2. Review the OpenAPI spec at `/schema`.
3. Test endpoints with curl or Postman.
4. Inspect browser console for frontend errors.

---

**Happy coding! 🚀**
