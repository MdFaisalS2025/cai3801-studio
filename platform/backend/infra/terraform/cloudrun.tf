locals {
  common_env = {
    STORAGE               = "firestore"
    LLM_PROVIDER          = var.llm_provider
    GOOGLE_CLOUD_PROJECT  = var.project_id
    GOOGLE_CLOUD_LOCATION = var.region
    GEMINI_MODEL          = var.gemini_model
    OPENAI_BASE_URL       = var.openai_base_url
    OPENAI_MODEL          = var.openai_model
    VERTEX_OPEN_URL       = var.vertex_open_url
    TERM_START            = var.term_start
    DEMO_AUTH             = var.demo_auth
  }
}

resource "google_cloud_run_v2_service" "api" {
  name                = "${var.name_prefix}-api"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = var.deletion_protection

  template {
    service_account = google_service_account.api.email
    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }
    containers {
      image = local.api_image
      ports {
        container_port = 8080
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
      dynamic "env" {
        for_each = merge(local.common_env, {
          EVENT_SINK = "bigquery"
          BQ_DATASET = google_bigquery_dataset.analytics.dataset_id
          BQ_TABLE   = google_bigquery_table.events.table_id
        })
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = var.openai_key_secret_ready ? [1] : []
        content {
          name = "OPENAI_API_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.openai_api_key.secret_id
              version = "latest"
            }
          }
        }
      }
      startup_probe {
        http_get {
          path = "/healthz"
        }
      }
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service" "mcp" {
  name                = "${var.name_prefix}-mcp"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = var.deletion_protection

  template {
    service_account = google_service_account.mcp.email
    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }
    containers {
      image = local.mcp_image
      ports {
        container_port = 8080
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
      dynamic "env" {
        for_each = local.common_env
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = var.openai_key_secret_ready ? [1] : []
        content {
          name = "OPENAI_API_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.openai_api_key.secret_id
              version = "latest"
            }
          }
        }
      }
      startup_probe {
        http_get {
          path = "/healthz"
        }
      }
    }
  }

  depends_on = [google_project_service.apis]
}

# Services stay private: only listed principals may invoke them. Never add allUsers while
# DEMO_AUTH is on, because the demo header auth trusts whatever role the caller claims.
resource "google_cloud_run_v2_service_iam_member" "api_invokers" {
  for_each = toset(var.invoker_members)
  name     = google_cloud_run_v2_service.api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = each.value
}

resource "google_cloud_run_v2_service_iam_member" "mcp_invokers" {
  for_each = toset(var.invoker_members)
  name     = google_cloud_run_v2_service.mcp.name
  location = var.region
  role     = "roles/run.invoker"
  member   = each.value
}
