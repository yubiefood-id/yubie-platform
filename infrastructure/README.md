# Infrastructure contract

The web application targets the existing Vinext/Cloudflare-compatible artifact contract. The API is a standards-based Fetch handler and can run in a Worker-style runtime or behind the included Node adapter.

Production environments should provide secrets through the hosting platform, never repository files. Expected future values include commerce credentials, webhook secrets, database bindings, transactional messaging credentials, and observability endpoints.

Recommended environments: `preview`, `production`. Each must use separate payment keys and data stores. Production promotion requires a green CI run and explicit approval for any change touching checkout, claims, customer data, or workflows.
