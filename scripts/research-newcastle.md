# City of Newcastle DA Scraping Research

Last updated: 2026-04-27

## Public tracker sources

City of Newcastle currently splits DA tracking across two systems:

1. Current Application Tracker
   - URL: https://cn.t1cloud.com/apps/OnAMap/MyServices/On_A_Map_-_DA_Tracker
   - Coverage noted by council: applications lodged or determined after 28 January 2026.
   - Platform observed: TechnologyOne OnAMap JavaScript app.
   - Scraper implication: inspect browser network traffic and bundled app configuration to find a JSON/API source before falling back to browser automation.

2. Historical Application Tracker
   - Search URL: https://cn-web.t1cloud.com/T1PRDefault/WebApps/eProperty/P1/eTrack/eTrackApplicationSearch.aspx?f=%24P1.ETR.SEARCH.ENQ&r=TCON.LG.WEBGUEST
   - Result pages include period searches such as submitted last 28 days and determined last 28 days.
   - Scraper implication: this is the safer first parser target because it returns server-rendered HTML.

## Initial historical URLs

Submitted last 28 days:
https://cn-web.t1cloud.com/T1PRDefault/WebApps/eProperty/P1/eTrack/eTrackApplicationSearchResults.aspx?Field=S&Period=L28&f=%24P1.ETR.SEARCH.SL28&r=TCON.LG.WEBGUEST

Determined last 28 days:
https://cn-web.t1cloud.com/T1PRDefault/WebApps/eProperty/P1/eTrack/eTrackApplicationSearchResults.aspx?Field=D&Period=L28&f=%24P1.ETR.SEARCH.DL28&r=TCON.LG.WEBGUEST

## Data boundary for first pass

Collect listing-level metadata only:
- application id/reference
- address and suburb when available
- description/application type
- lodgement date
- determination date and decision where available
- estimated value when available
- source URL and scrape timestamp

Do not collect or download documents, attachments, plans, assessment reports, or submissions in the first pass.

## Normalisation target

The dashboard expects records shaped like the files in `data/*.json`:
- `id`, `council`, `suburb`, `address`, `applicant`, `type`, `value`, `lodged`, `status`, `decision`, `changedYesterday`, `changeType`, `changeSummary`, `lat`, `lng`, `tags`
- audit fields: `sourceCouncil`, `sourceSystem`, `sourceUrl`, `scrapedAt`, optional `raw`

## Open questions for implementation

- Confirm whether the new OnAMap tracker exposes an unauthenticated JSON endpoint. The shell loads `envVar.json`, then JavaScript bundles; endpoint discovery should happen from network traffic or bundle search.
- Confirm exact historical eTrack row markup. The initial scraper entry point fetches and reports candidate rows, but parser hardening should happen against saved HTML snapshots or live output.
- Add geocoding later. The first scraper should not invent coordinates; leave `lat` and `lng` null unless the source provides geometry.

## Public use note

Dashboard copy and downstream exports should treat scraped tracker data as a convenience view of public council records. Council portals remain the authoritative source for legal status, plans, conditions, and formal notices.

## Dry-run result on 2026-04-27

`scripts/scrape-newcastle.mjs` successfully fetched both historical eTrack last-28-days result pages. The conservative parser found zero application-reference rows on both pages and ignored the `Search Dates 31/03/2026 to 27/04/2026` banner as page chrome.

Next parser step: inspect a historical eTrack search page known to contain records, or search by a specific Newcastle application reference, then harden row extraction against that markup before writing live records into `data/newcastle.json`.
