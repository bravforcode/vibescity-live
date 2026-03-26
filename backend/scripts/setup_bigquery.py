import argparse

from google.api_core.exceptions import NotFound
from google.cloud import bigquery


def setup_bigquery(project_id, dataset_id, location="US"):
    client = bigquery.Client(project=project_id)
    dataset_ref = client.dataset(dataset_id)

    try:
        client.get_dataset(dataset_ref)
        print(f"Dataset {dataset_id} already exists.")
    except NotFound:
        dataset = bigquery.Dataset(dataset_ref)
        dataset.location = location
        dataset = client.create_dataset(dataset)
        print(f"Created dataset {client.project}.{dataset.dataset_id}")

    # Define tables with partitioning and schema
    tables = {
        "route_check_events": [
            bigquery.SchemaField("event_id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("observed_at", "TIMESTAMP", mode="REQUIRED"),
            bigquery.SchemaField("endpoint_key", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("status", "INTEGER", mode="REQUIRED"),
            bigquery.SchemaField("latency_ms", "INTEGER", mode="REQUIRED"),
            bigquery.SchemaField("breach", "BOOLEAN", mode="REQUIRED"),
            bigquery.SchemaField("breach_key", "STRING", mode="NULLABLE"),
        ],
        "quality_trend_events": [
            bigquery.SchemaField("event_id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("observed_at", "TIMESTAMP", mode="REQUIRED"),
            bigquery.SchemaField("metric_name", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("metric_value", "FLOAT", mode="REQUIRED"),
            bigquery.SchemaField("threshold", "FLOAT", mode="REQUIRED"),
            bigquery.SchemaField("breach", "BOOLEAN", mode="REQUIRED"),
             bigquery.SchemaField("breach_key", "STRING", mode="NULLABLE"),
        ],
        "incident_events": [
            bigquery.SchemaField("incident_id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("created_at", "TIMESTAMP", mode="REQUIRED"),
            bigquery.SchemaField("resolved_at", "TIMESTAMP", mode="NULLABLE"),
            bigquery.SchemaField("title", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("status", "STRING", mode="REQUIRED"),
             bigquery.SchemaField("severity", "STRING", mode="REQUIRED"),
        ]
    }

    for table_name, schema in tables.items():
        table_ref = dataset_ref.table(table_name)
        try:
            client.get_table(table_ref)
            print(f"Table {table_name} already exists.")
        except NotFound:
            table = bigquery.Table(table_ref, schema=schema)
            # Partition by day on observed_at/created_at
            if "observed_at" in [f.name for f in schema]:
                 table.time_partitioning = bigquery.TimePartitioning(
                    type_=bigquery.TimePartitioningType.DAY,
                    field="observed_at",
                    expiration_ms=90 * 24 * 60 * 60 * 1000 # 90 days retention
                )
            elif "created_at" in [f.name for f in schema]:
                 table.time_partitioning = bigquery.TimePartitioning(
                    type_=bigquery.TimePartitioningType.DAY,
                    field="created_at",
                     expiration_ms=365 * 24 * 60 * 60 * 1000 # 1 year retention
                )

            table = client.create_table(table)
            print(f"Created table {table.project}.{table.dataset_id}.{table.table_id} with partitioning and retention.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Setup BigQuery for VibeCity Observability")
    parser.add_argument("--project", required=True, help="Google Cloud Project ID")
    parser.add_argument("--dataset", required=True, help="BigQuery Dataset ID")
    parser.add_argument("--location", default="US", help="Dataset Location")

    args = parser.parse_args()

    setup_bigquery(args.project, args.dataset, args.location)
