output "api_url" {
  description = "Cloud Run URL of the API."
  value       = google_cloud_run_v2_service.api.uri
}

output "mcp_url" {
  description = "Streamable HTTP endpoint of the MCP server."
  value       = "${google_cloud_run_v2_service.mcp.uri}/mcp"
}

output "artifact_registry" {
  description = "Docker repository for the images."
  value       = local.registry
}

output "api_service_account" {
  value = google_service_account.api.email
}

output "mcp_service_account" {
  value = google_service_account.mcp.email
}

output "bigquery_events_table" {
  value = "${var.project_id}.${google_bigquery_dataset.analytics.dataset_id}.${google_bigquery_table.events.table_id}"
}

output "events_topic" {
  value = google_pubsub_topic.events.id
}

output "secret_ids" {
  description = "Secret Manager placeholders. Add versions out of band."
  value       = [google_secret_manager_secret.openai_api_key.secret_id, google_secret_manager_secret.sso_client_secret.secret_id]
}
