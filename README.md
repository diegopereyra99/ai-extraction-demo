# AI Extraction Demo

A lightweight web app that turns your documents into structured data. Upload a PDF or image, define the fields you care about, and get clean results. This demo shows how easily AI-based extraction can be integrated into existing workflows.


## Try It

Visit the **live demo** on GitHub Pages:  
https://diegopereyra99.github.io/ai-extraction-demo  

No setup required.


## How It Works

Start by uploading documents — scanned, photographed, or digital. Next, define the fields you want to capture (such as *date* or *total*) and assign them a type. This definition becomes a schema that tells the system what structured output to generate.  

The schema and documents are then sent to **Gemini** (via Vertex AI) through a Cloud Function endpoint. This endpoint interprets the content without relying on rigid templates and, within seconds, returns a table of extracted values aligned with your schema.


## Development & Scope

This is a prototype built for demos and quick experiments. It handles small files and simple flat schemas, but more complex structures and other customizations are possible too. The UI is deliberately lightweight and multilingual (EN/ES/IT).


## Documentation

See the documentation in this repo for setup and usage:  

- [**GCP Setup**](docs/01-gcp-setup.md) — Create a project on Google Cloud Platform, enable Vertex AI.  
- [**API Guide**](docs/02-extract-api.md) — Deploy a Cloud Function to process files and schemas and return structured data.  
- [**Web App Notes**](docs/03-webapp-spec.md) — Run the UI locally to test the endpoint interactively.  
