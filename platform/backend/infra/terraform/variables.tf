variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "region" {
  description = "Region for Cloud Run, Artifact Registry and Vertex AI."
  type        = string
  default     = "us-central1"
}

variable "firestore_location" {
  description = "Firestore location (multi-region nam5 or a region)."
  type        = string
  default     = "nam5"
}

variable "bigquery_location" {
  description = "BigQuery dataset location."
  type        = string
  default     = "US"
}

variable "name_prefix" {
  description = "Prefix for resource names."
  type        = string
  default     = "cai3801"
}

variable "image_tag" {
  description = "Container image tag to deploy (Cloud Build pushes the commit SHA)."
  type        = string
  default     = "latest"
}

variable "llm_provider" {
  description = "LLM provider id: vertex-gemini, vertex-open, openai-compatible, vertex-claude or mock."
  type        = string
  default     = "vertex-gemini"
}

variable "gemini_model" {
  description = "Gemini model on Vertex AI."
  type        = string
  default     = "gemini-2.5-flash"
}

variable "openai_base_url" {
  description = "Base URL for an OpenAI-compatible endpoint (USF or vLLM). Empty when unused."
  type        = string
  default     = ""
}

variable "openai_model" {
  description = "Model name for the OpenAI-compatible endpoint."
  type        = string
  default     = ""
}

variable "vertex_open_url" {
  description = "OpenAI-compatible chat/completions URL of a Vertex Model Garden endpoint. Empty when unused."
  type        = string
  default     = ""
}

variable "openai_key_secret_ready" {
  description = "Set true after adding a version to the openai-api-key secret, to mount it into the services."
  type        = bool
  default     = false
}

variable "term_start" {
  description = "First Monday of term (ISO date)."
  type        = string
  default     = "2026-08-31"
}

variable "demo_auth" {
  description = "on keeps the demo x-demo-role header auth. Only with private services. Set off once SSO is wired."
  type        = string
  default     = "on"
}

variable "invoker_members" {
  description = "Principals allowed to call the Cloud Run services, e.g. [\"group:cai3801-staff@usf.edu\"]. Never allUsers while demo auth is on."
  type        = list(string)
  default     = []
}

variable "deletion_protection" {
  description = "Protect Firestore, BigQuery and Cloud Run from accidental deletes."
  type        = bool
  default     = true
}
