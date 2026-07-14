# AI Chat SaaS Product Report

## Executive Summary

AI Chat SaaS is a multi-tenant customer support and intelligent chat platform for websites. It gives businesses an embeddable chat widget, a management panel, human support workflows, AI-assisted replies, website knowledge ingestion, and SaaS administration tools in one product.

The product is designed for companies that want to answer website visitors faster without replacing human support entirely. A visitor can ask a question through the widget. If support staff are online, the conversation can be handled by an admin or agent. If support is offline and AI auto-reply is enabled, the system can answer from the customer's approved knowledge and website content. If AI is not confident, the question is logged so the business can improve its knowledge base.

In simple terms, this project is a support chat SaaS with an AI layer, human handoff, customer management, plans, reporting, and an embeddable widget.

## Product Nature

This is not only a chatbot. It is a complete customer support platform with three connected layers:

1. Public website chat:
   A lightweight widget that customers install on their websites.

2. Support operations panel:
   A web dashboard where admins and agents manage conversations, customers, sites, AI knowledge, team members, reports, and settings.

3. SaaS control plane:
   A super-admin area for managing customers, plans, sites, platform announcements, and business-level usage.

The product is built for B2B SaaS usage. One platform owner can sell the system to many businesses. Each business can connect one or more websites, manage its own support team, customize its widget, and maintain its own AI knowledge base.

## Core Value Proposition

For customers:

- Reduce missed website leads and support requests.
- Offer chat support directly on the website.
- Let AI answer common questions when humans are unavailable.
- Keep human agents in control for sensitive or complex conversations.
- Improve AI quality over time by reviewing unanswered questions.
- Customize chat branding per website.
- Track conversations, team activity, and usage.

For investors:

- Multi-tenant SaaS structure is already present.
- Plan-based monetization is built into the backend.
- Product has both AI and human-support workflows.
- The platform targets a broad market: online shops, service businesses, clinics, agencies, education providers, SaaS businesses, and local businesses.
- The architecture supports upsells such as more sites, more agents, higher monthly conversation limits, AI auto-reply, knowledge base, and advanced reporting.

## Target Customers

The product can be sold to:

- Online stores that need live chat and FAQ automation.
- Clinics, salons, and appointment-based businesses.
- Real estate, insurance, and consulting businesses.
- SaaS companies that need support chat on their marketing site.
- Educational businesses that answer repeated admission/course questions.
- Agencies that want to provide chat support software to their clients.
- Any business with repeated customer questions on its website.

## Main User Roles

### Super Admin

The super admin is the platform owner or internal SaaS operator.

Main capabilities:

- View platform dashboard statistics.
- Create and manage customer accounts.
- Assign subscription plans.
- Manage customer status.
- Manage customer websites.
- Create, update, activate, and deactivate plans.
- Reset user passwords.
- Enable or disable users/sites.
- Publish announcements to customers.
- Monitor overall usage and health of the platform.

### Customer Admin

The customer admin is the business owner or support manager for a customer account.

Main capabilities:

- View business dashboard.
- Manage own websites.
- Configure widget branding and AI mode.
- Manage support team members.
- Create quick replies.
- Manage knowledge base.
- Configure AI assistant settings.
- Add crawl sources and crawl website content.
- Review generated questions.
- Review unanswered AI questions.
- Add unanswered questions to the knowledge base.
- View subscription and usage.
- View reports.
- Read platform announcements.

### Agent

The agent is a support team member.

Main capabilities:

- See assigned or accessible conversations.
- Reply to visitors.
- Send attachments.
- Use quick replies.
- Generate AI suggested replies.
- Accept, edit, reject, or mark AI suggestions as used.
- Update conversation status.
- Close conversations.
- Update online/offline presence.
- Show typing status to visitors.

### Website Visitor

The visitor is the end user chatting from the customer's website.

Main capabilities:

- Open the chat widget.
- Submit name, phone, and email.
- Start or continue a conversation.
- Send text messages.
- Upload allowed attachments.
- Receive replies from support agents.
- Receive AI replies when enabled.
- See support online/offline status.
- See typing indicators.

## Customer-Facing Feature List

### Embeddable Website Chat Widget

The widget is a standalone JavaScript chat component that can be installed with a script tag using a `site_key`.

Features:

- Floating chat launcher.
- Branded chat window.
- Custom brand name.
- Custom brand color.
- Optional logo.
- Welcome message.
- Visitor start form.
- Name, phone, and email capture.
- Persistent browser identity through local storage.
- Conversation persistence through local storage.
- Message history loading.
- Visitor message sending.
- Attachment upload.
- Image and PDF attachment support.
- Unread message indicator.
- Agent/AI message display.
- Typing indicator.
- Support online/offline text.
- Conversation reset.
- Mobile-responsive layout.
- Shadow DOM isolation so website CSS does not break the widget.

The widget supports Persian/RTL presentation in the current implementation and uses a modern compact chat UI.

### Live Human Support Inbox

Businesses can receive and respond to website conversations from the panel.

Features:

- Conversation list.
- Conversation details.
- Visitor messages.
- Agent replies.
- AI replies shown in the same conversation history.
- Conversation assignment.
- Assigned agent tracking.
- Conversation status updates.
- Conversation closing.
- Latest message timestamp tracking.
- Source page URL and source page title capture.
- Message attachments.
- Quick replies.
- Agent typing status.
- Agent online/offline presence.

This allows the business to operate the platform as a normal support inbox, even without AI.

### AI Reply Suggestions For Agents

Agents can ask the system to generate a suggested reply based on the visitor's latest message and the site's knowledge.

Features:

- Generates a draft reply for the latest visitor question.
- Uses manual knowledge, crawled website content, and generated question templates.
- Shows confidence level.
- Stores sources used for the suggestion.
- Creates or updates a pending suggestion.
- Lets agents mark suggestions as accepted, edited, rejected, or used.
- Logs AI answer attempts for analytics and review.
- Records low-confidence questions as unanswered.

This feature helps agents answer faster while keeping a human in control.

### AI Auto-Reply When Support Is Offline

The product can automatically respond to visitors when support staff are offline.

Features:

- Auto-reply can be enabled or disabled per site.
- AI assistant can be enabled or disabled per site.
- Auto-reply respects support online status.
- If any active agent/admin is online recently, AI auto-reply is skipped.
- Confidence threshold controls when AI is allowed to answer.
- Fallback message is used when confidence is too low.
- Duplicate AI replies for the same visitor message are prevented.
- All replies and fallback decisions are logged.
- Low-confidence questions are saved for later review.

This keeps the customer experience active outside working hours without fully removing human support.

### Website Knowledge Crawler

Customer admins can crawl their website to build AI knowledge.

Supported crawl sources:

- Exact URL.
- Path prefix.
- Sitemap.

Crawler behavior:

- Fetches website pages.
- Extracts title, meta description, H1, readable text, and links.
- Keeps crawling within the customer's own domain.
- Supports page limits and depth limits.
- Cleans page text.
- Splits text into searchable chunks.
- Extracts terms/keywords.
- Generates likely questions from content.
- Stores crawl run statistics.
- Tracks fetched pages, failed pages, created chunks, created terms, and generated questions.

This reduces setup friction because a customer can import useful website knowledge instead of manually writing every FAQ.

### Manual Knowledge Base

Customer admins can add and manage manual knowledge.

Features:

- Create knowledge sources.
- List knowledge sources.
- Delete knowledge sources.
- Manage AI knowledge sources.
- Store FAQs, answers, text content, URLs, and status.
- Give manual knowledge priority in AI matching.

Manual knowledge is valuable because it lets a business curate precise answers for pricing, policies, delivery, services, working hours, and common questions.

### Unanswered Question Review Loop

When AI cannot answer confidently, the system stores the question for review.

Features:

- Saves unanswered visitor questions.
- Stores detected category and intent.
- Stores best match score.
- Stores best attempted sources.
- Lets customer admins review unanswered questions.
- Lets customer admins update unanswered question status.
- Lets customer admins add unanswered questions to knowledge.

This creates a learning workflow: every failed AI answer can become future knowledge.

### Quick Replies

Customer admins can create predefined replies for agents.

Features:

- Create quick replies.
- List quick replies.
- Delete quick replies.
- Agents can use quick replies during conversations.

Quick replies improve speed and consistency for repeated support answers.

### Team Management

Customer admins can manage support users.

Features:

- Add agents.
- Assign agents to selected sites.
- List team members.
- Respect plan agent limits.
- Store agent contact information.
- Enable role-based access.

This supports real support teams rather than only single-user chat.

### Widget Branding And Site Settings

Each customer site can have its own widget configuration.

Settings:

- Brand name.
- Brand color.
- Logo URL.
- Welcome message.
- AI mode.
- Site domain.
- Site key.
- Active/inactive state.

AI modes:

- `off`: AI disabled for the site.
- `assistant`: AI assistant mode enabled.
- `semi_auto`: semi-automated mode available in settings.

### Plans And Subscription Limits

The platform supports plan-based monetization.

Plan capabilities:

- Maximum number of sites.
- Maximum number of agents.
- Maximum monthly conversations.
- AI suggestions enabled/disabled.
- AI auto-reply enabled/disabled.
- Knowledge base enabled/disabled.
- Active/inactive plan status.

Usage enforcement:

- New conversations are checked against monthly conversation limits.
- New agents are checked against agent limits.
- AI suggestion access checks plan features.
- Customer plan status affects access.

This makes the product ready for tiered pricing.

### Reports And Dashboards

The system includes reporting and dashboard endpoints/pages.

Customer reporting:

- Conversation summaries.
- Usage summaries.
- Plan usage.
- AI overview.
- Site-level business insights.

Super admin reporting:

- Total customers.
- Active/inactive/suspended customers.
- Sites total.
- Active sites.
- Conversations today.
- Messages today.
- Plan health.
- Latest tenants/customers.
- Usage by customer.

These reports help both the SaaS operator and customer admins understand product value.

### Platform Announcements

The platform includes announcement functionality.

Features:

- Super admin can create announcements.
- Super admin can update/delete announcements.
- Announcement images can be uploaded.
- Customer admins can view announcements.
- Customers can mark announcements as read or dismissed.

This is useful for product updates, billing notices, maintenance messages, and feature launches.

### Secure Attachments

Visitors and agents can upload files in conversations.

Allowed types:

- JPG/JPEG
- PNG
- GIF
- WebP
- PDF

Security controls:

- File size limit.
- MIME validation.
- Extension validation.
- Dangerous extension blocking.
- Script/HTML/SVG payload blocking.
- PDF active-content blocking.
- Image dimension checks.
- Random stored file names.
- Protected upload directories.

## Technical Feature List

### Backend

The backend is a plain PHP API using MySQL through PDO.

Backend features:

- Standalone PHP endpoints.
- Shared includes for auth, CORS, response handling, rate limits, uploads, AI, and site access.
- Environment-based configuration.
- JSON API responses.
- JWT authentication.
- Role-based authorization.
- Tenant and site access checks.
- Rate limiting.
- File upload validation.
- AI answer engine.
- Website crawler.
- Plan limit enforcement.
- Multi-tenant data separation.

### Frontend

The panel is built with Next.js and React.

Panel areas:

- Login.
- Dashboard.
- Conversations.
- Conversation detail.
- Knowledge.
- AI center.
- Widget settings.
- Team.
- Quick replies.
- Reports.
- Subscription.
- Security.
- Announcements.
- Super admin dashboard.
- Super admin customers.
- Super admin customer detail.
- Super admin customer creation.
- Super admin plans.
- Super admin sites.
- Super admin announcements.
- Blog/content pages.

### Widget

The widget is JavaScript and CSS bundled into an embeddable script.

Widget technical features:

- Shadow DOM encapsulation.
- Configurable API base.
- Configurable site key.
- Local storage persistence.
- Polling for new messages.
- Polling for typing status.
- Client-side attachment validation.
- Message rendering by sender type.
- Responsive floating window.
- Brand color theming.

## AI System Details

The current active AI system is a local knowledge-based assistant. It does not depend on an external model for every reply in the active flow.

Knowledge sources used:

- Manual knowledge entries.
- Crawled website pages.
- Text chunks from pages.
- Extracted keywords/terms.
- Generated questions from page chunks.

How AI finds an answer:

1. Normalize the visitor question.
2. Extract meaningful tokens.
3. Detect rough intent and category.
4. Search manual knowledge.
5. Search generated questions.
6. Search crawled content chunks.
7. Score all candidates.
8. Boost high-quality sources such as manual knowledge.
9. Select the best source.
10. Build a short answer from the matched content.
11. Return confidence score and sources.

Detected categories/intents include examples such as:

- Pricing.
- Contact/location.
- Appointment/booking.
- Shipping/delivery.
- FAQ.
- Service information.
- General information.

This approach is practical for controlled support answers because it keeps replies grounded in customer-provided content.

## Business Workflows

### New Customer Setup

1. Super admin creates a customer.
2. Super admin selects a plan.
3. Super admin creates the first site.
4. System generates a site key.
5. System creates a customer admin user.
6. Customer receives widget installation code.
7. Customer installs the widget on their website.
8. Customer configures branding and AI settings.
9. Customer adds manual knowledge or starts a crawl.
10. Agents begin handling conversations.

### Visitor Conversation Workflow

1. Visitor opens the widget.
2. Visitor enters contact details.
3. Visitor starts a conversation.
4. Visitor sends a question.
5. If support is online, staff can answer.
6. If support is offline and AI auto-reply is enabled, AI may answer.
7. If AI cannot answer well, fallback text is sent and the question is saved.
8. Agent/admin can later continue the conversation.

### Agent Workflow

1. Agent logs in.
2. Agent marks presence online.
3. Agent opens conversation list.
4. Agent reads visitor message.
5. Agent sends a manual reply, quick reply, or AI suggested reply.
6. Agent updates status or closes the conversation.

### AI Improvement Workflow

1. Customer adds website crawl sources.
2. Customer starts crawl.
3. System builds searchable content.
4. AI answers from that knowledge.
5. Low-confidence questions are stored.
6. Customer reviews unanswered questions.
7. Customer adds new knowledge.
8. Future answer quality improves.

## Monetization Potential

The system can support several pricing levers:

- Number of websites.
- Number of agents.
- Monthly conversations.
- AI suggestions.
- AI auto-reply.
- Knowledge base and website crawler.
- Advanced reporting.
- White-label widget branding.
- Priority support.
- Agency/reseller plans.

Example plan structure:

- Starter: one site, limited conversations, manual chat, basic widget.
- Growth: multiple agents, AI suggestions, knowledge base.
- Pro: higher conversation limits, auto-reply, crawler, reports.
- Agency: multiple customer accounts/sites, high limits, white-label options.

## Competitive Positioning

The product sits between traditional live chat tools and pure AI chatbots.

Strengths:

- Human support and AI support are both included.
- AI is grounded in customer knowledge.
- Customers can review unanswered questions and improve the system.
- The platform is multi-tenant from the beginning.
- The widget can be installed on external customer sites.
- The SaaS owner can manage customers, plans, and platform announcements.

Positioning sentence:

AI Chat SaaS helps businesses turn their website into an always-available support and lead-capture channel, combining live human chat with controlled AI answers from the business's own knowledge.

## Demo Narrative For Customers

A strong customer demo can follow this flow:

1. Show the website widget.
2. Open the widget and show custom branding.
3. Start a visitor conversation.
4. Send a normal support question.
5. Show the conversation appearing in the panel.
6. Reply as an agent.
7. Show typing and message updates in the widget.
8. Generate an AI suggestion for the agent.
9. Accept or use the AI suggestion.
10. Turn support offline and demonstrate AI auto-reply.
11. Show knowledge management and website crawling.
12. Show unanswered question review.
13. Show reports and plan usage.

## Demo Narrative For Investors

A strong investor demo can focus on business scalability:

1. Start in the super admin dashboard.
2. Show customer/tenant management.
3. Show plan creation and plan limits.
4. Create or inspect a customer.
5. Show the customer's website configuration.
6. Show the widget installed on a test site.
7. Show a live visitor conversation.
8. Show AI suggestion and auto-reply.
9. Show knowledge ingestion and unanswered question loop.
10. Show how the product can be sold as tiered SaaS.

## Security And Reliability Highlights

The product includes several important production-minded controls:

- JWT-based login.
- Token revocation through token versions.
- Password hashing.
- Role-based access.
- Tenant/site access checks.
- Active tenant and active site checks.
- Rate limits for login and public widget actions.
- Separate CORS rules for panel and widget APIs.
- Widget origin validation against allowed domains.
- Upload validation and dangerous file blocking.
- Standard security headers.
- Conversation limits by plan.
- Agent/site assignment controls.

These features are important for customer trust and investor confidence.

## Current Readiness

The product is suitable for an initial customer/investor demonstration because it already includes:

- SaaS roles.
- Customer onboarding flow.
- Embeddable widget.
- Live conversation workflow.
- Agent replies.
- AI suggestions.
- Offline AI auto-reply.
- Knowledge base.
- Website crawler.
- Unanswered question loop.
- Reports.
- Plan management.
- Team management.
- Widget branding.
- Security and rate-limit foundations.

## Important Notes Before Commercial Launch

These items should be reviewed before a large production launch:

- Confirm the complete base database schema and migrations are packaged with the project.
- Audit all plan limits endpoint by endpoint.
- Review production CORS and widget allowed origins.
- Replace default/local environment values.
- Use a strong production `JWT_SECRET`.
- Review crawler SSL verification behavior.
- Consider moving larger crawls to background jobs.
- Add automated tests for critical flows.
- Confirm upload public path and storage protection in the production host.
- Verify all Persian text encoding in the deployment environment.
- Add billing/payment integration if selling self-service subscriptions.
- Add monitoring, logging, backups, and error tracking.

## Summary

AI Chat SaaS is a complete initial product for intelligent website support. It combines an embeddable chat widget, human support inbox, AI-assisted replies, offline AI auto-response, website knowledge crawling, manual knowledge management, team workflows, reports, plan limits, and super-admin SaaS management.

The most important product advantage is balance: businesses can use AI to reduce response time and handle repetitive questions, but human admins and agents remain in control. This makes the product easier to trust, easier to sell, and more practical for real customer support than a fully autonomous chatbot.
