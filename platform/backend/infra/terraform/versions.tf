terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
  # Configure a GCS backend before real use, for example:
  # backend "gcs" {
  #   bucket = "YOUR_TF_STATE_BUCKET"
  #   prefix = "cai3801-studio"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
