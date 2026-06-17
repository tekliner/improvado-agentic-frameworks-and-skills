---
name: flat-data-file-import
description: File import workflow - upload CSV/Excel/TSV files, set up email-based, managed SFTP, or managed S3 file import into Improvado
---

## File Import Tools (Flat Data)

When a user wants to import a file (CSV, Excel, TSV, etc.) into Improvado, use these tools.

**Routing rules:**
- If the user mentions **SFTP** → use the **Managed SFTP Workflow** directly (datasourceName: "managed_sftp")
- If the user mentions **S3** or **AWS S3** → use the **Managed S3 Workflow** directly (datasourceName: "managed_s3")
- If the user mentions **email import** → use the **Email Import Workflow** (datasourceName: "email_file_import")
- If the user **uploads a file** or says **file import** → use the **File Import Workflow** (datasourceName: "file_import")
- If unclear, ask which method they prefer: file upload, email, SFTP, or S3

### Available Tools

1. **getConnectionsTool** (existing) - Get the connection_id: `getConnectionsTool({ datasourceName: "file_import" })`
2. **uploadFlatDataFileTool** - Upload the file to DTS managed storage
   - **ALWAYS pass the attachment URL as fileUrl** — do NOT base64-encode file content
   - Handles multipart upload and antivirus scanning automatically
   - Returns file_path (used in all subsequent calls), file_name, and file_size
3. **discoverFileFieldsTool** - Discover field definitions and data sample from the uploaded file
   - Pass the connection_id from step 1 and file_path from step 2
   - Returns inferred field names, types, and data_sample (first rows of data)
4. **generateFlatDataSampleTool** - Generate a data preview with confirmed field definitions
   - Use after the user confirms or adjusts the discovered schema
5. **createFlatDataExtractTool** - Create the extract with the final configuration
   - Creates a persistent extract that stores the imported data
   - **data_table_title**: Propose a name based on the file name (e.g. "report.csv" → "report_csv_data"). Ask the user to confirm.
6. **uploadNewFileToExtractTool** - Upload a new file to an existing extract/data table
   - Use when the user wants to add/replace data in an existing data table
   - Requires: extract_id + file details from uploadFlatDataFileTool
   - Backend automatically triggers data processing
7. **previewEmailImportAddressTool** - Preview the email address for email-based file import
   - Shows what email address will be generated for a given data_table_title
   - The actual email is activated after the extract is created
8. **createConnectionTool** (existing) - Create a connection if none exists
   - For managed SFTP: `createConnectionTool({ data_source_name: "managed_sftp", auth_id: "login_password", params: { connection_name: "<name>" } })`
   - For managed S3: `createConnectionTool({ data_source_name: "managed_s3", auth_id: "login_password", params: { connection_name: "<name>" } })`
9. **getManagedConnectionCredentialsTool** - Fetch credentials for a managed SFTP or S3 connection
   - Returns: host, port, login, password
   - Use after getting/creating a managed_sftp or managed_s3 connection to show credentials to the user

---

## File Import Workflow

1. Call `getConnectionsTool({ datasourceName: "file_import" })` to get the connection_id
2. Call `uploadFlatDataFileTool` with fileUrl (from chat attachment) → get filepath
3. Call `discoverFileFieldsTool` with connection_id + filepath → get fields + data_sample
4. Analyze the data_sample and discovered fields:
   - Detect the file format and encoding
   - Identify if any top rows should be skipped (header offset)
   - For each field, determine: Type (Text, Number, DateKey), Is key (True/False - Fields used to merge new & existing data), and any skip rules
5. Call `generateFlatDataSampleTool` with the fields for a data preview
6. **Important:** Present the proposed schema to the user as a table with columns: Field Name, Type, Is key (dimension or property/metric), Sample Values. Propose a Data Table name based on the file name and Write Policy, then ask for confirmation.

   Example:
   ```
   | Field Name     | Type   | Is Key | Sample Values          |
   |----------------|--------|--------|------------------------|
   | date           | Date   | Yes    | 2024-01-15, 2024-01-16 |
   | campaign_name  | Text   | Yes    | Brand Campaign, Promo  |
   | impressions    | Number | No     | 15234, 8921            |
   | spend          | Number | No     | 150.50, 89.20          |

   Data Table Name: facebook_ads_performance
   Write Policy: Upsert (whole data)
   ```

7. After the user confirms (or edits), call `createFlatDataExtractTool` with the confirmed configuration
8. After extract creation succeeds, provide the user with a link to the created extract:

   ```
   | Resource | Link                                                                                          |
   |----------|-----------------------------------------------------------------------------------------------|
   | Extract  | {platform_host}/info_connector/overview/{connection_id}/{extract_id}?workspace={workspace_id}  |
   ```

   Example: `https://report.improvado.io/info_connector/overview/19417/1785798?workspace=12345`

   Use `connection_id` from step 1, `extract_id` from the createFlatDataExtractTool response, and the current workspace ID.

---

## Upload to Existing Data Table Workflow

1. Upload file with `uploadFlatDataFileTool` → get file_path, file_name, file_size
2. Call `uploadNewFileToExtractTool` with the extract_id and file details

---

## Email Import Workflow

The same File Import Workflow applies, except:
- Use `getConnectionsTool({ datasourceName: "email_file_import" })` instead of "file_import"
- After proposing a data_table_title, call `previewEmailImportAddressTool` to show the user the email address
- After `createFlatDataExtractTool` succeeds, the email becomes active — users can send files to it

---

## What is Managed SFTP / Managed S3?

Managed SFTP and Managed S3 are **Improvado-hosted** file ingestion endpoints. Improvado provisions and owns the SFTP/S3 server — the user does **NOT** provide their own server.

Flow: Improvado creates a connection → provides credentials (host, port, login, password) → the user uploads files to **Improvado's server** using those credentials → Improvado automatically ingests the data.

**NEVER** describe this as "connecting to the user's SFTP/S3 server" — it is the opposite: the user connects to **our** server.

---

## Managed SFTP Workflow (step by step — follow this order strictly)

**IMPORTANT:** Do NOT ask for data table name, file columns, or schema upfront. Follow these steps IN ORDER:

### Step 1 — Connection

1. Call `getConnectionsTool({ datasourceName: "managed_sftp" })` to check for existing connections.
2. If a connection exists, use it. If not, ask the user for a connection name, then create one:
   `createConnectionTool({ data_source_name: "managed_sftp", auth_id: "login_password", params: { connection_name: "<name>" } })`

### Step 2 — Sample file

Ask the user to upload a sample file (CSV/Excel/TSV) via chat attachment. This is required to discover the schema.

### Step 3 — File Import Workflow

Follow the standard File Import Workflow (upload → discover fields → confirm schema → create extract).
Use the `connection_id` from Step 1.

### Step 4 — Show credentials

After `createFlatDataExtractTool` succeeds:

1. Call `getManagedConnectionCredentialsTool({ data_source_name: "managed_sftp", connection_id })` to fetch SFTP credentials
2. Show the credentials and folder name to the user. The folder name is the snake_case version of the data_table_title (e.g. "My Sales Report" → `my_sales_report`).
3. **Password display**: mask the password with asterisks and wrap it in a `<details>` tag so the user can click to reveal:
   `<details><summary>••••••••</summary>actual_password</details>`

   Example:
   ```
   **SFTP Connection Credentials (Improvado-hosted):**
   | Field       | Value                          |
   |-------------|--------------------------------|
   | Host        | ftp.tools.improvado.io         |
   | Port        | 2022                           |
   | Login       | managed_1_26_my_data           |
   | Password    | <details><summary>••••••••</summary>ysUXysurE9TGhSvTAc4k</details> |
   | Folder      | my_sales_report                |

   | Resource | Link                                                                                          |
   |----------|-----------------------------------------------------------------------------------------------|
   | Extract  | {platform_host}/info_connector/overview/{connection_id}/{extract_id}?workspace={workspace_id}  |
   ```

   Upload your files to the folder above via SFTP using these credentials. Improvado will automatically process incoming files.

---

## Managed S3 Workflow (step by step — follow this order strictly)

Same steps as Managed SFTP Workflow above, except:
- Use `getConnectionsTool({ datasourceName: "managed_s3" })` instead of "managed_sftp"
- Use `createConnectionTool({ data_source_name: "managed_s3", auth_id: "login_password", params: { connection_name: "<name>" } })` if no connection exists
- Use `getManagedConnectionCredentialsTool({ data_source_name: "managed_s3", connection_id })` to fetch S3 credentials
- S3 credentials differ from SFTP — expect fields like bucket, access key, and secret key instead of host/port/username/password. Display whatever fields the API returns.

---

## Important Rules

- **Write Policy:** The default write policy is `{ method: "upsert", scope: "whole_data" }` which replaces all data on each file upload.
- **NEVER** try to base64-encode or stream file content. Always use the fileUrl from the chat attachment.
- **ALWAYS** ask for confirmation before creating the extract — present the schema table and proposed name first.
