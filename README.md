# PixelProject

PixelProject is a professional browser-based multiplayer pixel canvas game.

The main idea is to create a huge, expanding collaborative pixel artwork where many users build individual and shared artworks on one large world canvas. The project is inspired by large-scale pixel canvas concepts, but it will have its own gameplay systems, claiming rules, economy, moderation tools, and long-term progression.

The first public development domain is:

`pixel.zappos-dev.work`

The first production server is intended for development, testing, and early low-traffic usage.

---

## Core Vision

When a user opens the website, they should see a huge white canvas that feels nearly endless. Users can move around, zoom, inspect existing artworks, and view general information without logging in.

To interact with the canvas, users must log in with a Google account. There will be no custom registration system at the beginning.

The long-term goal is to create a large living "hidden object" style pixel world, built by many users over time.

---

## Language

The entire project should initially be built in English only.

This includes:

- User interface
- Game messages
- Admin panel
- Database naming
- API naming
- Code comments
- Documentation
- Internal feature names

Multi-language support may be added later, but the first version will use English as the only active language.

---

## Authentication

The game will use Google login only.

There will be no custom email/password registration system in the first version.

When a new user logs in for the first time, the system creates a player account automatically based on the Google account data.

Stored user data should be minimal and may include:

- Google account identifier
- Email
- Display name
- Avatar URL
- Role
- Ban status
- Account creation date
- Last login date

---

## Holder System

Holders are the resource used to claim space on the canvas.

Rules:

- 1 Holder equals 1 claimable canvas pixel.
- New users start with 128 Holders.
- Users regenerate 1 Holder every 10 seconds.
- The starting Holder limit is 1,000.
- Holder regeneration should be calculated server-side based on time passed, not by running a constant timer for every user.
- Holder limits may later be increased through progression, perks, shop items, or other systems.

---

## Claim System

Users can claim areas on the canvas by spending Holders.

Claim rules:

- A claimed area can have any shape.
- A claim must be connected to an existing artwork or an existing valid canvas area.
- Claims should be connected and not consist of completely separated single pixels.
- The backend must always validate claims.
- The frontend may only provide a preview.
- Users can only place pixels inside areas they own or areas where they have been invited as contributors.

A claimed area is called an Area.

Each Area can have:

- Owner
- Contributors
- Name
- Description
- Source or reference information
- Tags
- Claim size
- Painted pixel count
- Last activity timestamp
- Expiration timestamp
- Moderation status

---

## Pixel Placement

The game uses a fixed 32-color palette.

Users do not submit custom colors. They submit a color ID from the approved palette.

Pixel placement rules:

- Users can only paint inside allowed Areas.
- Users can paint inside their own Areas.
- Invited contributors can paint inside Areas where they have permission.
- Every pixel placement must be validated by the backend.
- Pixel changes should be stored in a history system for moderation and rollback.
- Realtime updates should be sent to nearby or subscribed clients when pixels change.

---

## Coin System

Coins are the main in-game currency.

Coin rule:

- 1 first-time painted pixel gives 1 Coin.

Important anti-exploit rule:

- Coins are only awarded when a previously unpainted pixel is painted for the first time.
- Changing an already painted pixel does not give additional Coins.
- Deleting and repainting a pixel does not generate new Coins.
- Each Area can only generate as many Coins as the total number of claimed pixels in that Area.

Example:

A claimed Area with 10,000 pixels can generate a maximum of 10,000 Coins in total.

If multiple users work on the same Area, the Coin goes to the user who first paints the specific pixel.

---

## Shop System

A shop system is planned for a later stage.

The shop currency will be Coins.

Possible shop item categories:

- Temporary boosters
- Permanent perks
- Holder packs
- Cosmetics
- Profile cosmetics
- Area cosmetics
- Contributor-related upgrades
- Overlay/template-related upgrades

Possible booster ideas:

- Faster Holder regeneration for a limited time
- Reduced pixel cooldown for a limited time
- Temporary convenience upgrades

Possible permanent perk ideas:

- Increased Holder limit
- More saved templates
- More active Areas
- More contributor slots
- More customization options

The shop design is not final yet and should be balanced carefully to avoid unfair pay-to-win mechanics.

---

## Overlay Tool

The Overlay Tool is one of the most important planned features.

Users should be able to upload an image and use it as a template for claiming and painting.

Overlay workflow:

1. User uploads an image.
2. The system analyzes the image.
3. Transparent pixels are ignored.
4. Non-transparent pixels are converted into a claim mask.
5. The system calculates how many Holders are required.
6. The user can move, scale, and adjust the preview.
7. The user confirms the claim.
8. The backend validates the final claim.
9. The image becomes a pixel template for the Area.
10. The user can paint the artwork manually using the template as guidance.

Transparency rule:

- Fully transparent pixels do not count as claim pixels.
- Semi-transparent pixels should only count if they pass a defined alpha threshold.
- A recommended alpha threshold is 128.

The uploaded image should be converted to the fixed 32-color palette.

The template should help the player see:

- Which color belongs to each pixel
- Which pixels are still missing
- Which pixels are already correct
- Which pixels have the wrong color
- Area progress percentage
- Remaining paintable pixels
- Remaining possible Coins

The template should not automatically fill the artwork in the first version. Players should still manually place the pixels.

---

## Claim Editor Tools

The Claim Editor should provide tools that make it easier to create shapes.

Planned tools:

- Pencil tool
- Eraser tool
- Rectangle tool
- Line tool
- Circle or ellipse tool
- Fill tool
- Symmetry or mirror tool
- Overlay import tool

The symmetry tool should allow users to create mirrored or geometric shapes more easily.

Possible symmetry modes:

- Horizontal mirror
- Vertical mirror
- Horizontal and vertical mirror
- 4-way radial symmetry
- 8-way radial symmetry

The editor should always show:

- Selected pixel count
- Required Holders
- Available Holders
- Claim validity
- Connection status to existing artwork

---

## Area Inactivity

Each Area has an inactivity timer.

Rule:

- If an Area has no pixel activity for 3 days, all unpainted claimed pixels are released.
- Already painted pixels remain claimed and visible.
- The 3-day timer resets whenever someone places a pixel inside the Area.
- Only inactivity should trigger this automatic release behavior.

This system should be handled by a backend worker, not by the frontend.

---

## Contributors

Area owners can invite other users to help paint an Area.

Contributor rules:

- The owner can invite users.
- Contributors can paint inside the Area.
- Contributors earn Coins for pixels they personally paint for the first time.
- The owner can remove contributors.
- Contributor actions are logged.
- GM staff can inspect all contributor activity.

---

## Reports and Moderation

Users can report canvas areas.

Report reasons may include:

- Inactivity
- Doxxing
- Botting
- Inappropriate content
- Hate speech
- Other

Reports are reviewed by Game Masters or Admins.

A report should include:

- Reporter
- Reported Area
- Optional reported user
- Selected canvas coordinates
- Reason
- Description
- Status
- Priority
- Created date
- Review data

GM staff should be able to inspect:

- Reported canvas area
- Area owner
- Contributors
- Pixel history
- User activity
- Previous reports
- Related audit logs

Possible GM actions:

- Ignore report
- Mark report as reviewed
- Warn user
- Temporarily ban user
- Permanently ban user
- Remove selected user pixels
- Remove full Area
- Hide Area
- Lock Area
- Release claim
- Ban selected contributors
- Ban all contributors
- Restore previous state
- Escalate to Admin

For severe rule violations, such as hate symbols, doxxing, or coordinated abuse, a GM must be able to remove the full Area with one action and optionally ban all involved users.

Deleted or hidden moderation content should not be fully erased from the database immediately. It should remain internally available for evidence, audit logs, appeals, and admin review.

---

## Live Updates and Maintenance Controls

The game should support configurable live update behavior.

Admins should be able to disable or limit specific live systems without shutting down the entire website.

Examples:

- Disable live pixel updates temporarily
- Disable pixel placement in selected Areas
- Disable pixel placement globally
- Disable claiming temporarily
- Disable reporting temporarily
- Disable shop purchases temporarily
- Lock specific chunks
- Lock specific Areas
- Put selected canvas regions into maintenance mode
- Keep canvas viewing enabled while editing or maintenance is active

The goal is to allow maintenance, balancing changes, migrations, and emergency moderation without taking the full game offline.

The system should support feature flags or maintenance flags for important gameplay systems.

---

## Mobile Browser Support

The game should work well on mobile browsers.

There is no native app planned for the first version.

Mobile support should include:

- Touch movement
- Pinch zoom
- Tap to interact
- Long press for context menus
- Mobile-friendly toolbar
- Large buttons
- Bottom-sheet style menus
- Compact status display
- Optimized canvas interaction

The mobile version should not simply be a smaller desktop layout. It should have its own practical interaction design.

---

## Technical Direction

The project should be built with a professional, scalable structure so multiple developers can work on it later.

Planned technical direction:

- Frontend: Next.js, React, TypeScript
- Canvas rendering: WebGL-based rendering, for example PixiJS
- Backend: FastAPI with Python
- Database: PostgreSQL
- Cache and realtime support: Redis
- Realtime communication: WebSockets
- Deployment: Docker Compose
- Reverse proxy: Nginx or Caddy
- Server: Root server
- Initial production domain: pixel.zappos-dev.work

The final stack may still be adjusted during development, but the project should be structured from the beginning like a serious long-term web game.

---

## Canvas Architecture

The canvas should not be stored or loaded as one huge image.

The world should be divided into chunks.

Current gameplay chunk rules:

- Active gameplay chunks are `4,000 x 4,000` canvas pixels.
- The world starts with one active chunk at the `0:0` origin.
- When claimed Holder pixels reach `70%` of the current active field, the active field expands.
- Expansion alternates around the origin: one chunk, diamond/cross radius 1, square radius 1, diamond/cross radius 2, and so on.

Rendering can still use smaller internal tiles or cached images, such as the current Wplace-style `1,000 x 1,000` PNG tiles.

The client only loads visible chunks.

Benefits:

- Better performance
- Better caching
- Easier realtime updates
- Easier moderation
- Easier maintenance mode per region
- Easier scaling later

---

## Code Quality Goals

The project should be cleanly structured and easy to extend.

Important rules:

- English naming everywhere
- Clear folder structure
- Clear module boundaries
- Clean comments where helpful
- No mixed gameplay logic inside UI components
- Backend validation for all important actions
- Database migrations
- Audit logs for important actions
- Separate services for auth, claims, pixels, reports, shop, and moderation
- Feature flags for systems that may need to be disabled
- Good documentation for future developers

The goal is to make future features easy to add without searching through messy code.

---

## Planned Main Modules

The project should be split into clear modules:

- Auth System
- User System
- Holder System
- Coin System
- Canvas Chunk System
- Claim System
- Claim Editor
- Pixel Placement System
- Overlay Template System
- Contributor System
- Report System
- GM Moderation System
- Shop System
- Feature Flag System
- Maintenance Mode System
- Mobile UI System
- Admin Panel
- Audit Log System

---

## MVP Roadmap

### MVP 1: Project Foundation

- Docker setup
- Frontend setup
- Backend setup
- PostgreSQL setup
- Reverse proxy
- HTTPS
- Basic deployment on the root server

### MVP 2: Canvas Viewer

- Infinite white canvas
- Chunk loading
- Zoom
- Pan
- Demo pixels
- Mobile touch movement

### MVP 3: Google Login

- Google OAuth login
- Automatic user creation
- Session handling
- User roles
- Start Holders
- Holder regeneration
- Holder limit

### MVP 4: Claim Editor Basics

- Pencil tool
- Eraser tool
- Rectangle tool
- Holder cost display
- Claim preview
- Backend claim validation
- Area creation

### MVP 5: Pixel Placement

- 32-color palette
- Pixel placement inside owned Areas
- Coin reward for first-time painted pixels
- Pixel history
- Area progress tracking

### MVP 6: Overlay Tool

- Image upload
- Transparency detection
- 32-color conversion
- Claim mask generation
- Template overlay
- Progress comparison

### MVP 7: Contributor System

- Invite contributors
- Contributor permissions
- Contributor pixel placement
- Contributor Coin rewards
- Remove contributors

### MVP 8: Reports and GM Panel

- Report canvas area
- Report queue
- GM review interface
- Pixel history inspection
- User punishment tools
- Area removal tools
- Claim release tools

### MVP 9: Inactivity System

- 3-day inactivity timer
- Reset timer on pixel activity
- Release unpainted pixels
- Keep painted pixels
- Worker-based cleanup

### MVP 10: Shop Foundation

- Coin display
- Shop item structure
- Purchase history
- First basic shop items
- Future booster and cosmetic support

---

## Long-Term Features

Possible future features:

- Alliances
- Alliance Areas
- Advanced shop
- Seasonal events
- Rankings
- Public profiles
- Area showcases
- Moderation appeals
- Multi-language support
- Advanced analytics
- CDN-based chunk delivery
- More advanced anti-bot systems
- Public API for selected game data

---

## Current Project Status

The project is currently in early implementation with both local development and a first production server.

The current goal is to turn the planning into a stable local foundation while keeping the long-term architecture clean.

Current implementation highlights:

- Local Docker development stack
- First production Docker Compose deployment on `https://pixel.zappos-dev.work`
- Frontend and backend foundation
- PostgreSQL and Redis integration
- Single active starter chunk at the `0:0` origin
- Staged world growth based on `70%` claimed Holder coverage
- First visible world preview in the frontend

The next major implementation goals are still to define and build:

- Game rules
- Technical architecture
- Database structure
- API structure
- Realtime behavior
- Moderation workflows
- Deployment structure
- Development standards

This transition phase is important because the project should become professional, scalable, and understandable for multiple developers in the future.

---

## Local Development Bootstrap

The repository now includes a first local development foundation:

- `frontend/` for Next.js and React
- `backend/` for FastAPI
- `docker-compose.yml` for local PostgreSQL, Redis, backend, and frontend
- `docs/project-foundation.md` for the first confirmed technical decisions

### First Local Start

1. Copy `.env.example` to `.env`
2. Run `docker compose up --build`
3. Open `http://localhost:3000`
4. Open `http://localhost:8000/docs` for the backend API docs

### Local Google OAuth Setup

To test Google login locally, also fill these values in `.env`:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback`
- `FRONTEND_APP_URL=http://localhost:3000`

The Google OAuth client should allow at least:

- `http://localhost:8000/api/v1/auth/google/callback` as an authorized redirect URI
- `http://localhost:3000` as an authorized JavaScript or app origin when required by the Google project setup

This foundation is intentionally focused on project structure, local startup, and world bootstrapping so the gameplay systems can now be added step by step.

## Project Status Tracking

The ongoing implementation status is tracked in:

- `README.md` for the main product and architecture vision
- `docs/project-foundation.md` for confirmed technical decisions
- `docs/project-status.md` for the current local implementation snapshot
- `docs/production-deployment.md` for the first production server, DNS, Caddy, backups and deploy notes
- `docs/changelog.md` for release-by-release change tracking
