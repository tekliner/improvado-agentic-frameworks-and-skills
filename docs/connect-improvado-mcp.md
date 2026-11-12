# Connect the Improvado MCP server

The Improvado MCP server lets an AI agent work with your Improvado workspace: ask questions about ads, CRM and analytics data, inspect connections and extracts, and build reports, in plain language.

- **Server address:** `https://report.improvado.io/experimental/agent/api/mcp-customer/v1/invoke/`
- **Transport:** Streamable HTTP
- **Sign-in:** OAuth 2.1 with your Improvado login. No API keys to manage.
- **Access:** requires an Improvado account. Existing customers sign in with their Improvado login. Not a customer yet? [Talk to us](https://improvado.io/register/talk-to-an-expert?utm_source=github&utm_medium=referral&utm_campaign=mcp_distribution).
- **Official guide:** [improvado.io/docs-section-topic/improvado-mcp](https://improvado.io/docs-section-topic/improvado-mcp)
- **MCP Registry name:** `io.improvado/mcp`

If your company uses a white-label Improvado domain, replace `report.improvado.io` with your domain.

## ChatGPT

1. Click **Apps** in the left sidebar and search for **Improvado**.
2. Select **Improvado AI Agent**, then **Connect**.
3. Sign in with your Improvado account.

## Claude (web and desktop)

1. Open **Customize → Connectors** and click **Add custom connector**.
2. Paste the server address above.
3. Click **Connect** and sign in with your Improvado account.

## Claude Code

Add the server:

```bash
claude mcp add --transport http improvado https://report.improvado.io/experimental/agent/api/mcp-customer/v1/invoke/
```

Or install the plugin, which adds the server plus Improvado marketing skills:

```bash
claude plugin marketplace add tekliner/improvado-agentic-frameworks-and-skills
claude plugin install improvado-agentic-frameworks-and-skills@improvado
```

You sign in through OAuth the first time a tool runs.

## Codex

```bash
codex plugin marketplace add tekliner/improvado-agentic-frameworks-and-skills --ref master
codex plugin add improvado-agentic-frameworks-and-skills@improvado
```

## Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "improvado": {
      "url": "https://report.improvado.io/experimental/agent/api/mcp-customer/v1/invoke/"
    }
  }
}
```

## VS Code with GitHub Copilot

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "improvado": {
      "type": "http",
      "url": "https://report.improvado.io/experimental/agent/api/mcp-customer/v1/invoke/"
    }
  }
}
```

## Gemini CLI

Install the extension from this repository:

```bash
gemini extensions install https://github.com/tekliner/improvado-agentic-frameworks-and-skills
```

Or add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "improvado": {
      "url": "https://report.improvado.io/experimental/agent/api/mcp-customer/v1/invoke/",
      "type": "http",
      "oauth": {
        "scopes": ["mcp:customer"]
      }
    }
  }
}
```

Then run `/mcp auth improvado` in a chat session.

## Google Antigravity

Open **Settings → MCP servers → Manage MCP servers**, add the same JSON block as for Gemini CLI, save and reload. Authorize in the browser.

## Perplexity

On plans that support custom connectors, add a custom connector in **Settings** with the server address above and sign in with your Improvado account.

## Microsoft Copilot Studio and Microsoft 365 Copilot

These need an OAuth client ID and secret from your Improvado customer success manager. Follow the step-by-step setup in the [official guide](https://improvado.io/docs-section-topic/improvado-mcp).

## What to ask first

- "Which Improvado workspace am I in, and which data sources are connected?"
- "Show ad spend by channel for the last 30 days."
- "Compare ROAS across Google Ads, Meta and LinkedIn this month."

## Privacy, terms and support

- [Privacy policy](https://improvado.io/company-legal/privacy-policy)
- [Terms of use](https://improvado.io/legal/terms-of-use)
- Support: [support@improvado.io](mailto:support@improvado.io)
