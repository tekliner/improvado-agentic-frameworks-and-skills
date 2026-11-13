# Improvado MCP: connect AI agents to marketing analytics data

Improvado MCP is a hosted, remote Model Context Protocol server for marketing analytics. It connects a compatible AI client to data available in your signed-in Improvado workspace. Your account permissions and connected sources determine what the client can access. The server implementation is not published in these repositories.

## What you can do

- Ask which marketing data sources are available to your account.
- Ask about cross-channel spend and performance in data already connected to Improvado.
- Request a summary or comparison through a compatible AI client, when the required data and tools are available.

Example questions to try after connecting:

- "Which marketing data sources can I access in my Improvado workspace?"
- "Compare spend by channel for the last 30 days using data I can access."
- "Summarize last week's Google Ads and Meta Ads performance, if both sources are connected."

These are example questions, not sample results or a promise that every account has those sources.

## Before you start

- An Improvado account with access to the workspace you want to use.
- An MCP client that supports remote HTTP servers and OAuth sign-in.
- The server URL for your account. Standard accounts use `https://report.improvado.io/experimental/agent/api/mcp-customer/v1/invoke/`. If your company uses a custom Improvado domain, replace `report.improvado.io` with that domain.

This URL is already published in the [official Improvado MCP guide](https://improvado.io/docs-section-topic/improvado-mcp). Sign in through your MCP client's OAuth flow. Do not put passwords, tokens, or client secrets into this repository or a shared configuration file.

## Claude Desktop

1. Open **Customize > Connectors** and choose **Add custom connector**.
2. Paste your server URL and select **Connect**.
3. Complete the Improvado sign-in prompt.

## Claude Code

Run this command for a standard Improvado account:

```bash
claude mcp add --transport http improvado https://report.improvado.io/experimental/agent/api/mcp-customer/v1/invoke/
```

Use your custom Improvado domain in the URL if your account requires one. Open Claude Code and complete the Improvado OAuth prompt when you connect.

## Check the connection

Ask your connected client which marketing data sources your account can access. If sign-in fails, confirm your domain and account access, then follow the [official setup guide](https://improvado.io/docs-section-topic/improvado-mcp).

For setup in other clients, use the [official Improvado MCP guide](https://improvado.io/docs-section-topic/improvado-mcp). This guide contains connection instructions and broad use cases only. It contains no server code, customer data, example campaign results, or credentials.
