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

## Live DXP scraper result on 2026-04-27

The first live scraper now uses the TechnologyOne DXP guest session and `LocalGovernment/DxpApi/PublicApplication/Query` endpoint behind the public Application Search app:

- App URL: https://cn.t1cloud.com/apps/Applications/Search/MyServices/Application_Search
- Guest logon: `LocalGovernment/DxpApi/Guest/Logon`
- Current-month lodgements: `SelectedFilters=[{ FilterSetCode: "LodgedDate", FilterCode: "THISMONTH" }]`
- Current-month determinations: `SelectedFilters=[{ FilterSetCode: "DecisionDate", FilterCode: "THISMONTH" }]`

`node scripts/scrape-newcastle.mjs --write` fetched 144 current-month lodged rows and 361 current-month determined rows, then merged them into 433 unique Newcastle records in `data/newcastle.json`.

Known first-pass limitations:
- The public list does not expose estimated development value, applicant, or coordinates in the query response, so those fields are empty or zero for now.
- Some rows do not expose a usable property address, so their suburb remains blank and the dashboard groups them as `Unknown`.
- Decision labels are not the legal determination outcome unless the public status text explicitly says approved, refused, or withdrawn.
