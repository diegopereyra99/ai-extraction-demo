# GCP Project: Minimal Setup

Scope: create a GCP project, enable required APIs, and create a service account used by the Cloud Function.

## Prerequisites
- `gcloud` installed and authenticated capability: https://cloud.google.com/sdk/docs/install
- A billing account ID (you must have permission to link billing)
- (Optional) Organization or Folder ID if you must place the project there

## Variables
Set the following in your shell (adjust values):

```bash
export PROJECT_ID="myproj-dev-123"   # lowercase, globally unique
export PROJECT_NAME="MyProj Dev"
export BILLING_ACCOUNT="AAAAAA-BBBBBB-CCCCCC"
export REGION="europe-west4"
```

## 1) Authenticate
```bash
gcloud auth login
```

## 2) Create the project
Console: IAM & Admin > Manage resources > Create Project.

CLI:
```bash
gcloud projects create "$PROJECT_ID" --name="$PROJECT_NAME"
```

Quick check:
```bash
gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)"
```

## 3) Link billing
```bash
gcloud billing projects link "$PROJECT_ID" \
  --billing-account="$BILLING_ACCOUNT"
```

## 4) Set default project (optional but convenient)
```bash
gcloud config set project "$PROJECT_ID"
```

## 5) Enable required APIs
Enable base project APIs and the services needed for Cloud Functions Gen2 and Vertex AI.
```bash
gcloud services enable \
  iam.googleapis.com \
  serviceusage.googleapis.com \
  cloudresourcemanager.googleapis.com \
  aiplatform.googleapis.com \
  run.googleapis.com \
  cloudfunctions.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com
```

## 6) Create a service account (runtime identity)
```bash
export SA_ID="gemini-extractor-sa"
export SA_EMAIL="$SA_ID@$PROJECT_ID.iam.gserviceaccount.com"

gcloud iam service-accounts create "$SA_ID" \
  --display-name "Gemini Extractor Runtime"
```

Verify SA exists:
```bash
gcloud iam service-accounts describe "$SA_EMAIL" \
  --format="value(email)"
```

## 7) Grant permissions to the service account
Grant minimal roles for running the function and calling Vertex AI.
```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/logging.logWriter"
```

Alternative (Makefile)
- With `.env.yaml` configured, you can create the service account and grant roles via:
```bash
make setup-sa
```

Notes
- The Makefile expects `SERVICE_ACCOUNT_ID=gemini-extractor-sa` and `CLOUD_FUNCTION_NAME=extract` in `.env.yaml` (see `.env.yaml.example`).
- The deploy identity (your user or CI) must have permissions to deploy Cloud Functions and to use the service account (e.g., roles/cloudfunctions.developer and roles/iam.serviceAccountUser).
Done.

