# Root Makefile - API deploys, extend later for frontend

ENV_FILE := .env.yaml
EXAMPLE_FILE := .env.yaml.example

# ---------- Internals ----------
YQ := yq
PROJECT := $$($(YQ) .GOOGLE_CLOUD_PROJECT $(ENV_FILE))
REGION  := $$($(YQ) .GOOGLE_CLOUD_LOCATION $(ENV_FILE))
FUNC    := $$($(YQ) .CLOUD_FUNCTION_NAME $(ENV_FILE) 2>/dev/null || echo extract)
SA_ID   := $$($(YQ) .SERVICE_ACCOUNT_ID $(ENV_FILE) 2>/dev/null || echo gemini-extractor-sa)
SA_EMAIL := $(SA_ID)@$(PROJECT).iam.gserviceaccount.com

# ---------- Guards ----------
.PHONY: check-env
check-env:
	@if [ ! -f $(ENV_FILE) ]; then \
		echo "❌ $(ENV_FILE) not found. Run: cp $(EXAMPLE_FILE) $(ENV_FILE)"; \
		exit 1; \
	fi
	@if cmp -s $(ENV_FILE) $(EXAMPLE_FILE); then \
		echo "❌ $(ENV_FILE) is identical to $(EXAMPLE_FILE). Edit real values."; \
		exit 1; \
	fi
	@command -v $(YQ) >/dev/null 2>&1 || { \
		echo "❌ '$(YQ)' not found. Install: https://github.com/mikefarah/yq"; \
		exit 1; \
	}
	@if [ "$$($(YQ) .GOOGLE_CLOUD_PROJECT $(ENV_FILE))" = "your-project-id" ]; then \
		echo "❌ GOOGLE_CLOUD_PROJECT is still 'your-project-id'."; \
		exit 1; \
	fi

# ---------- API (backend) ----------
.PHONY: enable-apis
enable-apis: check-env
	@echo "Enabling required APIs on project '$(PROJECT)'..."
	gcloud services enable \
	  iam.googleapis.com \
	  serviceusage.googleapis.com \
	  cloudresourcemanager.googleapis.com \
	  aiplatform.googleapis.com \
	  run.googleapis.com \
	  cloudfunctions.googleapis.com \
	  artifactregistry.googleapis.com \
	  cloudbuild.googleapis.com \
	  --project "$(PROJECT)"

.PHONY: setup-sa
setup-sa: check-env
	@echo "Ensuring service account '$(SA_EMAIL)' exists in project '$(PROJECT)'..."
	@if ! gcloud iam service-accounts describe "$(SA_EMAIL)" --project="$(PROJECT)" >/dev/null 2>&1; then \
	  gcloud iam service-accounts create "$(SA_ID)" \
	    --display-name "Gemini Extractor Runtime" \
	    --project="$(PROJECT)"; \
	else \
	  echo "Service account already exists."; \
	fi
	@echo "Granting minimal roles to '$(SA_EMAIL)'..."
	gcloud projects add-iam-policy-binding "$(PROJECT)" \
	  --member="serviceAccount:$(SA_EMAIL)" \
	  --role="roles/aiplatform.user" >/dev/null
	gcloud projects add-iam-policy-binding "$(PROJECT)" \
	  --member="serviceAccount:$(SA_EMAIL)" \
	  --role="roles/logging.logWriter" >/dev/null
	@echo "Done."

.PHONY: deploy-api
deploy-api: check-env
	@echo "Deploying function '$(FUNC)' to region '$(REGION)' in project '$(PROJECT)'..."
	gcloud functions deploy "$(FUNC)" \
	  --gen2 \
	  --runtime=python312 \
	  --region="$(REGION)" \
	  --source=api \
	  --entry-point=extract \
	  --trigger-http \
	  --memory=512Mi \
	  --concurrency=1 \
	  --allow-unauthenticated \
	  --service-account="$(SA_EMAIL)" \
	  --env-vars-file "$(ENV_FILE)"
	@$(MAKE) -s url-api

.PHONY: logs-api
logs-api: check-env
	gcloud functions logs read "$(FUNC)" --region="$(REGION)" --gen2 --limit=50

.PHONY: url-api
url-api: check-env
	@URL=$$(gcloud functions describe "$(FUNC)" --region="$(REGION)" --gen2 --format='value(serviceConfig.uri)'); \
	echo "Function URL: $$URL"

# ---------- Frontend (placeholder) ----------
.PHONY: deploy-frontend
deploy-frontend:
	@echo "⚠️  Frontend deployment not yet implemented."

.PHONY: serve-web
serve-web:
	@echo "Serving ./web at http://localhost:5173"
	python3 -m http.server 5173 --directory web

# ---------- Meta ----------
.PHONY: help
help:
	@echo "Targets:"
	@echo "  make enable-apis     Enable required GCP APIs on the project"
	@echo "  make setup-sa        Create service account and grant roles"
	@echo "  make deploy-api      Deploy the Cloud Function (API)"
	@echo "  make logs-api        Tail logs"
	@echo "  make url-api         Print function URL"
	@echo "  make check-env       Verify env file is configured"
	@echo "  make serve-web       Serve the local webapp from ./web"
