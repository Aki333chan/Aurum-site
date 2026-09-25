# Aurum Site

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React/Vite frontend and a separate Node API with its own PostgreSQL database, reusing the team's established Aurum Panel development conventions without sharing player and staff sessions.

## Users

Players of Aurum game servers, initially Minecraft Paper; guild leaders and officers; site moderators and administrators.

## Product Purpose

A public-facing community site at `aurumgg.ovh`. Players create a site account, verify email, optionally enable two-factor authentication, link game identities, and see their server-specific profiles. The site also hosts server news, a guild directory, guild feeds, player profile comments, and eventually direct messages. Staff have separate moderation and administration tools.

## Positioning

One site identity joins several game profiles while game plugins remain authoritative for identity, guild membership, ranks, and money. The site is not another game database or a second administrator panel.

## Operating Context

After signing in, players first see server cards and open a game-specific profile from a card. Minecraft players obtain a short-lived, single-use link code with an in-game command after AurumAuth has authenticated them; the chat message also offers a link to the site. Players can browse all guilds, subject to each guild's privacy settings, and use website features even when not in-game where the bridge safely supports it.

## Capabilities and Constraints

- Separate Git repository `aurum-site`; the existing Aurum Panel and Companion provide only narrowly scoped private bridges to game data. The staff panel's user accounts, cookies, and administrator token are not shared with players.
- Email registration and verification; password recovery; optional player 2FA and required staff 2FA.
- Minecraft first; other games may be added later with separate identity-linking adapters.
- Guild catalog lists every guild. Guild leaders may restrict member roster and extended information to members. Guild feeds may be readable publicly or by members; posting can be limited to selected in-game ranks.
- Server news is published by authorized site staff. Player-profile comments can be open to signed-in users, limited to mutually accepted friends, or disabled, per linked game profile.
- Player pages and comments are visible only to signed-in site users. Balances and detailed player statistics are visible only to their owner by default. Email, IP addresses, and security settings are never public profile fields.
- Guild membership, ranks, invitations, applications, and guild actions are authoritative in AurumGuilds. Feed content, comments, friends, and site privacy settings live in Aurum Site.
- Social content needs pagination, reports, blocking, moderation, and safe text rendering from its first public release.
- The current VDS is small (1 vCPU / 6 GiB), so the site must avoid constant polling of the Paper server or costly per-page reads.

## Brand Commitments

Use the Aurum name and recognizable gold emblem. The existing staff panel uses a Nocturne dark visual language with a muted violet accent; the player site should feel related without looking like an administrator dashboard. Exact visual direction has not been approved.

## Evidence on Hand

The existing panel in the `images` repository contains the Aurum emblem and Nocturne tokens. Companion already has a five-minute one-use web token mechanism, but a player-site link token must have its own purpose and stricter authentication boundary. AurumGuilds supports a guild list and three ranks (leader, officer, member). The new site repository currently has no implementation or real site content. Any preview data must be labeled as demonstration data.

## Product Principles

- Game state stays authoritative in the game plugins; the website presents and requests bounded actions.
- Privacy choices are understandable per guild and per game profile.
- A useful experience remains available without any client-side Minecraft mod.
- A lightweight interface and bounded bridge calls protect the game server.

## Open Decisions

- Confirm whether the website starts only in Russian or launches with Russian, Polish, and English.
- Confirm the visual direction after reviewing the first screenshot.
