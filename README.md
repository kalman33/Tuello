# Tuello - Web Development & Testing Toolkit

Tuello is a comprehensive Chrome extension designed for web developers, QA engineers, and testers. It provides a powerful suite of tools to interact with, analyze, and test the websites you visit.

Core Features

🔄 HTTP Request Interception & Mocking

- Intercept and modify HTTP requests (XHR and Fetch) in real-time
- Mock API responses for testing and development purposes
- Record HTTP traffic and replay it later
- Profile management: Create, switch, and organize multiple mock configurations
- Deep mock matching: Configure matching depth for nested response objects
- Export recordings as a ready-to-use JavaScript library to deploy demo or offline versions of your web applications
- Tags system: Extract and display specific JSON values directly on the page via customizable lightboxes

🎬 Browser Action Recording & Replay (Spy Mode)

- Record user interactions: clicks, keyboard inputs, navigation, and scrolling
- Capture screenshots (Alt+Shift+S) with annotations during recording
- Add comments (Alt+Shift+C) to document your test scenarios
- Record by image (Alt+Shift+I): Locate elements using visual matching
- Drag & drop to reorder recorded actions
- Replay recorded sessions with visual comparison to detect UI regressions
- Synchronize HTTP mocks during replay for consistent test results
- Full iframe support for complex web applications

🔍 HTML Element Search & Highlighting

- Search for elements using CSS selectors or XPath expressions
- Highlight matching elements directly on the page
- Display custom attributes (class, id, text content, etc.)
- Real-time element counting and navigation

📡 Resource Tracking

- Track HTML tags, attributes (e.g., aria-labelledby), or text content
- Monitor specific HTTP requests and responses (e.g., analytics tags like XITI)
- Distinguish between page load and click-triggered resources
- Visual highlighting of tracked elements as you navigate
- Support for regular expressions for advanced matching

📋 JSON Tools

- JSON Formatter: Beautify and validate JSON with detailed error reporting
- JSON Viewer: Visualize JSON streams from the page as interactive trees
- JSON5 support for flexible parsing

Additional Features

- Interactive guided tours: Step-by-step onboarding for each feature
- Mouse coordinates display: Show cursor position on the page
- Dark mode: Full dark theme support
- Multilingual: English and French interfaces
- Context menus: Quick access via right-click (JSON Viewer, Screenshots, Pause/Resume)
- LZ4 compression: Automatic data compression for large recordings
- Verbose mode: Detailed logging for debugging
- Full import/export: Save and restore your entire Tuello configuration

Performance & Control

Tuello can be completely disabled while browsing and activated only when needed—ensuring zero impact on your regular browsing experience.

<img src="./img/Tuello.gif"  width=300px >

Tuello is fully free. You can thank the author by making a small donation  
[!["Donate with PayPal"](img/donate-button.png)](https://www.paypal.com/donate/?hosted_button_id=5RX4KGSTJPJDA)
