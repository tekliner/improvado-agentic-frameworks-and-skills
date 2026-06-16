---
name: discovery
description: |
  AUTO-INVOKE when user asks to see, fetch, or check current/live/real-time data
  from any ad platform (Facebook/Meta, Google Ads, TikTok, LinkedIn, Pinterest,
  Bing, Snap, X, GA4, Google Sheets, etc.), inspect ad accounts/campaigns/ads,
  pull insights directly from a platform, or any task that requires calling
  `discoveryRequestTool`, `discoveryListConnectorsTool`, or
  `discoveryListAccountsTool`. Trigger phrases include: "current campaigns",
  "live data", "real-time metrics", "show me <platform> ads", "fetch from
  <platform> API", "what's in my <platform>", "check <platform> insights". Use
  BEFORE any direct platform API call — the skill defines the mandatory
  URL/version protocol.
version: "1.1.0"
---
## Discovery Integration

## 🎯 IMPORTANT: Discovery API is for IMMEDIATE/ONE-TIME Data Access
Discovery API tools are designed for:
- **Quick, one-time data queries** ("show me current campaigns")
- **Testing and exploration** of API endpoints
- **Real-time data validation**
- **Immediate data needs** without scheduling

⚠️ If the user wants to:
- Set up **recurring** data extraction
- Create **scheduled** pipelines
- **Automate** data collection
  → Use Improvado Extract/Load Tools instead (see Improvado Tools section)

You can access Discovery data through the following tools:

IMPORTANT: Do not make up any links or documentation, always use the links from tools or chat context.

1. **discoveryRequestTool**: Make requests to Discovery API with specified credentials and data source.
  - Parameters:
    - dataSource: string (Data source to use for the request)
    - connectorId: string (Connector ID to use for the request)
    - request: object (HTTP request payload)
      - method: 'get', 'post', 'head', 'options'
      - url: string | { address: string, encoded: string }
      - params?: Record<string, any> (Query parameters)
      - data?: any (Data body for POST query)
      - json?: any (JSON body for POST query)
      - headers?: Record<string, string> (HTTP headers)

2. **discoveryListConnectorsTool**: List all connectors for a given data source.
  - Parameters:
    - dataSource: string

3. **discoveryWebSearchTool**: Search the web for current information and API documentation.
  - Parameters:
    - query: string

4. **retrieveDocumentationTool**: Retrieve documentation for a given url.
  - Parameters:
    - url: string


Important guidelines for using Discovery tools:
- Always ask user to select the data source if not provided.
- Always ask user to select the Connector, do not make up your own connectors and don't make any assumptions.
- Follow the flow sequence: Version discovery → Endpoint documentation → Connector selection → API request.
- NEVER guess API versions. ALWAYS follow the API Version Discovery Protocol below to find the correct latest version first.
- Always verify the API specification and examples before making the actual request.
- Provide clear and short explanations of the API response in the UI.
- Always use the url from the documentation or chat context, never make up your own url.
- Always use full url, never use relative url.

## API Version Discovery Protocol

CRITICAL: Before making ANY Discovery API request, you MUST determine the correct latest API version. Do NOT guess or assume versions.

### Step 1 — Search for version info using targeted queries

Use discoveryWebSearchTool with these targeted queries (try in order, stop when you find an authoritative result):
1. "<data source> API changelog latest version" — append site:<official_domain> if you know the official developer domain
2. "<data source> API deprecation sunset dates"
3. "<data source> API release notes" — include the current year for recency

Prioritize results from official developer domains such as developers.google.com, developers.facebook.com, learn.microsoft.com, business-api.tiktok.com, developers.pinterest.com, developers.snap.com, developer.x.com, etc.

Example: for Google Ads, a query like "Google Ads API sunset dates site:developers.google.com" should lead to the official sunset schedule page (e.g. https://developers.google.com/google-ads/api/docs/sunset-dates). For Facebook, "Facebook Graph API changelog site:developers.facebook.com" leads to the changelog (e.g. https://developers.facebook.com/docs/graph-api/changelog).

### Step 2 — Extract and verify the version

Once you find a relevant official page from search results:
1. Use retrieveDocumentationTool to fetch the full page content
2. Extract the latest non-deprecated/non-sunset version from the page
3. State the found version AND its source URL to the user before proceeding

### Step 3 — Verification Rules

- ALWAYS prioritize official developer documentation over third-party blogs or tutorials
- If you find the version from an official source, stop searching — do not second-guess it
- NEVER trust API versions mentioned only in blog posts without verifying against official docs
- If you cannot determine the version from any source, ask the user before proceeding

### Common API Version Formats

Format shapes only — resolve the concrete number via the protocol above.

- Google Ads: `v<N>` (e.g. `v24`)
- Facebook / Meta Graph API: `v<N.0>` (e.g. `v24.0`)
- LinkedIn Marketing API: `YYYYMM` (e.g. `202605`, monthly cadence)
- TikTok Ads: `v<N.N>` (e.g. `v1.3`)
- Pinterest Ads: `v<N>` (e.g. `v5`)
- Google Analytics 4: `v1beta` (stable)
- Google Sheets: `v4` (stable)

## Handling Unknown DataSources

IMPORTANT: When the user requests an unknown data source:

1. First, check what data sources are actually available for the user by running this query:
   ```sql
   ch-query "SELECT DISTINCT datasource_name, COUNT(*) as cnt
            FROM src_improvado_datasource_accounts
            GROUP BY datasource_name
            ORDER BY cnt DESC"
   ```

2. Common datasource name mappings:
  - "Google Analytics 4", "GA4", "GA" → analyticsdata
  - "Google Ads" → google_ads_ql
  - "Facebook", "Meta" → facebook
  - "Google Campaign Manager" → google_cm
  - "Google DV360" → google_dbm
  - "TikTok" → tiktok_ads
  - "Pinterest" → pinterest_ads
  - "Google Sheets" → google_sheets

3. If the requested datasource matches one from the query results (like analyticsdata for GA4):
  - Use discoveryListConnectorsTool with the correct datasource name to get connections
  - Then use discoveryListAccountsTool to find accounts for selected connection
  - Use discoveryWebSearchTool to find API documentation

4. Example flow for Google Analytics 4:
  - User asks for "Google Analytics 4 API"
  - Run the ch-query → find "analyticsdata" in results
  - Use discoveryWebSearchTool with "Google Analytics 4 API documentation"
  - Use discoveryListConnectorsTool to get connections for "analyticsdata"
  - Use discoveryListAccountsTool with selected connection_id to get accounts
  - Continue with normal flow using found documentation

5. NEVER try random datasources from the error message. If the exact datasource is not found:
  - Check real datasources from the query
  - Use discoveryWebSearchTool for documentation
  - Help user understand which datasources they have access to

## Data Presentation Guidelines

### When User Requests Available Endpoints:
When the user asks about available endpoints or API methods, ALWAYS present the results in a well-formatted markdown table:

| Endpoint | Method | Description | Required Parameters |
|----------|--------|-------------|---------------------|
| /endpoint1 | GET | Description of what the endpoint does | param1, param2 |
| /endpoint2 | POST | Purpose of this endpoint | param1, param3 |

For each endpoint include:
- Full path (relative to base URL)
- HTTP method (GET, POST, PUT, DELETE)
- Brief description of what the endpoint does
- Key required parameters

### When User Requests Available Fields:
When the user asks about available fields from an endpoint, ALWAYS present the results in a well-formatted markdown table:

| Field Name | Data Type | Required | Description | Example Value |
|------------|-----------|----------|-------------|---------------|
| id | string | Yes | Unique identifier | "abc123" |
| name | string | Yes | Name of the resource | "Campaign Name" |
| status | enum | No | Current status | "ACTIVE", "PAUSED" |
| impressions | integer | No | Number of impressions | 12345 |

Group fields by category when appropriate:
- Basic fields (id, name, status)
- Metrics (impressions, clicks, conversions)
- Settings (bidding, targeting, scheduling)
- Timestamps (created_at, updated_at)

For large responses with many fields, limit the initial display to the most important fields and offer to show more if needed.

# Flow Examples

Here some examples of how to use the tools and interact with the user.
Be free to use your own flow and tools from discovery tools.

## Example of making a Discovery API request using documentation from the web:

// Step 1: Determine the correct API version via the Version Discovery Protocol
// Search for changelog/sunset-dates on the official developer domain
const versionSearch = await discoveryWebSearchTool({
  query: "<data source> API changelog latest version site:<official_domain>"
});
// Use retrieveDocumentationTool on the most relevant official result
const versionInfo = await retrieveDocumentationTool({
  url: "<best official URL from search results>"
});
// Extract the latest non-deprecated version from the page
// State the found version AND source URL to the user before proceeding.

// Step 2: Search for endpoint documentation WITH the verified version
const docs = await discoveryWebSearchTool({
  query: "<data source> API <verified_version> <endpoint> documentation"
});
// Use retrieveDocumentationTool to get the full documentation for the most relevant url

// Step 3: List available connectors and ask user to select
const connectors = await discoveryListConnectorsTool({
query: "<query>",
dataSource: "<data source>" # required,
apiVersion: "<api version>" # optional
});

// Ask user to select the connector id from the list of connectors

Some discovery api endpoints require additional information from Account, you can list available accounts using discoveryListAccountsTool.

// List available accounts
const accounts = await discoveryListAccountsTool({
  connection_id: "<connection_id>",
  is_active: true,
  page_size: 25,
  page: <page_number>
});

// Step 4: Make the API request using chat history as context
// Do not make up url, always use the url from the documentation or chat context.
// Do not make up versions, always use the version confirmed in Step 1.
const response = await discoveryRequestTool({
  dataSource: "<data source>",
  connectorId: "selected_connector_id",
  request: {
    method: "get",
    url: "https://<domain>/<verified_api_version>/<endpoint>", // always use full url from the documentation or chat context
    params: {
      // Add any required parameters
    }
  }
});

IMPORTANT: Some discovery API endponts require additional information, here is the list of requirements:

- google_ads_ql: Required customer_id from Account.item property as 'login-customer-id' header.
- bing: Required next headers: 'CustomerAccountId' with Account.account_id value, CustomerId: with Account.customer_id value and 'DeveloperToken' with '{{ common_secret.dev_token }}' template value.

## Example of using direct link to documentation

1. User asks for documentation for the url: https://developer.x.com/en/docs/x-api
2. You can use retrieveDocumentationTool to get the documentation for the url,
   but do not make up any links, always use the links from the documentation, tools or chat context.

## Google Sheets Quick Access Guide

### To connect to any Google Spreadsheet via Discovery API:

1. **Get available Google Sheets connectors:**
   ```javascript
   discoveryListConnectorsTool({ dataSource: "google_sheets" })
   ```

2. **CRITICAL: Ask user to select connector** (different connectors access different Google accounts):
  - Show connector names and IDs
  - Ask: "Which Google Sheets connector would you like to use?"
  - User MUST confirm selection - never assume!

3. **Get spreadsheet structure (sheets list):**
   ```javascript
   discoveryRequestTool({
     dataSource: "google_sheets",
     connectorId: "USER_SELECTED_CONNECTOR_ID",
     request: {
       method: "get",
       url: "https://sheets.googleapis.com/v4/spreadsheets/SPREADSHEET_ID",
       params: { fields: "sheets(properties(sheetId,title))" }
     }
   })
   ```
   Returns: Array of sheets with title and sheetId

4. **Get sheet content:**
   ```javascript
   discoveryRequestTool({
     dataSource: "google_sheets",
     connectorId: "USER_SELECTED_CONNECTOR_ID",
     request: {
       method: "get",
       url: "https://sheets.googleapis.com/v4/spreadsheets/SPREADSHEET_ID/values/SHEET_NAME",
       params: {}
     }
   })
   ```
   Returns: Values array with all cell data

**Extract SPREADSHEET_ID from URL:** https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
