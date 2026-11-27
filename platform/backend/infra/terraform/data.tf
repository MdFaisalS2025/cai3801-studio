# ---------- Firestore (native mode) ----------

resource "google_firestore_database" "main" {
  name                    = "(default)"
  location_id             = var.firestore_location
  type                    = "FIRESTORE_NATIVE"
  delete_protection_state = var.deletion_protection ? "DELETE_PROTECTION_ENABLED" : "DELETE_PROTECTION_DISABLED"
  depends_on              = [google_project_service.apis]
}

# listEvents({ actor, since }) filters on actor and orders by ts.
resource "google_firestore_index" "events_actor_ts" {
  database   = google_firestore_database.main.name
  collection = "events"
  fields {
    field_path = "actor"
    order      = "ASCENDING"
  }
  fields {
    field_path = "ts"
    order      = "ASCENDING"
  }
}

# ---------- BigQuery: analytics dataset and events table ----------

resource "google_bigquery_dataset" "analytics" {
  dataset_id  = var.name_prefix
  location    = var.bigquery_location
  description = "CAI 3801 Studio learning events (xAPI-style)"
  depends_on  = [google_project_service.apis]
}

resource "google_bigquery_table" "events" {
  dataset_id          = google_bigquery_dataset.analytics.dataset_id
  table_id            = "events"
  deletion_protection = var.deletion_protection

  time_partitioning {
    type  = "DAY"
    field = "ts"
  }
  clustering = ["actor", "verb"]

  # Matches api/sink.js eventToRow().
  schema = jsonencode([
    { name = "id", type = "STRING", mode = "REQUIRED" },
    { name = "actor", type = "STRING", mode = "REQUIRED" },
    { name = "verb", type = "STRING", mode = "REQUIRED" },
    { name = "object", type = "STRING", mode = "REQUIRED" },
    { name = "week", type = "INTEGER", mode = "NULLABLE" },
    { name = "ts", type = "TIMESTAMP", mode = "REQUIRED" },
    { name = "score", type = "FLOAT", mode = "NULLABLE" },
    { name = "duration_sec", type = "INTEGER", mode = "NULLABLE" },
  ])
}

# ---------- Pub/Sub: event stream ----------
# The scaffold's sink writes to BigQuery directly (EVENT_SINK=bigquery). For production, have
# the API publish here and add a BigQuery subscription that writes the events table.

resource "google_pubsub_topic" "events" {
  name                       = "${var.name_prefix}-events"
  message_retention_duration = "604800s"
  depends_on                 = [google_project_service.apis]
}

# ---------- Secret Manager placeholders (no values in code) ----------
# Add values out of band, e.g.:
#   printf '%s' "$KEY" | gcloud secrets versions add cai3801-openai-api-key --data-file=-

resource "google_secret_manager_secret" "openai_api_key" {
  secret_id = "${var.name_prefix}-openai-api-key"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret" "sso_client_secret" {
  secret_id = "${var.name_prefix}-sso-client-secret"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}
