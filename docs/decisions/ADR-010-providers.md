# ADR-010: Capability-based provider interfaces, labelled mocks
Status: Accepted (2026-10-07)
## Decision
Integrations implement capability interfaces (RepoProvider, CalendarProvider, MailProvider, SocialProvider, EventSourceProvider) that declare what they support. Mock providers are first-class, flagged `isMock`, and badged in the UI.
## Why
Vendors differ wildly in what their APIs allow; one mega-interface would force fake methods. Capabilities let the UI be honest.
