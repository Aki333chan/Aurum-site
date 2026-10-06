# Community, guilds and protected administration

Code-native extension of the approved Aurum profiles and Nocturne shell. No visual rebrand. The player's main profile remains game-independent; guilds belong only to Minecraft. Minimal Russian copy, working light theme and readable mobile layouts remain binding.

## Direction contract

THESIS: Real identities and conversations, not a staff dashboard. Guild management is attached to the guild, while owner-only role management lives in a separate settings subsection.

OWN-WORLD: Inherit Inter, dark/light neutrals, gold identity and violet controls, the existing cover/portrait, rows and restrained rounded panels. No new shipping raster assets.

STORY: Open a player or guild, read its actual content, communicate or manage only what current rights allow. Private, unavailable and empty are different states.

FIRST VIEWPORT: Guild cover, smaller portrait, name and description lead into feed/roster/manage tabs. Messages show a conversation list beside the thread on desktop; phones show the list or selected thread with a back control and a composer inside the viewport. The owner sees two settings tabs: «Общие настройки» opens first with staff and personal cards; «Пользователи и роли» contains the searched, paginated user list. Ordinary players see personal settings without these owner tabs or staff cards.

FORM: Approved profile composition extended directly; seed not applicable to this specified existing-world extension. Signature interaction: explicit refresh and action feedback; no background polling, new animation or decorative metrics.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Mode: Operate. Role changes use a current-password confirmation dialog; the owner row has no demotion action. The separate roles subsection keeps its 25-user pages out of the general settings flow. Two-factor protection remains optional.

Incumbent comparison: sampled App, GuildPage, SocialPage, Feed, SiteSecuritySettings, MinecraftVisitorPage, ProfilePage and styles.css against the approved profile composition. Existing dark/light neutrals, Inter, gold emblem, violet controls, cover/portrait, sidebar and rounded rows/panels are retained. Saved incumbent mobile-light and final guild, owner-settings, messages-mobile-light and Minecraft-visitor captures agree with those sources.

Finish result: the independent review initially returned **fix** for two material issues: the message composer below the desktop/mobile viewport and missing space between the Minecraft visitor hero and summary. Both were corrected; the fresh verdict marked both **resolved** and returned **ship**. That verdict covers these two UI fixes, not exhaustive security or whole-product approval.

Verification record from the implementation session: 64 isolated HTTP/SQL checks, 22 Node unit tests, and 13 required Playwright states with 1440×900 desktop and 390×844 mobile viewports, including light theme, hidden staff controls for ordinary players, current owner protections, second acceptance using UUID request keys, and optional 2FA. The Panel regression run passed 878 tests in 61 suites. This documentation pass checked source samples and representative saved captures; it did not rerun those tests.

No new shipping raster assets were created; `apps/web/.impeccable/review/community-*.png` are synthetic QA captures. Approved profile, logo and media assets remain in place. The pre-existing absence of root/app DESIGN.md and `.impeccable/design.json`, plus the detector's existing Inter warning and decorative-grid advisory, are reported without repair or promotion into new system rules. This ordinary extension documents its surface here and preserves incumbent design authority.

## Profile feed refinement — 2026-10-06

The user removed the duplicate global-profile Posts tab: Overview is the single entry to posts, with Comments retained separately. Shared post feeds use the existing panel/border tokens, 14px corners, 20px padding and a 16px sibling gap; comments and replies keep compact rows. No content, access rules, API or data storage changed.

An isolated layout assessment confirmed the grouping and identified the intermediate-width action row risk. The bounded visual pass also found the existing profile-name column squeezed by visitor actions. Post controls now wrap as one group and profile actions use a second row at the incumbent 1160px breakpoint. The confirmation pass covered own and visitor profiles, dark/light at 390, 580, 800 and 1440px, long text, comments navigation and native reply-dialog Escape. Source/build checks and these rendered assertions passed. The single detector pass had only the pre-existing Inter/grid advisories. This record is scoped UI evidence, not a new whole-product/security verdict; no shipping raster was added.
