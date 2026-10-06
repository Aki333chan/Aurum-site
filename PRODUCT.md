# Aurum Site

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React/Vite frontend and a separate Node API with its own PostgreSQL database, reusing the team's established Aurum Panel development conventions without sharing player and staff sessions.

## Users

Players of Aurum game servers, initially Minecraft Paper; guild leaders and officers; site moderators and administrators.

## Product Purpose

A public-facing community site at `aurumgg.ovh`. Players create a site account, verify email, optionally enable two-factor authentication, link game identities, and see their server-specific profiles. The site also hosts server news, a guild directory, guild feeds, player profile comments, friends and direct messages. Staff have separate moderation and administration tools.

## Positioning

One site identity joins several game profiles while game plugins remain authoritative for identity, guild membership, ranks, and money. The site is not another game database or a second administrator panel.

## Operating Context

After signing in, players land on a global home with game cards and a shared community news feed. The global Servers section lists game worlds; choosing Minecraft opens its server space. Overview and Guilds are contextual tabs within that server space, not extra entries in global navigation. The game-specific feed lives there, not on the global home. Minecraft players obtain a short-lived, single-use link code with an in-game command after AurumAuth has authenticated them; the chat message also offers a link to the site. Players can browse Minecraft guilds, subject to each guild's privacy settings, and use website features even when not in-game where the bridge safely supports it.

## Capabilities and Constraints

- Separate Git repository `aurum-site`; the existing Aurum Panel and Companion provide only narrowly scoped private bridges to game data. The staff panel's user accounts, cookies, and administrator token are not shared with players.
- Email verification is required to complete public registration and before the first login. The one owner account may be bootstrapped as verified while SMTP is unavailable, with public registration disabled. Minecraft linking is separate and available only after signing in. Password recovery depends on SMTP; TOTP and one-use recovery codes are optional for all accounts, recommended for staff, not forcibly enabled.
- Only the pinned owner may grant/revoke site administrators, with current-password confirmation and an audit record. The owner cannot be demoted from the UI. Roles appear in their own owner-only settings subsection, not above all personal/site settings. No site role automatically grants game or panel privileges. Moderator/custom roles remain a future decision.
- Each player chooses a unique site nickname during registration. It is independent of the Minecraft nickname, which is shown separately after linking; email is not a public nickname.
- Minecraft first; other games may be added later with separate identity-linking adapters.
- Guild catalog lists every guild. Guild leaders may restrict member roster and extended information to members. Guild feeds may be readable publicly or by members; posting can be limited to selected in-game ranks.
- Server news is published by authorized site staff. Player-profile comments can be open to signed-in users, limited to mutually accepted friends, or disabled, per linked game profile.
- Player pages and comments are visible only to signed-in site users. The global site profile shows account identity and linked game profiles, but guild membership belongs only to the Minecraft profile. Balances and detailed player statistics are visible only to their owner by default. Email, IP addresses, and security settings are never public profile fields.
- Guild membership, ranks, invitations, applications, and guild actions are authoritative in AurumGuilds. Feed content, comments, friends, and site privacy settings live in Aurum Site.
- Social content needs pagination, reports, blocking, moderation, and safe text rendering from its first public release.
- The current VDS is small (1 vCPU / 6 GiB), so the site must avoid constant polling of the Paper server or costly per-page reads.

## Brand Commitments

Use the Aurum name and recognizable gold emblem. The existing staff panel uses a Nocturne dark visual language with a muted violet accent; the player site should feel related without looking like an administrator dashboard. The user approved the current palette; the site also needs a persistent light-theme switch in the lower-left navigation.

## Evidence on Hand

The existing panel in the `images` repository contains the Aurum emblem and Nocturne tokens. AurumLink is already deployed with a distinct five-minute single-use proof of authenticated game identity, and the owner has verified a real link. SMTP, email confirmation and registration have been verified by the user. AurumGuilds supports a guild list and three ranks (leader, officer, member); the 0.6.0 API adds narrow website actions checked against current membership and rank. Site community pages use real server responses and site PostgreSQL content; synthetic screenshot fixtures are QA only. Avatar/cover bytes are replaced in place rather than archived.

## Product Principles

- Game state stays authoritative in the game plugins; the website presents and requests bounded actions.
- Privacy choices are understandable per guild and per game profile.
- A useful experience remains available without any client-side Minecraft mod.
- A lightweight interface and bounded bridge calls protect the game server.

## Open Decisions

- Confirm whether the website starts only in Russian or launches with Russian, Polish, and English.
- Agree future staff roles and account bans, data export/deletion flows, and bounded retention policies. Never read private messages through ordinary site administration.
