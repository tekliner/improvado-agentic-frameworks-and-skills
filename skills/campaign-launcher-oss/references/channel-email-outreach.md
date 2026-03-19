# Email Outreach Channel

Supports three providers: Lemlist (most feature-rich), Resend (simplest), SendGrid (enterprise).

## Provider: Lemlist

### Auth
Basic auth with empty username:
```
Authorization: Basic base64(":" + LEMLIST_API_KEY)
```

### Campaign Creation
```
POST https://api.lemlist.com/api/campaigns
{
  "name": "{campaign_name}"
}
```

### Add Sequence Steps
```
POST https://api.lemlist.com/api/campaigns/{campaign_id}/sequences
{
  "type": "email",  // or "linkedinInvite", "linkedinSend"
  "delay": 0,  // days after previous step
  "subject": "{email_subject}",
  "html": "{email_body_html}"
}
```

### Add Leads (CRITICAL: set all custom variables during creation)
```
POST https://api.lemlist.com/api/campaigns/{campaign_id}/leads/{email}
{
  "firstName": "{first_name}",
  "lastName": "{last_name}",
  "companyName": "{company}",
  "linkedinUrl": "{linkedin_url}",
  "customVariable1": "value1"
}
```
Auth: `("", api_key)` — empty username, API key as password.

CRITICAL: Custom variables can ONLY be set during lead creation, not updated later.

### Rate Limiting
- Safe: 3 parallel requests (~8 leads/sec)
- 429 errors: exponential backoff (2^attempt seconds, max 4 retries)
- Common rejections: graveyard (~6%), duplicate, invalid email

### Lead Source
For OSS version, leads come from CSV files. CSV columns map to Lemlist fields:
`email, firstName, lastName, companyName, linkedinUrl, title` + any custom columns.

### Sequence Patterns
| Pattern | Steps |
|---------|-------|
| LinkedIn-only | linkedinInvite (day 0) → linkedinSend (day 3) |
| Email-only | email (day 0) → email follow-up (day 3) |
| Multichannel | linkedinInvite (day 0) → email (day 2) → follow-up (day 5) |

### Pause/Resume
```
POST https://api.lemlist.com/api/campaigns/{campaign_id}/status
{"status": "paused"}  // or "running"
```

## Provider: Resend

Simplest option. Free tier: 100 emails/day.

### Send Email
```
POST https://api.resend.com/emails
Authorization: Bearer {RESEND_API_KEY}
{
  "from": "you@yourdomain.com",
  "to": ["{recipient_email}"],
  "subject": "{subject}",
  "html": "{body_html}"
}
```

### Sequence Implementation
Resend has no built-in sequences. The skill manages timing:
1. Send initial email
2. Track sent emails in `{output_dir}/EXP-{id}/email-log.csv`
3. For follow-ups, read the log and send to recipients who haven't replied
4. User triggers each follow-up step manually ("send follow-up")

### Lead Source
CSV file with columns: `email, firstName, lastName, companyName`

## Provider: SendGrid

### Send Email
```
POST https://api.sendgrid.com/v3/mail/send
Authorization: Bearer {SENDGRID_API_KEY}
{
  "personalizations": [{"to": [{"email": "{recipient}"}]}],
  "from": {"email": "you@yourdomain.com"},
  "subject": "{subject}",
  "content": [{"type": "text/html", "value": "{body_html}"}]
}
```

Same manual sequence approach as Resend.

## Message Personalization
Use `{{firstName}}`, `{{companyName}}` tokens in templates. The skill replaces them from lead CSV data before sending (for Resend/SendGrid) or sets them as Lemlist variables (for Lemlist).

## LinkedIn Limits
- LinkedIn invite note: ~300 characters max
- Only available via Lemlist (requires connected LinkedIn account in Lemlist)
