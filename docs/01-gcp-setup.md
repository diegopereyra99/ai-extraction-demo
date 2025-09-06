# 01 — GCP project: minimal setup

Scope: create a GCP project, enable required APIs, and create a service account. Keep everything minimal.

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

## 5) Enable minimal APIs
Enable only what is needed to manage IAM, services, and project IAM policy.
```bash
gcloud services enable \
  iam.googleapis.com \
  serviceusage.googleapis.com \
  cloudresourcemanager.googleapis.com
```

## 6) Create a service account
```bash
export SA_ID="sa-automation"
export SA_EMAIL="$SA_ID@$PROJECT_ID.iam.gserviceaccount.com"

gcloud iam service-accounts create "$SA_ID" \
  --display-name "Automation Service Account"
```

Verify SA exists:
```bash
gcloud iam service-accounts describe "$SA_EMAIL" \
  --format="value(email)"
```

## 7) Grant permissions to the service account
Grant only what is required for your use case. Example: read-only access at the project level.
```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/viewer"
```

Done.