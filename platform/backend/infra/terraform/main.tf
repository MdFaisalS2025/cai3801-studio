locals {
  services = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "firestore.googleapis.com",
    "bigquery.googleapis.com",
    "pubsub.googleapis.com",
    "secretmanager.googleapis.com",
    "aiplatform.googleapis.com",
    "iam.googleapis.com",
  ]
  registry  = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
  api_image = "${local.registry}/api:${var.image_tag}"
  mcp_image = "${local.registry}/mcp:${var.image_tag}"
}

resource "google_project_service" "apis" {
  for_each           = toset(local.services)
  service            = each.value
  disable_on_destroy = false
}

# ---------- Artifact Registry ----------

resource "google_artifact_registry_repository" "images" {
  location      = var.region
  repository_id = "${var.name_prefix}-images"
  format        = "DOCKER"
  description   = "CAI 3801 Studio container images"
  depends_on    = [google_project_service.apis]
}

# ---------- Service accounts (one per service, least privilege) ----------

resource "google_service_account" "api" {
  account_id   = "${var.name_prefix}-api"
  display_name = "CAI 3801 API (Cloud Run)"
}

resource "google_service_account" "mcp" {
  account_id   = "${var.name_prefix}-mcp"
  display_name = "CAI 3801 MCP server (Cloud Run)"
}

# Vertex AI user: call Gemini and Model Garden endpoints.
resource "google_project_iam_member" "vertex_user" {
  for_each = {
    api = google_service_account.api.email
    mcp = google_service_account.mcp.email
  }
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${each.value}"
}

# Firestore user: read and write documents (no admin).
resource "google_project_iam_member" "firestore_user" {
  for_each = {
    api = google_service_account.api.email
    mcp = google_service_account.mcp.email
  }
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${each.value}"
}

# BigQuery data editor on the events dataset only (API writes the event stream).
resource "google_bigquery_dataset_iam_member" "api_events_editor" {
  dataset_id = google_bigquery_dataset.analytics.dataset_id
  role       = "roles/bigquery.dataEditor"
  member     = "serviceAccount:${google_service_account.api.email}"
}

# Publish events to the topic (API only).
resource "google_pubsub_topic_iam_member" "api_publisher" {
  topic  = google_pubsub_topic.events.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:${google_service_account.api.email}"
}

# Read only the secrets each service needs.
resource "google_secret_manager_secret_iam_member" "api_openai_key" {
  secret_id = google_secret_manager_secret.openai_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

resource "google_secret_manager_secret_iam_member" "mcp_openai_key" {
  secret_id = google_secret_manager_secret.openai_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.mcp.email}"
}
